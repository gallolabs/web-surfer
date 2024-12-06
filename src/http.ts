import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { readFileSync } from 'fs'
import {omit} from 'lodash-es'
import Fastify from 'fastify'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import {WebSurfer, webSurfDefinitionSchema, WebSurfRuntimeError, InvalidWebSurfDefinitionError, surfQLApiDoc} from './web-surfer.js'
import traverse from 'traverse'
import { fileTypeFromBuffer } from 'file-type'
import { OptionalKind } from '@sinclair/typebox'

export default async function server(webSurfer: WebSurfer) {

    const fastify = Fastify({logger: true}).withTypeProvider<TypeBoxTypeProvider>()

    const docApi = Object.keys(surfQLApiDoc).map((fnName: string) => {
        const doc = surfQLApiDoc[fnName]
        let content = '### ' + fnName + '\n'

        content += doc.description + '\n'

        content += '#### Arguments' + '\n'

        content += (doc.arguments[0].length > 0 ? '- ' : '' ) + doc.arguments.map(args => {
            return args.map((arg: any) => {
                const optional = arg[OptionalKind] ? ' (optional)' : ''
                return arg.title + optional + ' :' + arg.description + ' (`'+JSON.stringify(omit(arg, ['title', 'description']))+'`)'
            }).join('\n- ')
        }).join('\n or \n')+ '\n'

        content += '#### Returns' + '\n'

        content +=  doc.returns === undefined ? 'void' : doc.returns.description + ' (`' + JSON.stringify(omit(doc.returns, ['description'])) + '`)' + '\n'

        return content
    }).join('\n')

    await fastify.register(swagger, {
        openapi: {
            info: {
                title: 'Web Surfer',
                description: `
Scraping tool through API
## SurfQL API

SurfQL is an extended API from JSONATA. All Jsonata functions are available.

${docApi}       `,
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
                    content: readFileSync('src/favicon-32x32.png')
                }
            ]
        },
        logo: {
            type: 'image/png',
            content: readFileSync('./logo_w300.jpeg')
        }
    })

    function deepConvertForOutput(obj: Object): Object {
        return traverse(obj).map(v => {
            if (v instanceof Buffer) {
                return v.toString('base64')
            }
        })
    }

    fastify.post('/surf', {schema:{body: webSurfDefinitionSchema}}, async (request, reply) => {
        try {
            const result = await webSurfer.surf(request.body)

            if (result instanceof Buffer) {
                reply.type((await fileTypeFromBuffer(result))?.mime || 'application/octet-stream')
                return result
            }

            return result instanceof Object ? deepConvertForOutput(result) : result
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
                details: deepConvertForOutput(e.details)
            }
        }
    })

    await fastify.listen({ port: 3000 })


}
