const response = await fetch('http://localhost:3000/play', {
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
				url: 'https://whatismyipaddress.com/fr/mon-ip'
			},
			{
				action: 'click',
				skipMissingElement: true,
				element: {
					locateBy: 'role',
					role: 'button',
					name: 'AGREE'
				}
			},
			{
				action: 'extractText',
				element: {
					locateBy: 'locator',
					locator: '#ipv4'
				},
				output: 'ipv4'
			},
			{
				action: 'extractText',
				element: {
					locateBy: 'locator',
					locator: '.ip-information .information:last-child span:last-child'
				},
				output: 'country'
			},
			{
				action: 'fill',
				element: {
					locateBy: 'locator',
					locator: '.search-field'
				},
				value: '${ipv4}',
				enter: true
			},
			{
				action: 'extractText',
				element: {
					locateBy: 'locator',
					locator: '.ip-information .information:nth-child(2) span:last-child'
				},
				output: 'hostname'
			}
		],
		output: {
			content: {
				ip: 'ipv4',
				country: 'country',
				host: 'hostname'
			}
		}
	})
})

console.log(await response.json())
