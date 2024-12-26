import Fastify from 'fastify'
import { readFile } from 'fs/promises'
import * as yaml from 'yaml'

const fastify = Fastify({logger: true})

await fastify.get<{Params: {lib: string}}>(
	'/:lib',
	{schema: { params: { type: 'object', properties: { lib: {type: 'string'} }, required: ['lib']  } }},
	async (request) => {
		const libName = request.params.lib
		const rawContent = await readFile('tests/lib/' + libName + '.yaml', {encoding: 'utf8'})
		return yaml.parse(rawContent)
	}
)

await fastify.listen({ port: 3001, host: '0.0.0.0' })