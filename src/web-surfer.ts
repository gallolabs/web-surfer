import { Type, Static } from '@sinclair/typebox'
import jsonata from 'jsonata'
import {Ajv} from 'ajv'
import { Browser, BrowserContext, BrowserType, Page, firefox, webkit, chromium } from 'playwright'
import { readFile, writeFile } from 'fs/promises'

const browsersSchema = Type.Union([Type.Literal('firefox'), Type.Literal('chrome'), Type.Literal('chromium'), Type.Literal('webkit')])

type BrowserName = Static<typeof browsersSchema>

export const webSurferConfigSchema = Type.Object({
    defaultBrowser: browsersSchema,
    browserLaunchers: Type.Record(browsersSchema, Type.String())
})

export const webSurfDefinitionSchema = Type.Object({
    variables: Type.Optional(Type.Record(Type.String(), Type.Any())),
    expression: Type.String()
})

export type WebSurfDefinitionSchema = Static<typeof webSurfDefinitionSchema>

export type WebSurferConfig = Static<typeof webSurferConfigSchema>

export type WebSurfResult = any

export class WebSurfRuntimeError extends Error {
    name = 'WebSurfError'
    details: any
    constructor(message: string, {details, ...options}: ErrorOptions & {details: any}) {
        super(message, options)
        this.details = details
    }
}

export class InvalidWebSurfDefinitionError extends Error {
	name = 'InvalidWebSurfDefinitionError'
}

type Method = (...args: any[]) => any;

interface SurfQLApiItem {
	description: string
	arguments: any[]
	returns: any
}

const surfQLApi: Record<string, SurfQLApiItem> = {}

function api(desc: SurfQLApiItem): Method {
	return <T extends Method>(value: T): Method => {
		const fnName = value.name

		// @ts-ignore
		surfQLApi[fnName] = desc

		return function (this: any, ...args: any[]): T {

			for (let schema of desc.arguments) {
				schema = Type.Tuple(schema)
				const validate = (new Ajv).compile(schema)

				if (validate(args)) {
					return value.call(this, ...args) as unknown as T;
				}
			}

			throw new InvalidWebSurfDefinitionError(fnName + ' : invalids arguments')
		};
	};
}

const defaultI18nPreset = 'FR'

const i18nMap: Record<string, {
	proxies: Array<{server: string, healthy: boolean | undefined}>,
	locale: string,
	timezoneId: string
	geolocation: any
}> = {
    FR: {
        proxies: [],
        locale: 'fr_FR',
        timezoneId: 'Europe/Paris',
        geolocation: {latitude: 48.8631899, longitude: 2.3556759}
    },
    ES: {
        proxies: [{
            server: 'http://195.114.209.50:80',
            healthy: undefined
        }],
        locale: 'es_ES',
        timezoneId: 'Europe/Madrid',
        geolocation: {latitude: 40.4380986, longitude: -3.8443431}
    }
}

class WebSurf {
	protected browsers: Record<string, Browser> = {}
	protected contexts: BrowserContext[] = []
	protected currentBrowser?: Browser
	protected currentContext?: BrowserContext
	protected currentPage?: Page
	protected config: WebSurferConfig

	constructor(config: WebSurferConfig) {
		Object.keys(surfQLApi).forEach(fn => {
			const methodName = fn.substring(1)
			// @ts-ignore
			this[methodName] = this[methodName].bind(this)
		})
		this.config = config
	}

	public async destroy() {
		// To do end contexts and browsers
		const errs: any[] = []
		await Promise.all(this.contexts.map(c => c.close().catch(e => errs.push(e))))
		await Promise.all(Object.keys(this.browsers).map(bn => this.browsers[bn].close().catch(e => errs.push(e))))

		if (errs.length > 0) {
			throw new Error('Destroy problem', {cause: errs})
		}
	}

	public hasCurrentPage() {
		return !!this.currentPage
	}

	@api({
		description: 'Start surfing :)',
		arguments: [[
			Type.Optional(Type.Object({
				browser: Type.Optional(browsersSchema),
				session: Type.Optional(Type.Object({
					id: Type.String(),
					ttl: Type.Integer()
				}, {description: 'The surf session'})),
				i18nPreset: Type.Optional(Type.String({description: 'The preset for i18n (timezone, locale, geoloc)'}))
			}, {title: 'options', description: 'Surf options'}))
		]],
		returns: undefined
	})
	public async $startSurfing(
		{browser: browserName, session, i18nPreset: i18nPresetName}:
		{browser?: BrowserName, session?: { id: string, ttl: number}, i18nPreset?: string} = {}
	) {
		const browser = await this.getBrowser(browserName)
		this.currentBrowser = browser

		const sessionContent = session ? await this.readSession(session.id) : undefined

		const i18nPreset = i18nMap[i18nPresetName || defaultI18nPreset]

		if (!i18nPreset) {
			throw new InvalidWebSurfDefinitionError('Unknwon i18n preset')
		}

		const context = await browser.newContext({
           // ...devices['Desktop Firefox'],
            viewport: { width: 1920, height: 945 },
            screen: { width: 1920, height: 1080 },
            storageState: sessionContent as any,
            ...i18nPreset && {
            	...i18nPreset,
            	proxy: i18nPreset.proxies.filter(p => p.healthy)[0]
            }
        })

        context.setDefaultTimeout(5000)

        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined})
        })

        if (session) {
        	context.once('close', async () => this.writeSession(session.id, session.ttl, await context.storageState()))
        }

		this.contexts.push(this.currentContext = context)
	}

	protected async writeSession(id: string, ttl: number, content: object) {
		await writeFile(id + '.json', JSON.stringify({
			expires: (new Date).getTime() + ttl,
			content
		}, null, 2))
	}

	protected async readSession(id: string) {
		try {
			const data: {expires: number, content: object} = JSON.parse(await readFile(id + '.json', {encoding: 'utf8'}))

			if (data.expires <= (new Date).getTime()) {
				return
			}

			return data.content
		} catch (e) {
			if ((e as any).code === 'ENOENT') {
				return
			}
			throw e
		}
	}

	@api({
		description: 'Go to URL',
		arguments: [[
			Type.String({title: 'url', description: 'The url you want to reach'}),
			Type.Optional(Type.Object({}, {title: 'options', description: 'options'}))
		]],
		returns: undefined
	})
	public async $goto(url: string, {referer}: {referer?: string} = {}) {
		const page = await this.getCurrentPage()
		const response = await page.goto(url, {referer})

        if (response && (response.status() >= 300 || response.status() < 200)) {
            throw new Error('Invalid status ' + response.status())
        }

        await page.waitForTimeout(1000);

        await page.mouse.move(500, 600, { steps: 10 });

        await page.evaluate(() => {
            window.scrollBy(0, window.innerHeight / 2);  // Scroller la page
        });
	}

	@api({
		description: 'Read current URL',
		arguments: [[]],
		returns: Type.String({description: 'The url'})
	})
	public async $readUrl(): Promise<string> {
		const page = await this.getCurrentPage()
		return await page.url()
	}

	@api({
		description: 'Take a screenshot',
		arguments: [[]],
		returns: {type: 'binary', description: 'The screenshot'}
	})
	public async $screenshot(): Promise<Buffer> {
		const page = await this.getCurrentPage()
		return await page.screenshot()
	}

	protected async getCurrentPage(): Promise<Page> {
		if (!this.currentPage) {
			const context = await this.getCurrentContext()
			this.currentPage = await context.newPage()
		}
		return this.currentPage
	}

	protected async getCurrentContext(): Promise<BrowserContext> {
		if (!this.currentContext) {
			await this.$startSurfing()
		}
		return this.currentContext!
	}

	protected async getCurrentBrowser(): Promise<Browser> {
		if (!this.currentBrowser) {
			this.currentBrowser = await this.getBrowser()
		}
		return this.currentBrowser
	}

	protected async getBrowser(browserName?: BrowserName): Promise<Browser> {
	    browserName = browserName || this.config.defaultBrowser

		if (!this.browsers[browserName]) {
			const browserOpts = {
              headless: false,
              args: [
                "--full-screen", "--use-gl=angle", "--use-angle=gl", "--enable-unsafe-webgpu", '-use-angle=swiftshader',
                /*"--lang=fr_FR", "--accept-lang=fr-FR",*/ "--disable-blink-features=AutomationControlled"
              ],
              devtools: false
            }
			const browserOptsStr = encodeURIComponent(JSON.stringify(browserOpts))
			const browser = await this
				.getPlayrightLib(browserName)
				.connect(this.config.browserLaunchers[browserName].replace('{options}', browserOptsStr))
			this.browsers[browserName] = browser
		}
		return this.browsers[browserName]
	}

	protected getPlayrightLib(browserName: BrowserName): BrowserType {
		return {
			firefox,
			chromium,
			webkit,
			chrome: chromium
		}[browserName]
	}
}

export class WebSurfer {
    protected config: WebSurferConfig

    constructor(config: WebSurferConfig) {
        this.config = config
    }

    public async surf(surfDefinition: WebSurfDefinitionSchema): Promise<WebSurfResult> {
		const parsedExpression = this.parseExpression(surfDefinition.expression)
		const variables = surfDefinition.variables || {}
		const surf = new WebSurf(this.config)

		try {
			return await parsedExpression.evaluate(variables, surf)
		} catch (e) {
			if (e instanceof Object && !(e instanceof Error) && (e as any).code && (e as any).token) {
				const jsonataError: {code: string, token: string, message: string} = e as any

				if (jsonataError.code === 'T1006') {
					throw new InvalidWebSurfDefinitionError((e as Error).message + ' ('+(e as any).token+')')
				}

				throw jsonataError
			}

			let screenshot
			if (surf.hasCurrentPage()) {
				try { screenshot = await surf.$screenshot() } catch (e) { screenshot = (e as Error).message }
			}

			if (e instanceof Error && (e as any).token && (e as any).position !== undefined) {
				const jsonataError: {token: string, message: string} = e as any

				throw new WebSurfRuntimeError(jsonataError.token + ' : ' + jsonataError.message, {cause: e, details: {
					screenshot
				}})
			}

			throw new WebSurfRuntimeError((e as Error).message, {cause: e, details: {
				screenshot
			}})

		} finally {
			surf.destroy().catch(console.error)
		}
    }

    protected parseExpression(expression: string): jsonata.Expression {
    	try {
    		return jsonata('(' + expression + ')')
    	} catch (e) {
    		throw new InvalidWebSurfDefinitionError((e as Error).message)
    	}
    }

}

export const surfQLApiDoc = surfQLApi
