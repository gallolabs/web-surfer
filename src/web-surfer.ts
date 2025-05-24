import { Type, Static } from '@sinclair/typebox'
import jsonata from 'jsonata'
import {Ajv} from 'ajv'
import { Browser, BrowserContext, BrowserType, Page, firefox, webkit, chromium } from 'playwright'
import { OptionalKind } from '@sinclair/typebox'
import dayjs, { Dayjs } from 'dayjs'
import { cloneDeep, map } from 'lodash-es'
import SessionsHandler from './sessions.js'
import got from 'got'

const browsersSchema = Type.Union([Type.Literal('firefox'), Type.Literal('chrome'), Type.Literal('chromium'), Type.Literal('webkit')])

type BrowserName = Static<typeof browsersSchema>

export const webSurferConfigSchema = Type.Object({
    defaults: Type.Optional(Type.Object({
        browser: Type.Optional(browsersSchema),
        timezone: Type.Optional(Type.String()),
        locale: Type.Optional(Type.String())
    })),
    browserLaunchers: Type.Partial(Type.Record(browsersSchema, Type.String()))
})

export const webSurfDefinitionSchema = Type.Object({
    input: Type.Optional(Type.Any()),
    outputMimeType: Type.Optional(Type.String()),
    imports: Type.Optional(Type.Record(Type.String(), /* webSurfDefinitionSchema */ Type.Any())),
    expression: Type.String(),
    schemas: Type.Optional(Type.Object({
        input: Type.Optional(Type.Any()),
        output: Type.Optional(Type.Any())
    }))
})

export type WebSurfDefinitionSchema = Static<typeof webSurfDefinitionSchema>

export type WebSurferConfig = Static<typeof webSurferConfigSchema> & {sessionsHandler: SessionsHandler}

export type WebSurfResult = {
    mimeType?: string
    data: any
}

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
            let lastErrors

            for (let schema of desc.arguments) {
                const minItems = schema.filter((s: any) => !s[OptionalKind]).length
                schema = Type.Tuple(schema)
                schema.minItems = minItems
                const validate = (new Ajv({strictTuples: false})).compile(schema)

                try {
                    if (validate(args)) {
                        this.called$Fns.push(value.name)
                        return value.call(this, ...args) as unknown as T;
                    } else {
                        lastErrors = validate.errors
                    }

                } catch (e) {
                    lastErrors = validate.errors
                }
            }

            throw new InvalidWebSurfDefinitionError(fnName + ' : invalids arguments ' + JSON.stringify(lastErrors))
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
    protected writeSessions: Function[] = []
    protected userDebug: any[] = []
    protected called$Fns: any[] = []
    protected imports: Record<string, WebSurfDefinitionSchema>
    protected options: {username: string}
    //protected networkWatchs = new WeakMap

    constructor(config: WebSurferConfig, options: {username: string}, imports?: Record<string, WebSurfDefinitionSchema>) {
        Object.keys(surfQLApi).forEach(fn => {
            const methodName = fn
            // @ts-ignore
            this[methodName.substring(1)] = this[methodName].bind(this)
        })
        this.config = config
        this.imports = imports || {}
        this.options = options
    }

    public async saveSessions() {
        await Promise.all(this.writeSessions.map(fn => fn()))
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

    public getUserDebug() {
        return this.userDebug
    }

    public getTraces() {
        return this.called$Fns
    }

    @api({
        description: 'Ensures something is valid',
        arguments: [[
            Type.Any({title: 'something', description: 'To ensure'}),
            Type.Any({title: 'validation', description: 'The validation (JSON-schema) and maybe in the futur a zod'}),
        ]],
        returns: Type.Any({description: 'The something'})
    })
    public async $ensure(something: any, toMatch: any) {
        const validate = (new Ajv).compile(toMatch)

        if (!validate(something)) {
            throw new WebSurfRuntimeError('$ensure not passed', {details: validate.errors})
        }

        return something
    }

    @api({
        description: 'Just ... Fail',
        arguments: [[
            Type.String({title: 'reason', description: 'Reason to fail'}),
        ]],
        returns: undefined
    })
    public $fail(reason: string) {
        throw new WebSurfRuntimeError('$fail : ' + reason, {details: null})
    }

    @api({
        description: 'Call another surfQL',
        arguments: [[
            Type.String({title: 'ref', description: 'The surfQL ref'}),
            Type.Optional(Type.Any({title: 'input', description: 'The input'}))
        ]],
        returns: Type.Any({description: 'The ref result (can be function, object, ...)'})
    })
    public async $call(moduleName: string, input?: any) {
        const modul = this.imports[moduleName]

        if (!modul) {
            throw new InvalidWebSurfDefinitionError('Unknown ref ' + moduleName)
        }

        // BAD !!!! TODO KEEP LOCAL
        this.imports = {...this.imports, ...modul.imports}

        const parsedExpression = jsonata('(' + modul.expression + ')')
        input = modul.input instanceof Object && input instanceof Object ? {...modul.input, ...input} : input

        if (modul.schemas?.input) {
            const validate = (new Ajv({coerceTypes: true})).compile(modul.schemas.input)

            if (!validate(input)) {
                throw new WebSurfRuntimeError('Invalid input', {details: validate.errors})
            }

        }

        const output = await parsedExpression.evaluate(input, this)

        if (modul.schemas?.output) {
            const validate = (new Ajv).compile(modul.schemas.output)

            if (!validate(output)) {
                throw new WebSurfRuntimeError('Invalid output', {details: validate.errors})
            }

        }

        return output
    }

    @api({
        description: 'Evaluate js code in the console (dev tools)',
        arguments: [[
            Type.String({title: 'code', description: 'The code to evaluate'})
        ]],
        returns: Type.Any({description: 'Any'})
    })
    public async $writeInConsole(code: string): Promise<any> {
        const page = await this.getCurrentPage()
        return await page.evaluate(code)
    }

    @api({
        description: 'Push debug infos in case of problem',
        arguments: [[
            Type.Any({title: 'wyw', description: 'What you want to debug'})
        ]],
        returns: undefined
    })
    public $debug(wyw: any) {
        this.userDebug.push(wyw)
    }

    @api({
        description: 'Start surfing :)',
        arguments: [[
            Type.Optional(Type.Object({
                browser: Type.Optional(browsersSchema),
                session: Type.Optional(Type.Object({
                    id: Type.String(),
                    ttl: Type.String({pattern: '^P[A-Z0-9]{2,}$'})
                }, {description: 'The surf session'})),
                timezone: Type.Optional(Type.String({description: 'The timezone'})),
                locale: Type.Optional(Type.String({description: 'The locale'})),
                geolocation: Type.Optional(Type.Any()),
                proxy: Type.Optional(Type.Any())
            }, {title: 'options', description: 'Surf options'}))
        ]],
        returns: undefined
    })
    public async $startSurfing(
        {browser: browserName, session, proxy, timezone, locale, geolocation}:
        {
            browser?: BrowserName,
            session?: { id: string, ttl: string},
            proxy?: any,
            timezone?: string,
            locale?: string,
            geolocation?: any
        } = {}
    ) {
        const browser = await this.getBrowser(browserName)
        this.currentBrowser = browser

        const sessionContent = session ? await this.readSession(session.id) : undefined

        const context = await browser.newContext({
           // ...devices['Desktop Firefox'],
            viewport: { width: 1920, height: 945 },
            screen: { width: 1920, height: 1080 },
            storageState: sessionContent as any,
            proxy,
            timezoneId: timezone || this.config.defaults?.timezone,
            locale: locale || this.config.defaults?.locale,
            geolocation
        })

        context.setDefaultNavigationTimeout(20000)
        context.setDefaultTimeout(10000)

        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined})
        })

        if (session) {
            this.writeSessions.push(async () => {
                this.writeSession(session.id, session.ttl, await context.storageState())
            })
        }

        this.contexts.push(this.currentContext = context)
    }

    protected getSessionFullId(id: string) {
        return JSON.stringify([this.options.username, id])
    }

    protected async writeSession(id: string, ttl: string, content: object) {
        return this.config.sessionsHandler.writeSession(this.getSessionFullId(id), ttl, content)
    }

    protected async readSession(id: string) {
        return this.config.sessionsHandler.readSession(this.getSessionFullId(id))
    }

    @api({
        description: 'Go to URL',
        arguments: [[
            Type.String({title: 'url', description: 'The url you want to reach'}),
            Type.Optional(Type.Object({
                referer: Type.Optional(Type.String({description: 'The referer'}))
            }, {title: 'options', description: 'options'}))
        ]],
        returns: undefined
    })
    public async $goTo(url: string, {referer}: {referer?: string} = {}) {
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
        description: 'Create a new dayjs date',
        arguments: [[
            Type.Optional(Type.String({title: 'date', description: 'The date'}))
        ]],
        returns: {type: 'Dayjs', description: 'A Dayjs date object'}
    })
    public $date(date?: string): Dayjs {
        return dayjs(date)
    }

    @api({
        description: 'Fill an input',
        arguments: [[
            Type.String({title: 'locator', description: 'The field locator'}),
            Type.String({title: 'value', description: 'The value to fill'}),
            Type.Optional(Type.Object({
                pressEnter: Type.Optional(Type.Boolean({description: 'Press enter after fill'}))
            }, {title: 'options', description: 'The fill options'}))
        ]],
        returns: undefined
    })
    public async $fill(locator: string, value: string, {pressEnter}: {pressEnter?: boolean} = {}) {
        const page = await this.getCurrentPage()
        const el = await page.locator(locator)

        await el.pressSequentially(value, {delay: 200})

        await page.waitForTimeout(300);

        if (pressEnter) {
            // page.keyboard.press('Enter')
            await el.press('Enter')

            await page.waitForTimeout(1000);

            await page.mouse.move(500, 600, { steps: 10 });

            await page.evaluate(() => {
                window.scrollBy(0, window.innerHeight / 2);  // Scroller la page
            });
        } else {
            await page.waitForTimeout(600);
        }
    }

    @api({
        description: 'Watch network filtering on pattern',
        arguments: [[
            Type.String({title: 'pattern', description: 'Pattern to watch'}),
        ]],
        returns: Type.Array(Type.Object({
            url: Type.String()
        }), {description: 'List of watched requests'})
    })
    public async $watchNetwork(pattern: string): Promise<Array<any>> {
        const page = await this.getCurrentPage()
        const list: any[] = []
        page.on('requestfinished', (request) => {
            if (!request.url().includes(pattern)) {
                return
            }
            list.push({
                url: request.url()
            })
            // const list = this.networkWatchs.get(page) || []
            // list.push(request)
            // this.networkWatchs.set(page, list)
        })
        return list
    }

    @api({
        description: 'Check if an element is here',
        arguments: [[
            Type.String({title: 'locator', description: 'The element locator'}),
        ]],
        returns: Type.Boolean({description: 'True if present'})
    })
    public async $thereIs(locator: string): Promise<boolean> {
        const page = await this.getCurrentPage()
        return await page.locator(locator).count() > 0
    }

    @api({
        description: 'Call a http endpoint',
        arguments: [[
            Type.String({title: 'url', description: 'The url to call'}),
            Type.Optional(Type.Any({additionalProperties: true, title: 'opts', description: 'The options'})),
        ]],
        returns: Type.String({description: 'The text'})
    })
    public async $callHttp(url: string, opts: {method?: any, body?: any} = {}): Promise<any> {
        if (this.currentPage) {
            // Use browser instead ?
        }
        const res = await got(url, {
            headers: {
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
            },
            method: opts.method || 'GET',
            json: opts.body
        })

        const isJson = res.headers['content-type']?.includes('application/json')

        return isJson ? JSON.parse(res.body) : res.body
    }

    @api({
        description: 'Extract items list',
        arguments: [[
            Type.String({title: 'elementsLocator', description: 'The elements locator'}),
            Type.Any({additionalProperties: true, title: 'propertiesLocators', description: 'The element properties locator'}),
        ]],
        returns: Type.String({description: 'The text'})
    })
    public async $extract(elementsLocator: string, propertiesLocators: Record<string, string | string[]>): Promise<Record<string, string>[]> {
        const page = await this.getCurrentPage()
        const els = []

        for (const element of await page.locator(elementsLocator).all()) {
            const obj: Record<string, string> = {}

            for(const propLocKey in propertiesLocators) {
                if (Array.isArray(propertiesLocators[propLocKey])) {
                    console.log(propertiesLocators[propLocKey])
                    obj[propLocKey] = await element.locator(propertiesLocators[propLocKey][0]).getAttribute(propertiesLocators[propLocKey][1]) as string
                } else {
                    obj[propLocKey] = await element.locator(propertiesLocators[propLocKey]).textContent() as string
                }
            }

            els.push(obj)
        }

        return els
    }

    @api({
        description: 'Read a text',
        arguments: [[
            Type.String({title: 'locator', description: 'The field locator'}),
        ]],
        returns: Type.String({description: 'The text'})
    })
    public async $readText(locator: string): Promise<string> {
        const page = await this.getCurrentPage()
        return await page.locator(locator).textContent() as string
    }

    @api({
        description: 'Modify an URL',
        arguments: [[
            Type.String({title: 'url', description: 'The url to modify'}),
            Type.Object({
                query: Type.Record(Type.String(), Type.String())
            }, {title: 'changes', description: 'The changes to apply'})
        ]],
        returns: Type.String({description: 'The modified url'})
    })
    public $modifyUrl(url: string, changes: {query: Record<string, string>}): string {
        const u = new URL(url)

        for (const qKey in changes.query) {
            u.searchParams.set(qKey, changes.query[qKey])
        }

        return u.toString()
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
        description: 'Build url from template and variables',
        arguments: [[
            Type.String({title: 'template', description: 'The template (ex: http//www.google.fr/{?q})', examples: ['http//www.google.fr/{?q}']}),
            Type.Record(Type.String(), Type.Any(), {title: 'variables', description: 'The variables used to fill the template'})
        ]],
        returns: Type.String({description: 'The built url'})
    })
    public $buildUrl(template: string, variables: Record<string, any>): string {
        Object.keys(variables).forEach(key => {
            // uri template
            template = template.replace('{'+key+'}', encodeURIComponent(variables[key]))
        })
        return template
    }

    @api({
        description: 'Use cache for something',
        arguments: [[
            Type.String({title: 'cacheKey'}),
            Type.String({title: 'ttl'}),
            Type.Any({title: 'fn'})
        ]],
        returns: undefined
    })
    public async $useCache(cacheKey: string, ttl: string, fn: any): Promise<any> {
        let content = await this.config.sessionsHandler.readSession(this.getSessionFullId(cacheKey))

        if (!content) {
            content = await fn()
            await this.config.sessionsHandler.writeSession(this.getSessionFullId(cacheKey), ttl, content!)
        }

        return content
    }

    @api({
        description: 'Click on an element',
        arguments: [[Type.String({title: 'locator', description: 'The element locator'})]],
        returns: undefined
    })
    public async $clickOn(locator: string) {
        const page = await this.getCurrentPage()
        await page.locator(locator).click()
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

    protected async getBrowser(optBrowserName?: BrowserName): Promise<Browser> {
        const browserName: BrowserName = optBrowserName || this.config.defaults?.browser || Object.keys(this.config.browserLaunchers)[0] as BrowserName

        if (!this.browsers[browserName]) {

            if (!this.config.browserLaunchers[browserName]) {
                throw new Error(browserName + ' not available')
            }

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

    public async surf(surfDefinition: WebSurfDefinitionSchema, options: {username: string}): Promise<WebSurfResult> {
        const parsedExpression = this.parseExpression(surfDefinition.expression)
        const input = surfDefinition.input
        const imports = surfDefinition.imports || {}
        let surf: WebSurf | undefined = undefined

        try {

            if (surfDefinition.schemas?.input) {
                const validate = (new Ajv({coerceTypes: true})).compile(surfDefinition.schemas.input)

                if (!validate(input)) {
                    throw new WebSurfRuntimeError('Invalid input', {details: validate.errors})
                }

            }

            await Promise.all(map(imports, async (definitionOrLink: WebSurfDefinitionSchema | string, name: string) => {
                if (typeof definitionOrLink === 'string') {
                    try {
                        const [url, frag] = definitionOrLink.split('#')
                        imports[name] = await got(url).json()
                        if (frag) {
                            imports[name] = imports[name][frag.substring(1)]

                        }
                    } catch (e) {
                        throw new Error('Unable to load import ' + name + ' : ' + (e as Error).message, {cause: e})
                    }
                }
            }))

            surf = new WebSurf(this.config, options, imports)
            const v = await parsedExpression.evaluate(input, surf)
            await surf.saveSessions().catch(e => console.error(e))

            if (surfDefinition.schemas?.output) {
                const validate = (new Ajv).compile(surfDefinition.schemas.output)

                if (!validate(v)) {
                    throw new WebSurfRuntimeError('Invalid output', {details: validate.errors})
                }

            }

            return {
                mimeType: surfDefinition.outputMimeType,
                data: v
            }
        } catch (e) {
                            console.log(e)
            if (e instanceof Object && !(e instanceof Error) && (e as any).code && (e as any).token) {
                const jsonataError: {code: string, token: string, message: string} = e as any

                if (jsonataError.code === 'T1006') {
                    throw new InvalidWebSurfDefinitionError((e as Error).message + ' ('+(e as any).token+')')
                }

                throw jsonataError
            }

            let screenshot
            const traces = cloneDeep(surf?.getTraces())
            if (surf?.hasCurrentPage()) {
                try { screenshot = await surf.$screenshot() } catch (e) { screenshot = (e as Error).message }
            }

            if (e instanceof Error && (e as any).token && (e as any).position !== undefined) {
                const jsonataError: {token: string, message: string, position: number} = e as any

                const line = surfDefinition.expression.substring(0, jsonataError.position).split('\n').length

                throw new WebSurfRuntimeError('$' + jsonataError.token + ', position '+jsonataError.position+' (line '+line+'): ' + jsonataError.message, {cause: e, details: {
                    screenshot,
                    userDebug: surf?.getUserDebug(),
                    traces
                }})
            }

            throw new WebSurfRuntimeError((e as Error).message, {cause: e, details: {
                cause: e instanceof WebSurfRuntimeError && e,
                screenshot,
                userDebug: surf?.getUserDebug(),
                traces
            }})

        } finally {
            surf?.destroy().catch(console.error)
        }
    }

    protected parseExpression(expression: string): jsonata.Expression {
        try {
            return jsonata('(' + expression + ')')
        } catch (e) {
            console.error(e)
            throw new InvalidWebSurfDefinitionError('SurfQL parsing error : ' + (e as Error).message + ((e as any).position ? ', position ' + (e as any).position: ''))
        }
    }

}

export const surfQLApiDoc = surfQLApi
