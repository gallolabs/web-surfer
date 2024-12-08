import {writeFileSync} from 'fs'

const compteur = process.env.COMPTEUR
const email = process.env.EMAIL
const _password = process.env.PASSWORD

const response = await fetch('http://localhost:3000/surf', {
	method: 'POST',
	headers: {
      "Content-Type": "application/json",
    },
	body: JSON.stringify({
		variables: {
			compteur,
			email,
			_password
		},
		expression: `

			$start := $date().subtract(10, 'days').format('YYYY-MM-DD');
			$end := $date().format('YYYY-MM-DD');

			$startSurfing({'session': {'id': 'grdf', 'ttl': 'P1D'}});

			$goTo('https://monespace.grdf.fr/');

			$login := function() {(
				$debug('Login');
				$fill('[name="identifier"]', email, { 'pressEnter': true });
				$fill('[name="credentials.passcode"]', _password, { 'pressEnter': true });
			)};

			$contains($readUrl(), 'connexion.grdf.fr') ? $login() : $debug('Already logged');

			$goTo($buildUrl(
				'https://monespace.grdf.fr/api/e-conso/pce/consommation/informatives?dateDebut={start}&dateFin={end}&pceList%5B%5D={compteur}',
				{ 'start': $start, 'end': $end, 'compteur': compteur }
			));

			$resultConso := $eval($readText('body'));

			$resultConso.*.releves.{'date': journeeGaziere, 'kwh': energieConsomme};
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

