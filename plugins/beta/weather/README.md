# Weather

Today's weather for templates, Today's greeting and the day's log, from Open-Meteo with no key.

- **In templates**: `{{weather.summary}}`, `{{weather.city}}`, `{{weather.temperature}}`, `{{weather.min}}`,
  `{{weather.max}}`, `{{weather.condition}}`, `{{weather.humidity}}`, `{{weather.wind}}`, `{{weather.rain}}`,
  `{{weather.sunrise}}`, `{{weather.sunset}}`… in a note made from a template. The template gets data; it never runs
  code.
- **In Today's greeting**: a chip with the sky, the temperature and the place (details on hover), and one with sunrise,
  sunset and the daylight left; asked again every half hour.
- **In the day's log**: the day's weather is written once a day as the log's `weather` property — when today's log is
  made, or after the first capture into it. The Daily plugin's header shows it.

## Settings

- **Place**: a city (Oslo, Madrid…); empty finds it from this machine's internet address (`api.seeip.org`).
- **Language of the descriptions** (`en`, `es`).

## Needs

Python 3 on the machine running Atlas's server (`helper.py`). The network: `api.open-meteo.com`,
`geocoding-api.open-meteo.com`, and `api.seeip.org` when no place is set.

## Platforms

Linux works; Android works (`phone = true`); macOS, Windows and a server are untested.

## Tests

`python3 test_helper.py` (Open-Meteo's answers, cut down).
