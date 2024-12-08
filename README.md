<p align="center">
    <img height="300" src="https://raw.githubusercontent.com/gallolabs/bobot/main/logo_w300.jpeg">
  <h1 align="center">Web Surfer</h1>
</p>

A POC for a scraping tool through API. In development.

## POST /surf with SurfQL

- Hight level API with functions, with simple naming like human actions (I go to, I click on, I fill, I read something, etc)
- (not available) Low level API with object returned by $startSurfing()

### Example : Search on Google, extract a text and take a screenshot

```application/json
{
    expression: `

        $goTo('https://www.google.fr');

        $clickOn('button:has-text("Tout accepter")');

        $fill('textarea[aria-label="Rech."]', 'Trump', { 'pressEnter': true });

        {
            'description': $readText('[data-attrid=description] div > span:nth-child(2)'),
            'screenshot': $screenshot()
        };

    `
}
```

We will receive a JSON with a description (an extracted text) and a sreenshot base64 encoded.

### Example : Extract and transform Gaz consumption from GRDF

```application/json
{
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
}
```

We explicity create a surfing session with a 1day validity, login to GRDF if needed, fetching consumption and transforming it to obtain exactly what we want.

Here an output example :
```javascript
[
  { date: '2024-11-19', kwh: 13 },
  { date: '2024-11-20', kwh: 9 },
  { date: '2024-11-21', kwh: 11 },
  { date: '2024-11-22', kwh: 16 },
  { date: '2024-11-23', kwh: 17 },
  { date: '2024-11-24', kwh: 10 },
  { date: '2024-11-25', kwh: 10 },
  { date: '2024-11-26', kwh: 8 },
  { date: '2024-11-27', kwh: 12 },
  { date: '2024-11-28', kwh: 2 },
  { date: '2024-11-29', kwh: 6 }
]
```

## Notes

SurfQL is on top of JSONATA. Browsers are managed by Browserless, but it should be good to have an opensource alternative with minimum firefox and chrome and autostart and garbage system, drived by playwright.

For output, Web Surfer will choose the content type (json/plain/image/etc) depending of the returned value. To force the type, use Accept http header. To force binary encoding (in case of json for example), use explicit method (ex $base64) (or header ?)

Cases :
- Output is string : text/plain
- Output is Buffer : identify the type and returns raw data
- Output is object/boolean : application/json

When output contains string (text/plain or application/json), binary data will be represented as base64 by default.

## Help

Go to http://localhost:3000/doc for OpenAPI doc with surfQL available methods.
