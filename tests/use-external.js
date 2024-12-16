import {writeFileSync} from 'fs'

const response = await fetch('http://localhost:3000/surf', {
	method: 'POST',
	headers: {
      "Content-Type": "application/json",
    },
	body: JSON.stringify({
		variables: {
			query: 'hello world'
		},
		imports: {
			'google-search': {
				variables: {
					url: 'https://www.google.com'
				},
				imports: {
					'google-tools': {
						expression: `
							{
								'readDescription': function() { $readText('[data-attrid=VisualDigestDescription] div:nth-child(2) > span:nth-child(1)') }
							}
						`
					}
				},
				expression: `
					function ($query) {(
						$tools := $import('google-tools');

						$goTo(url);

						$clickOn('button:has-text("Tout accepter")');

						$fill('textarea[aria-label="Rech."]', $query, { 'pressEnter': true });

						{
							'description': $tools.readDescription(),
							'screenshot': $screenshot()
						};
					)}
				`
			}
		},
		expression: `

			$searchGoogle := $import('google-search', {
				'url': 'https://www.google.fr'
			});

			$searchGoogle(query).description;

		`
	})
})

if (await response.status === 200) {
	const r = await response.text()

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
