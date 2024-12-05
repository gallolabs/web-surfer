<p align="center">
    <img height="300" src="https://raw.githubusercontent.com/gallolabs/bobot/main/logo_w300.jpeg">
  <h1 align="center">Web Surfer</h1>
</p>

A POC for a scraping tool through API. In development.

## POST /surf with SurfQL

- Hight level API with functions, with simple naming like human actions (I go to, I click on, I fill, I read something, etc)
- Low level API with object returned by $startSurfing()

```application/json
{
    "variables": {
        "energyUrl": 'https://myenergyspace.com'
    },
    "expression": `
        /* I start my firefox browser */
        $startSurfing({
            'browser': 'firefox',
            'session': {'id': 'abc', 'ttl': 3600},
            'i18nPreset': 'FR', /* proxy + (geoloc) + locale + timezone */
        });

        /* I go to my url in the current tab */
        $myUrl := $goTo(energyUrl);

        if ($contains($myUrl, 'connexion')) {
            /* I fill the login form if I am not logged */
            $fill({
                username: 'hello',
                password: 'world'
            }, { pressEnter: true });
        }

        /* I click on a button to reach my page */
        $clickOn('My Consumption');

        /* I obtain the content of the warning and a screenshot */
        {
            "warning": $readTextOf('div.warning'),
            "screenshot": $screenshot()
        };
    `
}
```

SurfQL is on top of JSONATA. Browsers are managed by Browserless, but it should be good to have an opensource alternative with minimum firefox and chrome and autostart and garbage system, drived by playwright.

For output, Web Surfer will choose the content type (json/plain/image/etc) depending of the returned value. To force the type, use Accept http header. To force binary encoding (in case of json for example), use explicit method (ex $base64) (or header ?)

Cases :
- Output is string : text/plain
- Output is Buffer : identify the type and returns raw data
- Output is object/boolean : application/json

When output contains string (text/plain or application/json), binary data will be represented as base64 by default.
