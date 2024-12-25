import { readFile, writeFile } from 'fs/promises'
import * as duration from 'duration-fns'
import { resolve } from 'path'
import { createHash } from 'crypto'
import { unlink } from 'fs/promises'

export default class SessionsHandler {
	protected sessionsDir: string

	public constructor({sessionsDir}: {sessionsDir: string}) {
		this.sessionsDir = sessionsDir
	}

	protected getSessionFilePath(id: string) {
		return resolve(this.sessionsDir, createHash('sha512').update(id).digest('hex') + '.json')
	}

	public async readSession(id: string) {
		try {
			const path = this.getSessionFilePath(id)
			const data: {expires: number, content: object} = JSON.parse(
				await readFile(path, {encoding: 'utf8'})
			)

			if (data.expires <= (new Date).getTime()) {
				// Should be done in background
				await unlink(path)
				return
			}

			return data.content
		} catch (e) {
			if ((e as any).code === 'ENOENT') {
				return
			}
			throw e
		}
	}

	public async writeSession(id: string, ttl: string, content: object) {
		await writeFile(this.getSessionFilePath(id), JSON.stringify({
			expires: duration.apply(new Date, duration.parse(ttl)).getTime(),
			content
		}, null, 2))
	}
}