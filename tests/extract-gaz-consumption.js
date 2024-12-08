import {writeFileSync} from 'fs'

const compteur = process.env.COMPTEUR
const email = process.env.EMAIL
const _password = process.env.PASSWORD

const start = '2024-11-20'
const end = '2024-11-30'

const response = await fetch('http://localhost:3000/surf', {
	method: 'POST',
	headers: {
      "Content-Type": "application/json",
    },
	body: JSON.stringify({
		variables: {
			compteur,
			email,
			_password,
			start,
			end
		},
		expression: `

			$startSurfing({'session': {'id': 'grdf', 'ttl': 'P1D'}});

			$goTo('https://monespace.grdf.fr/');

			$login := function() {(
				$fill('[name="identifier"]', email, { 'pressEnter': true });
				$fill('[name="credentials.passcode"]', _password, { 'pressEnter': true });
			)};

			$contains($readUrl(), 'connexion.grdf.fr') ? $login() : null;

			$goTo($buildUrl(
				'https://monespace.grdf.fr/api/e-conso/pce/consommation/informatives?dateDebut={start}&dateFin={end}&pceList%5B%5D={compteur}',
				$
			));

			$resultConso := $readText('body');

			$eval($resultConso).*.releves.{'date': journeeGaziere, 'kwh': energieConsomme};
		`
	})
})
if (await response.status === 200) {
	const r = await response.json()

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

