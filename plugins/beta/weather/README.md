# Weather

Today's weather for templates, Today's greeting and the day's log, from Open-Meteo, with no key. The template only
gets data: it never runs code.

## What it adds

- **Template values**: `{{weather.summary}}`, `{{weather.city}}`, `{{weather.temperature}}`, `{{weather.min}}`,
  `{{weather.max}}`, `{{weather.condition}}`, `{{weather.humidity}}`, `{{weather.wind}}`, `{{weather.rain}}`,
  `{{weather.sunrise}}`, `{{weather.sunset}}`… in a note made from a template (the `now` tool, `template = "weather"`).
- **Today's greeting**: a chip with the sky, the temperature and the place (details on hover), and one with sunrise,
  sunset and the daylight left; asked again every half hour.
- **The day's log**: the day's weather is written once a day as the log's `weather` property — when today's log is
  made (`on = "log"`) or after the first capture into it (`on = "capture"`). The Daily plugin's header shows it.
- Tools: `now`, `log_day`, `log_made`.

## Settings

- **Place**: a city (Oslo, Madrid…); empty: found from this machine's internet address (`api.seeip.org`).
- **Language of the descriptions** (`en`, `es`).

## How it fits

No requirements. Daily reads the `weather` property it writes.

## Needs

Nothing installed: the helper is JavaScript run inside Atlas's core. The network: `api.open-meteo.com`,
`geocoding-api.open-meteo.com`, and `api.seeip.org` when no place is set.

## Platforms

Linux works; Android works (`phone = true`); the others are untested.

## Status

Beta, a candidate for stable. Unit tests on cut-down Open-Meteo answers
(`node scripts/dev/plugin-ui.mjs --check plugins/beta/weather`); no end-to-end spec yet.
