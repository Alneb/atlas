// Built from helper/helper.ts by scripts/dev/plugin-ui.mjs: edit the sources, not this file.
(function() {
	//#region plugins/beta/weather/helper/helper.ts
	const CODES = {
		0: ["clear sky", "despejado"],
		1: ["mainly clear", "mayormente despejado"],
		2: ["partly cloudy", "parcialmente nublado"],
		3: ["overcast", "cubierto"],
		45: ["fog", "niebla"],
		48: ["rime fog", "niebla con escarcha"],
		51: ["light drizzle", "llovizna ligera"],
		53: ["drizzle", "llovizna"],
		55: ["dense drizzle", "llovizna densa"],
		56: ["freezing drizzle", "llovizna helada"],
		57: ["freezing drizzle", "llovizna helada"],
		61: ["light rain", "lluvia ligera"],
		63: ["rain", "lluvia"],
		65: ["heavy rain", "lluvia fuerte"],
		66: ["freezing rain", "lluvia helada"],
		67: ["freezing rain", "lluvia helada"],
		71: ["light snow", "nevada ligera"],
		73: ["snow", "nieve"],
		75: ["heavy snow", "nevada fuerte"],
		77: ["snow grains", "granizo fino"],
		80: ["light showers", "chubascos ligeros"],
		81: ["showers", "chubascos"],
		82: ["violent showers", "chubascos fuertes"],
		85: ["snow showers", "chubascos de nieve"],
		86: ["heavy snow showers", "chubascos de nieve fuertes"],
		95: ["thunderstorm", "tormenta"],
		96: ["thunderstorm with hail", "tormenta con granizo"],
		99: ["thunderstorm with hail", "tormenta con granizo"]
	};
	const ICONS = [
		[
			0,
			0,
			"☀"
		],
		[
			1,
			1,
			"🌤"
		],
		[
			2,
			2,
			"⛅"
		],
		[
			3,
			3,
			"☁"
		],
		[
			45,
			48,
			"🌫"
		],
		[
			51,
			57,
			"🌦"
		],
		[
			61,
			67,
			"🌧"
		],
		[
			71,
			77,
			"❄"
		],
		[
			80,
			82,
			"🌦"
		],
		[
			85,
			86,
			"🌨"
		],
		[
			95,
			99,
			"⛈"
		]
	];
	function iconOf(code) {
		if (typeof code !== "number") return void 0;
		return ICONS.find(([a, b]) => code >= a && code <= b && (a !== 45 || code === 45 || code === 48))?.[2];
	}
	const HEADERS = { "User-Agent": "Atlas/0.1 (personal notes app) weather" };
	const getJson = (url) => atlas.fetchJson(url, { headers: HEADERS });
	/** The setting's place (Open-Meteo's geocoder), else this machine's (its internet address). */
	async function placeOf(settings) {
		const name = String(settings.place ?? "").trim();
		if (name) {
			const hits = (await getJson(`https://geocoding-api.open-meteo.com/v1/search?${atlas.qs({
				name,
				count: 1
			})}`))?.results ?? [];
			if (!hits.length) throw new Error(`no place called "${name}" (Settings → Weather)`);
			const h = hits[0];
			return {
				city: h.name,
				region: h.admin1,
				country: h.country,
				latitude: h.latitude,
				longitude: h.longitude
			};
		}
		const ip = await getJson("https://api.seeip.org/geoip") ?? {};
		if (ip.latitude === void 0) throw new Error("no place set and this machine's address gave none (Settings → Weather → Place)");
		return {
			city: ip.city,
			region: ip.region,
			country: ip.country,
			latitude: ip.latitude,
			longitude: ip.longitude
		};
	}
	const deg = (v) => typeof v === "number" ? `${Math.round(v)} °C` : void 0;
	/** Only the fields that have a value: a template's `{{weather.x}}` stays empty rather than printing "undefined". */
	function present(o) {
		return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== void 0 && v !== null && v !== ""));
	}
	async function now(params) {
		const settings = params.settings ?? {};
		const es = settings.language === "es";
		const place = await placeOf(settings);
		const w = await getJson("https://api.open-meteo.com/v1/forecast?" + atlas.qs({
			latitude: place.latitude,
			longitude: place.longitude,
			timezone: "auto",
			forecast_days: 1,
			current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code",
			daily: "temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum"
		})) ?? {};
		const cur = w.current ?? {}, day = w.daily ?? {};
		const first = (k) => (day[k] ?? [])[0];
		const words = CODES[cur.weather_code]?.[es ? 1 : 0];
		const out = {
			...present({ ...place }),
			temperature: deg(cur.temperature_2m),
			feels_like: deg(cur.apparent_temperature),
			condition: words,
			icon: iconOf(cur.weather_code),
			humidity: cur.relative_humidity_2m != null ? `${cur.relative_humidity_2m} %` : void 0,
			wind: cur.wind_speed_10m != null ? `${Math.round(cur.wind_speed_10m)} km/h` : void 0,
			min: deg(first("temperature_2m_min")),
			max: deg(first("temperature_2m_max")),
			rain: first("precipitation_sum") ? `${first("precipitation_sum")} mm` : void 0,
			sunrise: String(first("sunrise") ?? "").slice(11, 16),
			sunset: String(first("sunset") ?? "").slice(11, 16)
		};
		const range = out.min && out.max ? `${out.min} / ${out.max}` : void 0;
		out.summary = [
			out.temperature,
			words,
			range
		].filter(Boolean).join(", ");
		return present(out);
	}
	/** The day's weather as its log keeps it: "⛅ 11 °C, partly cloudy, 6 °C / 14 °C · Paris · ↑08:16 ↓18:53". */
	function dayLine(w) {
		const sun = w.sunrise && w.sunset ? `↑${w.sunrise} ↓${w.sunset}` : void 0;
		return [
			(w.icon ? `${w.icon} ` : "") + w.summary,
			w.city,
			sun
		].filter(Boolean).join(" · ");
	}
	/** This machine's date, as a day's log is named (`YYYY-MM-DD`). */
	function today() {
		const d = /* @__PURE__ */ new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	}
	async function textOf(path) {
		try {
			return (await atlas.get("/api/file", { path }))?.text ?? null;
		} catch {
			return null;
		}
	}
	/** After a capture into a day's log (`<log folder>/YYYY-MM-DD.md`): that day's weather as its `weather` property, once.
	* Never the day of an old log, never twice; it answers `skipped`, so the capture is linked to nothing. */
	async function logDay(params) {
		const path = String(params.path ?? "");
		const m = /(?:^|\/)(\d{4}-\d{2}-\d{2})\.md$/.exec(path);
		if (!m) return { skipped: "not a day's log" };
		if (m[1] !== today()) return { skipped: "not today's log" };
		if (/^weather:/m.test(await textOf(path) ?? "")) return { skipped: "the day has its weather" };
		const w = await now(params);
		if (w.summary) await atlas.put("/api/property", {
			path,
			key: "weather",
			text: dayLine(w),
			list: false
		});
		return { skipped: "weather noted" };
	}
	/** Today's log, once it is there, gets the day's weather — with Atlas open, not only after the first capture. Never
	* makes the log; never twice. */
	async function fillToday(params) {
		const path = (await atlas.get("/api/today"))?.log?.path ?? "";
		if (!path || await textOf(path) === null) return { skipped: "no log today yet" };
		return logDay({
			...params,
			path
		});
	}
	atlas.methods({
		now,
		log_day: logDay,
		log_made: logDay,
		fill_today: fillToday
	});
	//#endregion
})();
