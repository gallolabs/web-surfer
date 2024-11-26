const compteur = process.env.COMPTEUR
const email = process.env.EMAIL
const password = process.env.PASSWORD

const start = '2024-11-20'
const end = '2024-11-26'

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
		data: {
			compteur,
			email,
			password,
			start,
			end
		},
		steps: [
			{
				action: 'goto',
				url: 'https://monespace.grdf.fr/',
				output: 'url'
			},
			{
				action: 'if',
				condition: '$contains(url, "connexion.grdf.fr")',
				steps: [
					{
						action: 'fill',
						element: {
							locateBy: 'locator',
							locator: '[name="identifier"]'
						},
						value: '{{email}}',
						enter: true
					},
					{
						action: 'fill',
						element: {
							locateBy: 'locator',
							locator: '[name="credentials.passcode"]'
						},
						value: '{{password}}',
						enter: true
					}
				]
			},
			{
				action: 'goto',
				url: 'https://monespace.grdf.fr/api/e-conso/pce/consommation/informatives?dateDebut={{start}}&dateFin={{end}}&pceList%5B%5D={{compteur}}'
			},
			{
				action: 'extractText',
				element: {
					locateBy: 'locator',
					locator: 'body'
				},
				transform: '$eval($).*.releves.{"date": journeeGaziere, "kwh": energieConsomme}',
				output: 'conso'
			}
		],
		output: {
			content: 'conso'
		}
	})
})
console.log(response.status)
console.log(response.headers)
console.log(await response.json())
