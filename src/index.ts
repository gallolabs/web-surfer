import {WebSurfer, WebSurferConfig} from './web-surfer.js'
import server from './http.js'
import SessionsHandler from './sessions.js'

const config: WebSurferConfig = {
    defaults: {
        browser: 'firefox',
        timezone: 'Europe/Paris',
        locale: 'fr_FR'
    },
    browserLaunchers: {
        firefox: 'ws://browserless:3000/firefox/playwright?token=6R0W53R135510&launch={options}',
        chrome: 'ws://browserless:3000/chrome/playwright?token=6R0W53R135510&launch={options}',
        chromium: 'ws://browserless:3000/chromium/playwright?token=6R0W53R135510&launch={options}',
        webkit: 'ws://browserless:3000/webkit/playwright?token=6R0W53R135510&launch={options}',
    },
    sessionsHandler: new SessionsHandler({sessionsDir: '/var/cache/websurfer/sessions'})
}

const webSurfer = new WebSurfer(config)
await server(webSurfer)
