import { Type, Static } from '@sinclair/typebox'
import jsonata from 'jsonata'
import {Ajv} from 'ajv'
import { Browser, BrowserContext, BrowserType, Page, firefox, webkit, chromium } from 'playwright'

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
		surfQLApi['$' + fnName] = desc

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
		description: 'Go to URL',
		arguments: [[
			Type.String({title: 'url', description: 'The url you want to reach'}),
			Type.Optional(Type.Object({}, {title: 'options', description: 'options'}))
		]],
		returns: undefined
	})
	public async goto(url: string) {
		const page = await this.getCurrentPage()
		await page.goto(url)
	}

	@api({
		description: 'Take a screenshot',
		arguments: [[]],
		returns: {type: 'binary', description: 'The snapshot'}
	})
	public async screenshot() {
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
			const browser = await this.getCurrentBrowser()
			this.currentContext = await browser.newContext()
			this.contexts.push(this.currentContext)
		}
		return this.currentContext
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
			const browserOpts = encodeURIComponent(JSON.stringify({}))
			const browser = await this
				.getPlayrightLib(browserName)
				.connect(this.config.browserLaunchers[browserName].replace('{options}', browserOpts))
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
				try { screenshot = await surf.screenshot() } catch (e) { screenshot = (e as Error).message }
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
