import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { readFileSync } from 'fs'
import {omit} from 'lodash-es'
import Fastify, { FastifyReply } from 'fastify'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import {WebSurfer, webSurfDefinitionSchema, WebSurfRuntimeError, InvalidWebSurfDefinitionError, surfQLApiDoc, WebSurfDefinitionSchema} from './web-surfer.js'
import traverse from 'traverse'
import { fileTypeFromBuffer } from 'file-type'
import { OptionalKind } from '@sinclair/typebox'
import basicAuth from '@fastify/basic-auth'

import * as yaml from 'yaml'

declare module 'fastify' {
  interface FastifyRequest {
    username?: string
  }
}

export default async function server(webSurfer: WebSurfer) {

    const fastify = Fastify({logger: true}).withTypeProvider<TypeBoxTypeProvider>()

    fastify.addContentTypeParser('application/yaml', {parseAs: 'string'}, async (_: any, body: string) => {
        return yaml.parse(body)
    })

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
            components: {
                securitySchemes: {
                    basicAuth: {
                        type: 'http',
                        scheme: 'basic'
                    }
                }
            },
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

    await fastify.register(basicAuth, { validate: async function validate (username, _, req) {
        if (!username) {
            throw new Error('Expected user')
        }
        req.username = username
    }, authenticate: true})

    fastify.get('/@:username/surfs/crypto-actus/run', async(request, reply) => {

        reply.header('Access-Control-Allow-Origin', '*')

        const fileContent = readFileSync('tests/coinmarketcap-btc.yaml', {encoding: 'utf8'})

        const content = yaml.parse(fileContent)

        const surf: WebSurfDefinitionSchema = {
            input: request.query,
            imports: {
                userSurf: content
            },
            expression: '$call("userSurf", $)'
        }

        return httpSurfRun(surf, (request.params as any).username, reply)
    })

    fastify.get('/@:username/surfs/crypto-cupidity/run', async(request, reply) => {

        reply.header('Access-Control-Allow-Origin', '*')

        const fileContent = readFileSync('tests/coinmarketcap-cupidity.yaml', {encoding: 'utf8'})

        const content = yaml.parse(fileContent)

        const surf: WebSurfDefinitionSchema = {
            input: request.query,
            imports: {
                userSurf: content
            },
            expression: '$call("userSurf", $)'
        }

        return httpSurfRun(surf, (request.params as any).username, reply)
    })

    fastify.post('/@:username/surfs/crypto-actus/run', async() => {})

    fastify.get('/@:username/surfs/:surfName', async() => {})
    fastify.put('/@:username/surfs/:surfName', async() => {})
    fastify.delete('/@:username/surfs/:surfName', async() => {})

    async function httpSurfRun(body: any, username: string, reply: FastifyReply<any>) {
        try {
            const {data, mimeType} = await webSurfer.surf(body, {
                username: username
            })

            if (data instanceof Buffer) {
                reply.type((await fileTypeFromBuffer(data))?.mime || 'application/octet-stream')
                return data
            }

            if (mimeType) {
                reply.type(mimeType)
            }

            return data instanceof Object ? deepConvertForOutput(data) : data
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
    }

    fastify.post(
        '/surf',
        {
            onRequest: fastify.basicAuth,
            schema: {
                body: webSurfDefinitionSchema,
                security: [{basicAuth: []}]
            }
        },
        async (request, reply) => {
            return httpSurfRun(request.body, request.username!, reply)
        }
    )

    await fastify.listen({ port: 3000, host: '0.0.0.0' })
}
