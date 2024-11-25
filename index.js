import { firefox, devices } from 'playwright'
import Fastify from 'fastify'
import fs from 'fs'
import { once } from 'events'

const fastify = Fastify({logger: true})

const optsV1 = {
    schema: {
        body: {
            type: 'object',
            properties: {
                browser: { type: 'string' },
                session: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' }
                    }
                },
                steps: {
                    type: 'array'
                },
                output: {
                    type: 'object',
                    properties: {
                        type: { type: 'string' },
                        content: {
                            oneOf: [
                                { type: 'string' },
                                { type: 'object' }
                            ]
                        },
                        binaryEncoding: { type: 'string' }
                    }
                }
            }
        }
    }
}

class GameEngineV1 {
    async play(game, tracingId) {

        const tracing = []
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

            browser = await firefox.connect('ws://lapdell:3000/'+(game.browser || 'firefox')+'/playwright?token=6R0W53R135510&launch=' + launchArgs)

            tracing.push('Connected to ' + game.browser)

            const context = await browser.newContext({
               // ...devices['Desktop Firefox'],
                viewport: { width: 1920, height: 945 },
                screen: { width: 1920, height: 1080 },
                locale: 'fr_FR',
                timezoneId: 'Europe/Paris',
            });

            if (cookiesPath && fs.existsSync(cookiesPath)) {
                const cookies = JSON.parse(fs.readFileSync(cookiesPath));
                await context.addCookies(cookies);
                tracing.push('Reusing cookies for ' + game.session?.id)
            } else if (cookiesPath) {
                tracing.push('New cookies for ' + game.session?.id)
            }

            await context.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', {get: () => undefined})
            })

            const data = {}

            for(const step of game.steps) {
                tracing.push('Step ' + step.action)
                switch(step.action) {
                    case 'goto':
                        page = await context.newPage({
                            extraHTTPHeaders: {
                                Referer: step.referer
                            }
                        })
                        const [[r]] = await Promise.all([
                            once(page, 'response'),
                            page.goto(step.url)
                        ])

                        if (r.status() !== 200) {
                            throw new Error('Invalid status ' + r.status())
                        }

                        await page.waitForTimeout(1000);

                        await page.mouse.move(500, 600, { steps: 10 });

                        await page.evaluate(() => {
                            window.scrollBy(0, window.innerHeight / 2);  // Scroller la page
                        });

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
                        let value = step.value

                        Object.keys(data).forEach(key => {
                            value = value.replace('${'+key+'}', data[key])
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
                        await page.waitForTimeout(2000);
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
                }
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

                return {
                    type,
                    content: data[game.output.content],
                    tracing
                }

            }
        } catch (e) {
            tracings[tracingId].push(e.message)
            if (browser) {
                try {
                    tracing.push(await page.screenshot())
                } catch(e) {
                    tracing.push('Unaible to screenshot ' + e.message)
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

const tracings = {}

fastify.post('/v1/play', optsV1, async (request, reply) => {
    const game = request.body

    const tracingId = Math.random().toString(36)
    reply.header('X-Tracing-Id', tracingId)

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

fastify.get('/v1/tracings/:id', async (request, reply) => {
    if (!tracings[request.params.id]) {
        return reply.status(404).send()
    }
    reply.type('application/json').send(tracings[request.params.id].map(t => {
        if (t instanceof Buffer) {
            return '(binary)'
        }
        return t
    }))
})

fastify.get('/v1/tracings/:id/:trace', async (request, reply) => {
    if (!tracings[request.params.id] || !tracings[request.params.id][request.params.trace]) {
        return reply.status(404).send()
    }

    if (tracings[request.params.id][request.params.trace] instanceof Buffer) {
        reply.type('image/png').send(tracings[request.params.id][request.params.trace])
        return
    }

    reply.send(tracings[request.params.id][request.params.trace])
})

await fastify.listen({ port: 3000 })
