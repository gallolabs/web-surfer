<p align="center">
    <img height="300" src="https://raw.githubusercontent.com/gallolabs/web-surfer/main/logo_w300.jpeg">
  <h1 align="center">Web Surfer</h1>
</p>

## Description

Web-Surfer is a webservice to automate (ex scrape) web surfs.

### Launch


```bash
npm i
sudo docker compose up
```

### Test

You can use the command :

```bash
npm run build
node dist/surf-cmd.js --surf-api 'http://localhost:3000' tests/doctolib.yaml --url 'https://www.doctolib.fr/chirurgien-visceral-et-digestif/le-blanc-mesnil/nouredine-oukachbi/booking/availabilities?specialityId=179&telehealth=false&placeId=practice-5105&motiveIds%5B%5D=860154&pid=practice-5105'
```

This will returns the availabilities for your doctor for the next 15 days :
```js
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
}
```

### Example : Use imports

```javascript
{
    variables: {
        query: 'hello world'
    },
    imports: {
        'google-search': {
            variables: {
                url: 'https://www.google.com'
            },
            imports: {
                'google-tools': 'http://www.my-trusted-content.com/google-tools.json'
            },
            expression: `
                function ($query) {(
                    $tools := $import('google-tools');

                    $goTo(url);
                    $tools.acceptPopinSpam();
                    $tools.fillSearch($query);

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

## Notes

SurfQL is on top of JSONATA. Browsers are managed by Browserless, but it should be good to have an opensource alternative with minimum firefox and chrome and autostart and garbage system, drived by playwright.

For output, Web Surfer will choose the content type (json/plain/image/etc) depending of the returned value. To force the type, use Accept http header. To force binary encoding (in case of json for example), use explicit method (ex $base64) (or header ?)

Cases :
- Output is string : text/plain
- Output is Buffer : identify the type and returns raw data
- Output is object/boolean : application/json

When output contains string (text/plain or application/json), binary data will be represented as base64 by default.

## Todo

1) Add contracts i/o for modules and why not variables, etc
2) Use @gallolabs/application on top
4) Create Browserless alternative for the need

## Help

Go to http://localhost:3000/doc for OpenAPI doc with surfQL available methods.

![The doc preview](doc.png)