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
				url: 'https://canexistepas.coco'
			},
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

console.log(response.status)
console.log(response.headers)
console.log(await response.json())
