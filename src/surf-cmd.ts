#!/usr/bin/env node
import yargs from 'yargs'
// @ts-ignore
import cliMd from 'cli-markdown'
import { createWriteStream, readFileSync } from 'fs'
import * as yaml from 'yaml'
import { Readable } from 'stream'

const e = yargs(process.argv)
.command('$0 <z> <y> <surf-file>', 'Surf', {
	surfApi: {
		describe: 'Url of Surf service',
		type: 'string',
		default: 'http://localhost:3000'
	},
	man: {
		describe: 'Show doc',
		type: 'boolean'
	}
}, async ({man, surfApi, surfFile, ...others}) => {

	if (man) {
		const fullDoc: any = await (await fetch(surfApi + '/doc/json')).json()

		process.stdout.write(cliMd(fullDoc.info.description))

		return
	}

	const fileContent = readFileSync(surfFile as string, {encoding: 'utf8'})

	const content = (surfFile as string).endsWith('ml') ? yaml.parse(fileContent) : JSON.parse(fileContent)

	const response = await fetch(surfApi + '/surf', {
		method: 'POST',
		headers: {
	      "Content-Type": "application/json",
	    },
		body: JSON.stringify({
			...content,
			variables: {
				...content.variables,
				...others
			}
		})
	})

	if (response.status === 200) {
		if (!response.headers.get('content-type')?.startsWith('application/json') && !response.headers.get('content-type')?.startsWith('text/plain')) {
			if (response.body) {
				// @ts-ignore
				Readable.fromWeb(response.body).pipe(createWriteStream('response.png'))
				console.log('see response.png')
				return
			}
		}

		const r = await response.json()

		console.log(r)
	} else {
		const r = await response.text()
		console.error(r)
		e.exit(1, new Error(r))
	}

})

e.parse()
