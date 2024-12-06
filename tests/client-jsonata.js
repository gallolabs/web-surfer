


import fs from 'fs'
import stream from 'stream'

const response = await fetch('http://localhost:3000/v1/play', {
	method: 'POST',
	headers: {
      "Content-Type": "application/json",
    },
	body: JSON.stringify({
		engine: 'botQL',
		variables: {
			url: 'https://whatismyipaddress.com/fr/mon-ip'
		},
		expression: `

			$startSurfing({
				'browser': 'firefox',
				'session': {'id': 'abc', 'ttl': 3600},
				'i18nPreset': 'FR', /* proxy + (geoloc) + locale + timezone */
				/* url: xxxx */
			});

			$myUrl := $goTo('https://myenergyspace.com');

			$myUrl := $readUrl()

			$fill({
				username: 'hello',
				password: 'world'
			}, { pressEnter: true });

			$clickOn('My Consumption');

			{
				"warning": $readTextOf('div.warning'),
				"screenshot": $screenshot()
			};

			$openNewTab({
				url: ....
			})

			/* On the new tab */
			$fill('.search', 'my search')

			$backToPreviousTab()


			$surfing := $webSurf({
				url: 'blabla'
			})

			$surfing.fill({
				username: 'hello',
				password: 'world'
			})

			$clickOn('Login')

			$newPage := $surfing.newPage()

			$newPage.fill()

			$newPage.findElement('xxxx').fill()

			$browserSession := $browser('firefox', {
				'browser': 'firefox',
				'session': {'id': 'abc', 'ttl': 3600},
				'i18nPreset': 'FR' /* proxy + (geoloc) + locale + timezone */
			})
			$page := $browserSession.page()
			$page.goto(url);

			$page := $browserPage()

			$copyright := $page.extractText('.copyright');
			{
				'copyright': $copyright,
				'ip': $page.extractText('#ipv4'),
				'country': $page.extractText('.ip-information .information:last-child span:last-child'),
				'screenshot': $page.screenshot(),
				'yesterday': $date().subtract(1, 'day')
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
