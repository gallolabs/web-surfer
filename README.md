<p align="center">
    <img height="200" src="https://raw.githubusercontent.com/gallolabs/bobot/main/logo_w300.jpeg">
  <p align="center"><strong>Web Surfer</strong></p>
</p>

A POC for a scraping tool through API.

## Engines

### BotQL

```application/json
{
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
}
```

### BotJSON

```application/json
{
    engine: 'botJSON',
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
            value: '{{ipv4}}',
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
}
```