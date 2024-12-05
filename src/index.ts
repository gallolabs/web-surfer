import Fastify from 'fastify'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import {WebSurfer, WebSurferConfig, webSurfDefinitionSchema, WebSurfRuntimeError, InvalidWebSurfDefinitionError} from './web-surfer.js'


const config: WebSurferConfig = {
    defaultBrowser: 'firefox',
    browserLaunchers: {
        firefox: 'ws://lapdell:3000/firefox/playwright?token=6R0W53R135510&launch={options}',
        chrome: 'ws://lapdell:3000/chrome/playwright?token=6R0W53R135510&launch={options}',
        chromium: 'ws://lapdell:3000/chromium/playwright?token=6R0W53R135510&launch={options}',
        webkit: 'ws://lapdell:3000/webkit/playwright?token=6R0W53R135510&launch={options}',
    }
}

const fastify = Fastify({logger: true}).withTypeProvider<TypeBoxTypeProvider>()
const webSurfer = new WebSurfer(config)

fastify.post('/surf', {schema:{body: webSurfDefinitionSchema}}, async (request, reply) => {
    try {
        const result = await webSurfer.surf(request.body)

        return result
    } catch (e) {
        if (e instanceof InvalidWebSurfDefinitionError) {
            reply.code(400)

            return e
        }
        if (!(e instanceof WebSurfRuntimeError)) {
            throw e
        }

        reply.code(500)

        return {
            message: e.message,
            details: e.details
        }
    }
})

await fastify.listen({ port: 3000 })

