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
				'country': $extractText('.ip-information .information:last-child span:last-child')
			};
		`
	})
})
console.log(response.status)
console.log(response.headers)
console.log(await response.json())
