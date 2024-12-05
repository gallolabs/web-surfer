// @ts-nocheck
import { firefox, webkit, chromium/*, devices */} from 'playwright'
import Fastify from 'fastify'
import fs, { readFileSync } from 'fs'
import { once } from 'events'

import { FromSchema } from "json-schema-to-ts"

import swagger from '@fastify/swagger'

import swaggerUi from '@fastify/swagger-ui'

const fastify = Fastify({logger: true})

import jsonata from 'jsonata'

import { fileTypeFromBuffer } from 'file-type'

import dayjs from 'dayjs'

import { Type, Static } from '@sinclair/typebox'


const tBBrowsersSchema = Type.Union([Type.Literal('firefox'), Type.Literal('chrome'), Type.Literal('chromium'), Type.Literal('webkit')])

const tBConfigSchema = Type.Object({
    defaultBrowser: tBBrowsersSchema,
    browserLaunchers: Type.Record(tBBrowsersSchema, Type.String())
})


const config: Static<typeof tBConfigSchema> = {
    defaultBrowser: 'firefox',
    browserLaunchers: {
        firefox: 'ws://lapdell:3000/firefox/playwright?token=6R0W53R135510&launch={options}',
        chrome: 'ws://lapdell:3000/chrome/playwright?token=6R0W53R135510&launch={options}',
        chromium: 'ws://lapdell:3000/chromium/playwright?token=6R0W53R135510&launch={options}',
        webkit: 'ws://lapdell:3000/webkit/playwright?token=6R0W53R135510&launch={options}',
    }
}






class GameEngineV1 {
    actions = {
        goto: {
            paramsSchema: {
                properties: {
                    referer: { type: 'string' },
                    url: { type: 'string' }
                },
                required: ['url']
            },
            async handler({context, step, page, data}) {

                if (page) {
                    await page.close()
                }
                page = await context.newPage({
                    extraHTTPHeaders: {
                        Referer: step.referer
                    }
                })
                let url = step.url

                Object.keys(data).forEach(key => {
                    // uri template
                    url = url.replace('{'+key+'}', encodeURIComponent(data[key]))
                })

                const response = await page.goto(url)

                if (response.status() >= 300 || response.status() < 200) {
                    throw new Error('Invalid status ' + r.status())
                }

                await page.waitForTimeout(1000);

                await page.mouse.move(500, 600, { steps: 10 });

                await page.evaluate(() => {
                    window.scrollBy(0, window.innerHeight / 2);  // Scroller la page
                });

                if (step.output) {
                    data[step.output] = await page.url()
                }

                return {page}
            }
        }
    }


    async playQLGame(game, tracingId) {
        const tracing: any[] = []
        tracings[tracingId] = tracing

        const sessionPath = game.session?.id ? game.session?.id + '.json' : null;
        let content
        let contentType
        let browser
        let context
        let page

        try {

            const parsedExpression = jsonata('(' + game.expression + ')')

            const launchArgs = JSON.stringify({
              headless: false,
              //stealth: true,
              args: [
                "--full-screen", "--use-gl=angle", "--use-angle=gl", "--enable-unsafe-webgpu", '-use-angle=swiftshader',
                "--lang=fr_FR", "--accept-lang=fr-FR", "--disable-blink-features=AutomationControlled"
                ],
              devtools: false
            });


            const browserName = game.browser || 'firefox'
            const playwrightLib = (() => {
                switch (browserName) {
                    case 'chrome':
                    case 'chromium':
                        return chromium
                    case 'firefox':
                        return firefox
                    case 'webkit':
                        return webkit
                    default:
                        throw new Error('Invalid browser ' + browserName)
                }
            })()

            browser = await playwrightLib.connect('ws://lapdell:3000/'+browserName+'/playwright?token=6R0W53R135510&launch=' + launchArgs)

            tracing.push('Connected to ' + game.browser)

            let storageState

            if (sessionPath && fs.existsSync(sessionPath)) {
                storageState = JSON.parse(fs.readFileSync(sessionPath, {encoding: 'utf8'}));
                // await context.addCookies(cookies);
                tracing.push('Reusing session for ' + game.session?.id)
            } else if (sessionPath) {
                tracing.push('New session for ' + game.session?.id)
            }

            const defaultI18nPreset = 'FR'

            const i18nMap = {
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

            const i18nPreset = game.i18nPreset ?? defaultI18nPreset

            if (!i18nMap[i18nPreset]) {
                throw new Error('Unknown i18nPreset')
            }

            const preset = i18nMap[i18nPreset]

            const contextI18n = {
                ...preset,
                proxy: preset.proxies.filter(p => p.healthy)[0]
            }

            context = await browser.newContext({
               // ...devices['Desktop Firefox'],
                viewport: { width: 1920, height: 945 },
                screen: { width: 1920, height: 1080 },
                storageState,
                ...contextI18n
            });

            context.setDefaultTimeout(5000)

            await context.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', {get: () => undefined})
            })

            parsedExpression.registerFunction('goto', async (url, referer) => {

                if (page) {
                    await page.close()
                }

                page = await context.newPage({
                    extraHTTPHeaders: {
                        Referer: referer
                    }
                })

                const response = await page.goto(url)

                if (response.status() >= 300 || response.status() < 200) {
                    throw new Error('Invalid status ' + r.status())
                }

                await page.waitForTimeout(1000);

                await page.mouse.move(500, 600, { steps: 10 });

                await page.evaluate(() => {
                    window.scrollBy(0, window.innerHeight / 2);  // Scroller la page
                });

                return await page.url()

            }, '<ss?:s>')

            parsedExpression.registerFunction('extractText', async (locator) => {
               return await page.locator(locator).textContent()
            }, '<s:s>')

            parsedExpression.registerFunction('screenshot', async () => {
                return await page.screenshot()
            }, '<:o>')

            parsedExpression.registerFunction('url', (url, binds) => {
                Object.keys(binds).forEach(key => {
                    // uri template
                    url = url.replace('{'+key+'}', encodeURIComponent(binds[key]))
                })
                return url
            }, '<so:s>')

            parsedExpression.registerFunction('date', (sDate) => {
                return dayjs(sDate)
            }, '<s?:(so)>')

            content = await parsedExpression.evaluate(game.variables || {})

            if (content instanceof Buffer) {
                const type = await fileTypeFromBuffer(content)
                contentType = type?.mime
            }

        } catch (e) {
            console.error(e)
            tracing.push(e)
            if (browser && page) {
                try {
                    tracing.push(await page.screenshot())
                } catch(e) {
                    tracing.push('Unable to screenshot : ' + e.message)
                }
            }
            throw e
        } finally {
            try {
                context && await context.close()
                browser && await browser.close()
            } catch (e) {
                console.error(e)
            }
        }

        if (sessionPath) {
            const storageState = await context.storageState();
            fs.writeFileSync(sessionPath, JSON.stringify(storageState, null, 2));
        }

        return {
            tracing,
            content,
            contentType
        }
    }

    async play(game, tracingId) {

        if (game.engine === 'botQL') {
            return this.playQLGame(game, tracingId)
        }

        const tracing: any[] = []
        tracings[tracingId] = tracing
        let browser
        let page;

        try {
            const launchArgs = JSON.stringify({
              headless: false,
              //stealth: true,
              args: [
                "--full-screen", "--use-gl=angle", "--use-angle=gl", "--enable-unsafe-webgpu", '-use-angle=swiftshader',
                "--lang=fr_FR", "--accept-lang=fr-FR", "--disable-blink-features=AutomationControlled"
                ],
              devtools: false
            });

            const cookiesPath = game.session?.id ? game.session?.id + '.json' : null;

            const browserName = game.browser || 'firefox'
            const playwrightLib = (() => {
                switch (browserName) {
                    case 'chrome':
                    case 'chromium':
                        return chromium
                    case 'firefox':
                        return firefox
                    case 'webkit':
                        return webkit
                    default:
                        throw new Error('Invalid browser ' + browserName)
                }
            })()

            browser = await playwrightLib.connect('ws://lapdell:3000/'+browserName+'/playwright?token=6R0W53R135510&launch=' + launchArgs)

            tracing.push('Connected to ' + game.browser)

            const context = await browser.newContext({
               // ...devices['Desktop Firefox'],
                viewport: { width: 1920, height: 945 },
                screen: { width: 1920, height: 1080 },
                locale: 'fr_FR',
                timezoneId: 'Europe/Paris'
            });

            context.setDefaultTimeout(5000)

            if (cookiesPath && fs.existsSync(cookiesPath)) {
                const cookies = JSON.parse(fs.readFileSync(cookiesPath, {encoding: 'utf8'}));
                await context.addCookies(cookies);
                tracing.push('Reusing cookies for ' + game.session?.id)
            } else if (cookiesPath) {
                tracing.push('New cookies for ' + game.session?.id)
            }

            await context.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', {get: () => undefined})
            })

            let data: any = game.variables || {}

            const playStep = async(step) => {
                tracing.push('Step ' + step.action)
                switch(step.action) {
                    case 'if':
                        if (await jsonata(step.condition).evaluate(data)) {
                            for(const step2 of step.steps) {
                                await playStep(step2)
                            }
                        }
                        break
                    case 'goto':
                        const s = await this.actions.goto.handler({context, step, data})
                        page = s.page
                        break
                    case 'evaluate':
                        const result = await page.evaluate(step.script)
                        if (step.output) {
                            data[step.output] = result
                        }
                        break
                    case 'screenshot':
                        const type = game.output?.type === 'image/jpeg' ? 'jpeg' : 'png'
                        const resultS = await page.screenshot({ fullPage: step.fullPage ?? true, type })
                        if (step.output) {
                            data[step.output] = resultS
                        }
                        break
                    case 'click':
                        if (step.skipMissingElement) {
                            if (step.element.locateBy === 'role') {
                                if (await page.getByRole(step.element.role, { name: step.element.name }).count() === 0) {
                                    break
                                }
                            } else {
                                if (await page.locator(step.element.locator).count() === 0) {
                                    break
                                }
                            }
                        }
                        if (step.element.locateBy === 'role') {
                            await page.getByRole(step.element.role, { name: step.element.name, exact: true }).click()
                        } else {
                            await page.locator(step.element.locator).click()
                        }
                        await page.waitForTimeout(500);
                        break
                    case 'fill':
                        if (step.skipMissingElement) {
                            if (step.element.locateBy === 'role') {
                                if (await page.getByRole(step.element.role, { name: step.element.name }).count() === 0) {
                                    break
                                }
                            } else {
                                if (await page.locator(step.element.locator).count() === 0) {
                                    break
                                }
                            }
                        }

                        let value = step.value

                        Object.keys(data).forEach(key => {
                            value = value.replace('{{'+key+'}}', data[key])
                        })

                        if (step.element.locateBy === 'role') {
                            await page.getByRole(step.element.role, { name: step.element.name }).fill(value)
                        } else {
                            console.log(step.element, value)
                            await page.locator(step.element.locator).fill(value)
                        }
                        if (step.enter) {
                            await page.keyboard.press('Enter')
                        }
                        await page.waitForTimeout(step.wait || 2000);
                        break
                    case 'extractText':
                        let text
                        if (step.element.locateBy === 'role') {
                            text = await page.getByRole(step.element.role, { name: step.element.name }).textContent()
                        } else {
                            text = await page.locator(step.element.locator).textContent()
                        }
                        if (step.output) {
                            data[step.output] = text
                        }
                        break
                    case 'transform':
                        const input = step.input ? data[step.input] : data
                        const value3 = await jsonata(step.expression).evaluate(input)

                        if (step.output) {
                            data[step.output] = value3
                        } else {
                            data = value3
                        }
                    case 'extractContent':
                        data[step.output] = await page.content()
                }
            }

            for(const step of game.steps) {
                await playStep(step)
            }

            if (cookiesPath) {
                const cookies = await context.cookies();
                fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
            }

            if (game.output) {
                const type = game.output.type || 'application/json'

                if (type === 'application/json' && game.output.content instanceof Object) {
                    const out = Object.keys(game.output.content).reduce((out, targetKey) => {
                        return {...out, [targetKey]: data[game.output.content[targetKey]]}
                    }, {})
                    return {
                        type,
                        content: out,
                        tracing
                    }
                }

                if (type === 'application/json' && game.output.binaryEncoding) {
                    data[game.output.content] = data[game.output.content].toString(game.output.binaryEncoding)
                }

                if (game.output.expression) {
                    return {
                        type,
                        content: await jsonata(game.output.expression).evaluate(data),
                        tracing
                    }
                }

                return {
                    type,
                    content: data[game.output.content],
                    tracing
                }

            }
        } catch (e) {
            console.error(e)
            tracings[tracingId].push(e)
            if (browser) {
                try {
                    tracing.push(await page.screenshot())
                } catch(e) {
                    tracing.push('Unable to screenshot : ' + e.message)
                }
            }
            throw e
        } finally {
            try {
                await browser.close()
            } catch (e) {
                console.error(e)
            }
        }

    }
}


const optsV1 = {
    schema: {
        body: (new GameEngineV1).getSchema()
    }
}

await fastify.register(async function (fastify) {
    await fastify.register(swagger, {
        openapi: {
            info: {
                title: 'Bobot API',
                description: 'Scraping tool through API',
                version: '1.0'
            },
            servers:[
                {url: 'http://127.0.0.1:3000'},
            ]
        }
    })

    await fastify.register(swaggerUi, {
        routePrefix: '/doc',
        uiConfig: {
            docExpansion: 'full',
            deepLinking: false
        },
        // uiHooks: {
        //   onRequest: function (request, reply, next) { next() },
        //   preHandler: function (request, reply, next) { next() }
        // },
        staticCSP: true,
        transformStaticCSP: (header) => header,
        transformSpecification: (swaggerObject, request) => {
            swaggerObject.servers[0].url = 'http://' + request.hostname + ':' + request.port
            return swaggerObject
        },
        transformSpecificationClone: true,
        theme: {
            title: 'Botbot v1',
            favicon: [
                {
                    filename: 'favicon.png',
                    rel: 'icon',
                    sizes: '32x32',
                    type: 'image/png',
                    content: readFileSync('./favicon-32x32.png')
                }
            ]
        },
        logo: {
            type: 'image/png',
            content: readFileSync('./logo_w200.jpeg')
        }
    })

    fastify.post('/play', optsV1, async (request, reply) => {
        const game = request.body

        const tracingId = Math.random().toString(36)
        reply.header('X-Tracing-Id', tracingId)
        reply.header('X-Tracing-Url', 'http://' + request.hostname + ':' + request.port + '/v1/tracings/' + tracingId)

        try {
            const result = await (new GameEngineV1).play(game, tracingId)

            if (result) {
                reply
                    .type(result.type)
                    .send(result.type === 'application/json'
                        ? JSON.stringify(result.content)
                        : result.content
                    )
            }

        } catch (e) {

            reply.status(500).type('application/json').send(JSON.stringify({
                error: 'Failed play',
                tracing: tracings[tracingId]
            }))
        } finally {
            setTimeout(() => {delete tracings[tracingId]}, 1000 * 60 * 5)
        }

    })

    const getTracingParamsSchema = { type: 'object', properties: {id: {type: 'string'}}, required: ['id'] } as const

    fastify.get<{Params: FromSchema<typeof getTracingParamsSchema>}>('/tracings/:id', { schema: {params: getTracingParamsSchema} }, async (request, reply) => {

        if (!tracings[request.params.id]) {
            return reply.status(404).send()
        }
        reply.type('application/json').send(tracings[request.params.id].map((t, i) => {
            return {
                id: i,
                url: 'http://' + request.hostname + ':' + request.port + '/v1/tracings/' + request.params.id + '/' + i,
                value: t instanceof Buffer ? '(binary)' : t
            }
        }))
    });

    const getTracingTraceParamsSchema = { type: 'object', properties: {id: {type: 'string'}, trace: {type: ['number', 'string']}}, required: ['id', 'trace'] } as const

    fastify.get<{Params: FromSchema<typeof getTracingTraceParamsSchema>}>('/tracings/:id/:trace', async (request, reply) => {

        if (!tracings[request.params.id]) {
            return reply.status(404).send()
        }

        if (request.params.trace === 'last') {
            request.params.trace = tracings[request.params.id].length - 1
        } else {
            request.params.trace = parseInt(request.params.trace, 10)
        }

        if (!tracings[request.params.id][request.params.trace]) {
            return reply.status(404).send()
        }


        if (tracings[request.params.id][request.params.trace] instanceof Buffer) {
            reply.type('image/png').send(tracings[request.params.id][request.params.trace])
            return
        }

        reply.send(tracings[request.params.id][request.params.trace])
    })

}, {prefix: '/v1'})

const tracings: Record<string, any[]> = {}

await fastify.listen({ port: 3000 })
