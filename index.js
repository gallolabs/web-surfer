import { firefox, devices } from 'playwright'
import Fastify from 'fastify'
import fs from 'fs'

const fastify = Fastify({logger: true})

const opts = {
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

fastify.post('/play', opts, async (request, reply) => {
    const game = request.body

    const launchArgs = JSON.stringify({
      headless: false,
      //stealth: true,
      args: ["--full-screen", "--use-gl=angle", "--use-angle=gl", "--enable-unsafe-webgpu", '-use-angle=swiftshader' , "--lang=fr_FR", "--accept-lang=fr-FR", "--disable-blink-features=AutomationControlled"],
      devtools: false
    });

    const cookiesPath = game.session?.id ? game.session?.id + '.json' : null;

    const browser = await firefox.connect({
        wsEndpoint: 'ws://lapdell:3000/'+(game.browser || 'firefox')+'/playwright?token=6R0W53R135510&launch=' + launchArgs
    })

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
    }

    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {get: () => undefined})
    })

    let page;
    const data = {}

    for(const step of game.steps) {
        switch(step.action) {
            case 'goto':
                page = await context.newPage({
                    extraHTTPHeaders: {
                        Referer: step.referer
                    }
                })
                await page.goto(step.url)

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
                const resultS = await page.screenshot({ fullPage: true })
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

    await browser.close()

    if (game.output) {
        const type = game.output.type || 'application/json'

        if (type === 'application/json' && game.output.content instanceof Object) {
            const out = Object.keys(game.output.content).reduce((out, targetKey) => {
                return {...out, [targetKey]: data[game.output.content[targetKey]]}
            }, {})
            return out
        }

        if (type === 'application.json' && game.output.binaryEncoding) {
            data[game.output.content] = data[game.output.content].toString(game.output.binaryEncoding)
        }
        reply.type(type).send(type === 'application/json' ? JSON.stringify(data[game.output.content]) : data[game.output.content] )
    }
})

await fastify.listen({ port: 3000 })
