// @ts-nocheck

import dayjs from 'dayjs'


parsedExpression.registerFunction('extractText', async (locator) => {
   return await page.locator(locator).textContent()
}, '<s:s>')


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
