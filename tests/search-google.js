import {writeFileSync} from 'fs'

const response = await fetch('http://localhost:3000/surf', {
	method: 'POST',
	headers: {
      "Content-Type": "application/json",
    },
	body: JSON.stringify({
		expression: `

			$goTo('https://www.google.fr');

			$clickOn('button:has-text("Tout accepter")');

			$fill('textarea[aria-label="Rech."]', 'Trump', { 'pressEnter': true });

			{
				'description': $readText('[data-attrid=description] div > span:nth-child(2)'),
				'screenshot': $screenshot()
			};

		`
	})
})
if (await response.status === 200) {
	const r = await response.json()

	writeFileSync('./trump.png', Buffer.from(r.screenshot, 'base64'))

	r.screenshot = 'see trump.png'

	console.log(r)
} else {
	const r = await response.json()
	const screenshot = r.details?.screenshot

	delete r.details?.screenshot
	if (screenshot) {
		writeFileSync('./debug.png', Buffer.from(screenshot, 'base64'))
	}

	console.log(r)
}

