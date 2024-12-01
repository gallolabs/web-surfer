import fs from 'fs'
import stream from 'stream'

const response = await fetch('http://localhost:3000/v1/play', {
	method: 'POST',
	headers: {
      "Content-Type": "application/json",
    },
	body: JSON.stringify({
		engine: 'botQL',
		browser: 'firefox',
		session: {
			id: 'abc',
			ttl: 3600
		},
		variables: {
			url: 'https://whatismyipaddress.com/fr/mon-ip'
		},
		expression: `
			$goto(url);
			$copyright := $extractText('.copyright');
			{
				'copyright': $copyright,
				'ip': $extractText('#ipv4'),
				'country': $extractText('.ip-information .information:last-child span:last-child'),
				'screenshot': $screenshot()
			};
		`
	})
})
console.log(response.status)
console.log(response.headers)
console.log(await response.json())

const response2 = await fetch('http://localhost:3000/v1/play', {
	method: 'POST',
	headers: {
      "Content-Type": "application/json",
    },
	body: JSON.stringify({
		engine: 'botQL',
		browser: 'firefox',
		session: {
			id: 'abc',
			ttl: 3600
		},
		variables: {
			url: 'https://whatismyipaddress.com/?s={country}',
			country: 'France'
		},
		expression: `
			$goto($url(url, $));
			$screenshot();
		`
	})
})
console.log(response2.status)
console.log(response2.headers)
const streamm = fs.createWriteStream('image.png')
stream.Readable.from(response2.body).pipe(streamm)
