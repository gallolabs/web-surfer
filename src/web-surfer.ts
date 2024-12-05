import { Type, Static } from '@sinclair/typebox'
//import { firefox, webkit, chromium/*, devices */} from 'playwright'
import jsonata from 'jsonata'
import {Ajv} from 'ajv'
import { Browser, BrowserContext, BrowserType, Page, firefox } from 'playwright'

const browsersSchema = Type.Union([Type.Literal('firefox'), Type.Literal('chrome'), Type.Literal('chromium'), Type.Literal('webkit')])

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

const surfQLApi = {}

function api(desc: any): Method {
	return <T extends Method>(value: T): Method => {
		// @ts-ignore
		surfQLApi['$' + value.name] = desc

		return function (this: any, ...args: any[]): T {

			for (let schema of desc.arguments) {
				schema = Type.Tuple(schema)
				const validate = (new Ajv).compile(schema)

				if (validate(args)) {
					return value.call(this, ...args) as unknown as T;
				}
			}

			throw new InvalidWebSurfDefinitionError(value.name + ' : invalids arguments')
		};
	};
}

class WebSurf {
	protected browsers: Record<string, Browser> = {}
	protected currentBrowser?: Browser
	protected currentContext?: BrowserContext
	protected currentPage?: Page
	protected config: WebSurferConfig

	constructor(config: WebSurferConfig) {
		this.goto = this.goto.bind(this)
		this.config = config
	}

	@api({
		description: 'Go to URL',
		arguments: [[Type.String()]],
		returns: undefined
	})
	public async goto(url: string) {
		const page = await this.getCurrentPage()
		await page.goto(url)
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
		}
		return this.currentContext
	}

	protected async getCurrentBrowser(): Promise<Browser> {
		if (!this.currentBrowser) {
			const browserName = this.getBrowserName()
			const browserOpts = encodeURIComponent(JSON.stringify({}))
			this.currentBrowser = await this
				.getPlayrightLib(browserName)
				.connect(this.config.browserLaunchers[browserName].replace('{options}', browserOpts))
		}
		return this.currentBrowser
	}

	protected getBrowserName(): 'firefox' {
		return 'firefox'
	}

	protected getPlayrightLib(browserName: 'firefox'): BrowserType {
		return {
			firefox
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

		try {
			return await parsedExpression.evaluate(variables, new WebSurf(this.config))
		} catch (e) {
			if ((e as any).code === 'T1006') {
				throw new InvalidWebSurfDefinitionError((e as Error).message + ' ('+(e as any).token+')')
			}
			throw e
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

console.log('API', surfQLApi)
