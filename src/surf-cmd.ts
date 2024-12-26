#!/usr/bin/env node
import yargs from 'yargs'
import { createWriteStream, readFileSync, writeFileSync } from 'fs'
import * as yaml from 'yaml'
import { Readable } from 'stream'
import traverse from 'traverse'
import { fileTypeFromBuffer } from 'file-type'
import { pipeline } from 'stream/promises'

const e = yargs(process.argv)
.command('$0 <z> <y> <surf-file>', 'Surf', {
    surfApi: {
        describe: 'Url of Surf service',
        type: 'string',
        default: 'http://localhost:3000'
    },
}, async ({man, surfApi, surfFile, ...others}) => {

    const fileContent = readFileSync(surfFile as string, {encoding: 'utf8'})

    const content = (surfFile as string).endsWith('ml') ? yaml.parse(fileContent) : JSON.parse(fileContent)

    const response = await fetch(surfApi + '/surf', {
        method: 'POST',
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Basic Z3Vlc3Q6Z3Vlc3Q="
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
                await pipeline(Readable.fromWeb(response.body), createWriteStream('response.png'))
                console.log('see response.png')
                return
            }
        }

        const r = await deepConvert(response.headers.get('content-type')?.startsWith('text/plain') ? await response.text() : await response.json())

        console.log(r)
    } else {
        const r = await deepConvert(response.headers.get('content-type')?.startsWith('text/plain') ? await response.text() : await response.json())

        console.error(r)
        e.exit(1, new Error(r.toString()))
    }

})

async function deepConvert (r: any): Promise<any> {
    if (r instanceof Object) {
        const promises: Promise<any>[] = []

        traverse(r).forEach(function (v) {
            if (typeof v === 'string' && v.length > 1000) {
                const content = Buffer.from(v, 'base64')

                promises.push(fileTypeFromBuffer(content).then(result => {
                    if (!result) {
                        return
                    }

                    const filename = this.key + '.png'
                    writeFileSync(filename, content)
                    this.update('see ' + filename)

                }))
            }
        })

        await Promise.all(promises)
    }

    return r
}

e.parse()
