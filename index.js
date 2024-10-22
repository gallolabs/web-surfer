import { firefox, devices } from 'playwright'
import Fastify from 'fastify'
import fs from 'fs'

const fastify = Fastify({logger: true})

fastify.post('/play', async (request, reply) => {
    const game = request.body

console.log(JSON.stringify(game))

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
                    await page.getByRole(step.element.role, { name: step.element.name }).click()
                } else {
                    await page.locator(step.element.locator).click()
                }
                await page.waitForTimeout(500);
                break
            case 'fill':
                if (step.element.locateBy === 'role') {
                    await page.getByRole(step.element.role, { name: step.element.name }).fill(step.value)
                } else {
                    console.log(step.element, step.value)
                    await page.locator(step.element.locator).fill(step.value)
                }
                if (step.enter) {
                    await page.keyboard.press('Enter')
                }
                await page.waitForTimeout(500);
                break
        }
    }

    if (cookiesPath) {
        const cookies = await context.cookies();
        fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
    }

    await browser.close()

    if (game.output) {
        reply.type(game.output.type || 'application/json').send(data[game.output.content])
    }
})

await fastify.listen({ port: 3000 })


/*
{
    browser: 'firefox',
    session: {
        id: 'abc',
        ttl: 3600
    },
    steps: [
        {
            action: 'goto',
            url: 'https://www.google.fr',
            referer: 'toto'
        },
        {
            action: 'evaluate',
            script: 'bla()',
            output: 'mavar'
        },
        {
            action: 'fill',
            field: '#input',
            value: '${mavar}'
        },
        {
            action: 'screenshot',
            output: 'page'
        }
    ],
    output: {
        type: 'application/json',
        content: 'page'
    }
}
*/




