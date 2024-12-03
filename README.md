<p align="center">
    <img height="300" src="https://raw.githubusercontent.com/gallolabs/bobot/main/logo_w300.jpeg">
  <p align="center"><strong>Web Surfer</strong></p>
</p>

A POC for a scraping tool through API. In development.

## POST /surf with SurfQL

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
