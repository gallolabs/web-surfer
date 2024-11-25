import fs from 'fs'
import stream from 'stream'

const response = await fetch('http://localhost:3000/v1/play', {
	method: 'POST',
	headers: {
      "Content-Type": "application/json",
    },
	body: JSON.stringify({
		browser: 'firefox',
		session: {
			id: 'abc',
			ttl: 3600
		},
		steps: [
			{
				action: 'goto',
				url: 'https://www.google.fr'
			},
			{
				action: 'click',
				skipMissingElement: true,
				element: {
					locateBy: 'role',
					role: 'button',
					name: 'Tout accepter'
				}
			},
			{
				action: 'fill',
				element: {
					locateBy: 'locator',
					locator: 'textarea:visible'
				},
				value: 'Guigui et Gigi',
				enter: true
			},
			{
				action: 'screenshot',
				output: 'page'
			}
		],
		output: {
			type: 'image/png',
			content: 'page'
		}
	})
})

const streamm = fs.createWriteStream('image.png')
stream.Readable.from(response.body).pipe(streamm)
