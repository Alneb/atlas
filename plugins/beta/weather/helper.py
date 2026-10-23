"""Weather for templates: `now` answers today's weather at the place (Open-Meteo, no key), as the value of
`{{weather…}}` in a note made from a template. The logic takes its transport, so test_helper.py runs offline."""
import urllib.parse

# WMO weather codes (Open-Meteo's `weather_code`) → words
CODES = {
    0: ("clear sky", "despejado"), 1: ("mainly clear", "mayormente despejado"), 2: ("partly cloudy", "parcialmente nublado"),
    3: ("overcast", "cubierto"), 45: ("fog", "niebla"), 48: ("rime fog", "niebla con escarcha"),
    51: ("light drizzle", "llovizna ligera"), 53: ("drizzle", "llovizna"), 55: ("dense drizzle", "llovizna densa"),
    56: ("freezing drizzle", "llovizna helada"), 57: ("freezing drizzle", "llovizna helada"),
    61: ("light rain", "lluvia ligera"), 63: ("rain", "lluvia"), 65: ("heavy rain", "lluvia fuerte"),
    66: ("freezing rain", "lluvia helada"), 67: ("freezing rain", "lluvia helada"),
    71: ("light snow", "nevada ligera"), 73: ("snow", "nieve"), 75: ("heavy snow", "nevada fuerte"), 77: ("snow grains", "granizo fino"),
    80: ("light showers", "chubascos ligeros"), 81: ("showers", "chubascos"), 82: ("violent showers", "chubascos fuertes"),
    85: ("snow showers", "chubascos de nieve"), 86: ("heavy snow showers", "chubascos de nieve fuertes"),
    95: ("thunderstorm", "tormenta"), 96: ("thunderstorm with hail", "tormenta con granizo"), 99: ("thunderstorm with hail", "tormenta con granizo"),
}


def icon_of(code):
    """The sky as one symbol, from the same code as its words: what the greeting and a day's log show."""
    if code is None:
        return None
    for codes, icon in ((0,), "☀"), ((1,), "🌤"), ((2,), "⛅"), ((3,), "☁"), ((45, 48), "🌫"), (range(51, 58), "🌦"), (range(61, 68), "🌧"), \
            (range(71, 78), "❄"), (range(80, 83), "🌦"), ((85, 86), "🌨"), (range(95, 100), "⛈"):
        if code in codes:
            return icon
    return None


def place_of(get, settings):
    """{city, region, country, latitude, longitude}: the setting's place (Open-Meteo's geocoder), else this machine's."""
    name = str(settings.get("place") or "").strip()
    if name:
        hits = (get(f"https://geocoding-api.open-meteo.com/v1/search?name={urllib.parse.quote(name)}&count=1") or {}).get("results") or []
        if not hits:
            raise ValueError(f"no place called {name!r} (Settings → Weather)")
        h = hits[0]
        return {"city": h.get("name"), "region": h.get("admin1"), "country": h.get("country"), "latitude": h["latitude"], "longitude": h["longitude"]}
    ip = get("https://api.seeip.org/geoip") or {}
    if "latitude" not in ip:
        raise ValueError("no place set and this machine's address gave none (Settings → Weather → Place)")
    return {"city": ip.get("city"), "region": ip.get("region"), "country": ip.get("country"), "latitude": ip["latitude"], "longitude": ip["longitude"]}


def deg(v):
    return f"{round(v)} °C" if isinstance(v, (int, float)) else None


def now_with(get, params):
    settings = params.get("settings") or {}
    es = settings.get("language") == "es"
    place = place_of(get, settings)
    w = get("https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode({
        "latitude": place["latitude"], "longitude": place["longitude"], "timezone": "auto", "forecast_days": 1,
        "current": "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code",
        "daily": "temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum"})) or {}
    cur, day = w.get("current") or {}, w.get("daily") or {}
    first = lambda k: (day.get(k) or [None])[0]
    words = CODES.get(cur.get("weather_code"), ("", ""))[1 if es else 0] or None
    out = {
        **{k: v for k, v in place.items() if v not in (None, "")},
        "temperature": deg(cur.get("temperature_2m")),
        "feels_like": deg(cur.get("apparent_temperature")),
        "condition": words,
        "icon": icon_of(cur.get("weather_code")),
        "humidity": f"{cur['relative_humidity_2m']} %" if cur.get("relative_humidity_2m") is not None else None,
        "wind": f"{round(cur['wind_speed_10m'])} km/h" if cur.get("wind_speed_10m") is not None else None,
        "min": deg(first("temperature_2m_min")), "max": deg(first("temperature_2m_max")),
        "rain": f"{first('precipitation_sum')} mm" if first("precipitation_sum") else None,
        "sunrise": (first("sunrise") or "")[11:16] or None, "sunset": (first("sunset") or "")[11:16] or None,
    }
    parts = [out["temperature"], words, out["min"] and out["max"] and f"{out['min']} / {out['max']}"]
    out["summary"] = ", ".join(p for p in parts if p) or None
    return {k: v for k, v in out.items() if v not in (None, "")}


def log_day_with(get, read_text, set_property, params):
    """After a capture into a day's log (`<log folder>/YYYY-MM-DD.md`): that day's weather as its `weather` property, once.
    Never the day of an old log, never twice; it answers `skipped`, so the capture is linked to nothing."""
    import re
    path = str(params.get("path") or "")
    m = re.search(r"(?:^|/)(\d{4}-\d{2}-\d{2})\.md$", path)
    if not m:
        return {"skipped": "not a day's log"}
    import datetime
    if m.group(1) != datetime.date.today().isoformat():
        return {"skipped": "not today's log"}
    text = read_text(path) or ""
    if re.search(r"^weather:", text, re.M):
        return {"skipped": "the day has its weather"}
    w = now_with(get, params)
    if w.get("summary"):
        set_property(path, "weather", day_line(w))
    return {"skipped": "weather noted"}


def day_line(w):
    """The day's weather as its log keeps it: "⛅ 11 °C, partly cloudy, 6 °C / 14 °C · Paris · ↑08:16 ↓18:53"."""
    parts = [(f"{w['icon']} " if w.get("icon") else "") + w["summary"], w.get("city"),
             w.get("sunrise") and w.get("sunset") and f"↑{w['sunrise']} ↓{w['sunset']}"]
    return " · ".join(p for p in parts if p)


def fill_today_with(get, today, read_text, set_property, params):
    """Today's log, once it is there, gets the day's weather — with Atlas open, not only after the first capture (the
    user, 2026-10-19: "there is no weather inside the note"). Never makes the log; never twice."""
    path = (today() or {}).get("log", {}).get("path") or ""
    if not path or read_text(path) is None:
        return {"skipped": "no log today yet"}
    return log_day_with(get, read_text, set_property, {**params, "path": path})


if __name__ == "__main__":
    import atlas_plugin as atlas

    @atlas.method
    def now(params):
        return now_with(lambda u: atlas.fetch_json(u, headers={"User-Agent": "Atlas/0.1 (personal notes app) weather"}), params)

    def text_of(path):
        try:
            return (atlas.get("/api/file", path=path) or {}).get("text")
        except Exception:  # noqa: BLE001 — no such file yet
            return None

    @atlas.method
    def log_day(params):
        return log_day_with(
            lambda u: atlas.fetch_json(u, headers={"User-Agent": "Atlas/0.1 (personal notes app) weather"}),
            text_of,
            lambda path, key, value: atlas.put("/api/property", {"path": path, "key": key, "text": value, "list": False}),
            params)

    @atlas.method
    def log_made(params):
        return log_day(params)

    @atlas.method
    def fill_today(params):
        return fill_today_with(
            lambda u: atlas.fetch_json(u, headers={"User-Agent": "Atlas/0.1 (personal notes app) weather"}),
            lambda: atlas.get("/api/today"),
            text_of,
            lambda path, key, value: atlas.put("/api/property", {"path": path, "key": key, "text": value, "list": False}),
            params)

    atlas.serve()
