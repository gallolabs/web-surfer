<p align="center">
    <img height="300" src="https://raw.githubusercontent.com/gallolabs/web-surfer/main/logo_w300.jpeg">
  <h1 align="center">Web Surfer</h1>
</p>

## Description

Web-Surfer is a webservice to automate (ex scrape) web surfs.

### Launch

```sh
npm i
sudo docker compose up
```

### Test

You can use the command :

```sh
# Pre-requise : Running service (ex npm start)
npm run build # Build surf-cmd
npm run serve-lib # Start a server to serve libs (for imports tests)
node dist/surf-cmd.js --surf-api 'http://localhost:3000' tests/doctolib.yaml --url 'https://www.doctolib.fr/chirurgien-visceral-et-digestif/le-blanc-mesnil/nouredine-oukachbi/booking/availabilities?specialityId=179&telehealth=false&placeId=practice-5105&motiveIds%5B%5D=860154&pid=practice-5105'
```

This will returns the availabilities for your doctor for the next 15 days :
```javascript
// Launch date 2024-12-22 21:20+01:00
[
  '2024-12-24 09:40',
  '2024-12-24 11:30',
  '2024-12-26 15:00',
  '2024-12-26 15:10',
  '2024-12-26 15:20',
  '2024-12-26 15:50',
  '2024-12-26 16:00',
  '2024-12-26 16:30',
  '2024-12-26 16:40'
]
```

## POST /surf with SurfQL

- Hight level API with functions, with simple naming like human actions (I go to, I click on, I fill, I read something, etc)
- (not available) Low level API with object returned by $startSurfing()

### Example : Search on Google, extract a text and take a screenshot

```javascript
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

```javascript
{
    input: {
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
}
```

We explicity create a surfing session with a 1day validity, login to GRDF if needed, fetching consumption and transforming it to obtain exactly what we want.

Here an output example :
```javascript
[
  { date: '2024-11-27', kwh: 12 },
  { date: '2024-11-28', kwh: 2 },
  { date: '2024-11-29', kwh: 6 },
  { date: '2024-11-30', kwh: 12 },
  { date: '2024-12-01', kwh: 14 },
  { date: '2024-12-02', kwh: 10 },
  { date: '2024-12-03', kwh: 13 },
  { date: '2024-12-04', kwh: 15 }
]
```

### Example : Use imports

http://trusted.com/shared-surfs.json

```javascript
{
    search: {
        schemas: {
            input: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string'
                    },
                    query: {
                        type: 'string'
                    }
                },
                required: [
                    'url',
                    'query'
                ]
            },
            output: {
                type: 'object',
                properties: {
                    description: {
                        type: 'string'
                    },
                    screenshot: {
                        type: 'object'
                    }
                },
                required: [
                    'description',
                    'screenshot'
                ]
            }
        },
        input: {
            url: 'https://www.google.com'
        },
        expression: `
            $goTo(url);
            $clickOn('button:has-text("Tout accepter")');
            $fill('textarea[aria-label="Rech."]', query, { 'pressEnter': true });

            {
              'description': $readText('[data-attrid=VisualDigestDescription] div:nth-child(2) > span:nth-child(1)'),
              'screenshot': $screenshot()
            }

        `
    }
}
```

Our surf :

```javascript
{
    input: 'hello world',
    expression: `

        $call('http://trusted.com/shared-surfs.json#/search', {
            'url': 'https://www.google.fr',
            'query': $
        }).description

    `
}
```

Tadaaaa ! We can reuse code. It is also possible to export functions, but the logic of input/expression/output is recommanded.

## startSurfing

High functions will use the last found resources of the surf. If not found, they will be created. To explicit them, you can declare your surfing. For example (everything is optionnal) :
```
$startSurfing({
    'browser': 'firefox',
    'session': {'id': 'abc', 'ttl': 'P1M'},
    'timezone': 'Europe/Madrid',
    'locale': 'es_ES'
});
 ```

 i18nPreset allows to give a preset (alias) of a set of internationalization params, including timezone, locale, proxy, etc.

 StartSurfing can be called several times in the same surf. A Surfing context is created (and pages will be created then).

## Notes

SurfQL is on top of JSONATA (input -> transformation -> output). Browsers are managed by Browserless (warning to the licence), but it should be good to have an opensource alternative with minimum firefox and chrome and autostart and garbage system, drived by playwright.

For output, Web Surfer will choose the content type (json/plain/image/etc) depending of the returned value. To force the type, use Accept http header. To force binary encoding (in case of json for example), use explicit method (ex $base64) (or header ?)

Cases :
- Output is string : text/plain
- Output is Buffer : identify the type and returns raw data
- Output is object/boolean : application/json

When output contains string (text/plain or application/json), binary data will be represented as base64 by default.

## Todo

- Add LLM (IA) input that will use model + MCP (and cached plan ?)
  - MCP calls are provided, previously generated by AI. Why not the prompt to regenerate it if it fails
  - For example for doctolib :
    - browser_navigate_mcp_play { "url": "https://www.doctolib.fr/xx/paris/xx-xx/booking/availabilities?yyy" }
    - browser_evaluate_mcp_play
```
{
  "function": "() => {\n    const moisFr = {\n        \"janvier\": 0,\n        \"février\": 1,\n        \"fevrier\": 1,\n        \"mars\": 2,\n        \"avril\": 3,\n        \"mai\": 4,\n        \"juin\": 5,\n        \"juillet\": 6,\n        \"août\": 7,\n        \"aout\": 7,\n        \"septembre\": 8,\n        \"octobre\": 9,\n        \"novembre\": 10,\n        \"décembre\": 11,\n        \"decembre\": 11\n    };\n\n    function parseDateFr(text) {\n        // Exemple : \"Vendredi 23 janvier 2026\"\n        const m = text.match(/\\w+ (\\d{1,2}) (\\w+) (\\d{4})/);\n        if (!m) return null;\n        const day = parseInt(m[1], 10);\n        const monthName = m[2].toLowerCase();\n        const year = parseInt(m[3], 10);\n        const monthIndex = moisFr[monthName];\n        if (monthIndex === undefined) return null;\n        return new Date(year, monthIndex, day);\n    }\n\n    const today = new Date();\n    const maxDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);\n\n    const allResults = [];\n\n    // Sur cette page Doctolib, chaque jour de créneaux est généralement un <h2>\n    const headings = Array.from(document.querySelectorAll('h2'));\n\n    for (const h2 of headings) {\n        const dateLabel = (h2.textContent || '').trim();\n        const dateObj = parseDateFr(dateLabel);\n        if (!dateObj) continue; // Ignore les h2 qui ne sont pas des dates complètes\n\n        // On remonte au conteneur du bloc de la journée\n        let section = h2.parentElement;\n        if (section && section.parentElement && section.querySelectorAll('button').length === 0) {\n            section = section.parentElement;\n        }\n        if (!section) continue;\n\n        const daySlots = [];\n        const buttons = section.querySelectorAll('button');\n\n        for (const btn of buttons) {\n            const text = (btn.textContent || '').trim();\n            const m = text.match(/(\\d{2}:\\d{2})/);\n            if (!m) continue; // pas d'heure dans le bouton\n            const time = m[1];\n\n            daySlots.push({\n                time,\n                label: text\n            });\n        }\n\n        if (daySlots.length > 0) {\n            allResults.push({\n                dateLabel,\n                dateObj,\n                slots: daySlots\n            });\n        }\n    }\n\n    // Filtrage sur les 15 prochains jours\n    const filtered = allResults\n        .filter(d => d.dateObj >= today && d.dateObj <= maxDate)\n        .map(d => ({\n            dateLabel: d.dateLabel,\n            dateISO: d.dateObj.toISOString().slice(0, 10),\n            slots: d.slots\n        }));\n\n    return filtered;\n}\n",
  "element": "extraction et filtrage des créneaux doctolib sur 15 jours"
}
```
- Add debug video support ?
- Ability to get/set sessions vars (stateless service ?)
- Ability to put defaults values in the json (browser name, etc) to be able to have separated context and steps
- Use https://github.com/Kaliiiiiiiiii-Vinyzu/patchright ?
- Native Yaml support
- Global Registry and/or user registry
- Direct http call without browser
- Ability to call with GET with CORS allow -> need URL token (jwt ?) to exec it
- Cache ?
- Resolve import on $call call instead of init, with ability to refer to the same "document"
- Add URI sha1 check to ensure a resource has not changed ? Or another way to manage contracts/trust ?
- Add contracts zod for inputs/output, etc
- Use @gallolabs/application on top
- Create Browserless alternative for the need
- Replace Typebox by Zod ?


## Help

Go to http://localhost:3000/doc for OpenAPI doc with surfQL available methods.

![The doc preview](doc.png)
