"""`python3 test_helper.py`: Open-Meteo's answers (cut down) as a template sees them."""
import unittest

import helper

GEO = {"results": [{"name": "Oslo", "admin1": "Oslo", "country": "Norway", "latitude": 59.91, "longitude": 10.75}]}
FORECAST = {"current": {"temperature_2m": 9.6, "apparent_temperature": 6.8, "relative_humidity_2m": 81, "wind_speed_10m": 14.2, "weather_code": 61},
            "daily": {"temperature_2m_max": [12.1], "temperature_2m_min": [4.4], "sunrise": ["2026-10-17T07:08"], "sunset": ["2026-10-17T18:02"], "precipitation_sum": [3.2]}}


def web(asked=None):
    def get(url):
        if asked is not None:
            asked.append(url)
        return GEO if "geocoding" in url else FORECAST if "forecast" in url else {"city": "Massy", "latitude": 48.7, "longitude": 2.28}
    return get


class Weather(unittest.TestCase):
    def test_the_place_set_gives_a_summary_in_the_vaults_language(self):
        w = helper.now_with(web(), {"settings": {"place": "Oslo", "language": "es"}})
        self.assertEqual((w["city"], w["temperature"], w["condition"]), ("Oslo", "10 °C", "lluvia ligera"))
        self.assertEqual(w["summary"], "10 °C, lluvia ligera, 4 °C / 12 °C")
        self.assertEqual((w["sunrise"], w["rain"], w["humidity"]), ("07:08", "3.2 mm", "81 %"))

    def test_without_a_place_the_machines_address_is_used(self):
        asked = []
        w = helper.now_with(web(asked), {"settings": {}})
        self.assertEqual((w["city"], w["condition"]), ("Massy", "light rain"))
        self.assertTrue(asked[0].startswith("https://api.seeip.org"))



class LogDayTest(unittest.TestCase):
    """The day's weather on today's log, once."""
    def test_once_on_todays_log_only(self):
        import datetime
        today = datetime.date.today().isoformat()
        written = {}
        def get(u):
            if "geocoding" in u:
                return {"results": [{"name": "Oslo", "latitude": 59.91, "longitude": 10.75, "country": "Norway"}]}
            return {"current": {"temperature_2m": 4.2, "weather_code": 3}, "daily": {"temperature_2m_max": [8], "temperature_2m_min": [1]}}
        p = {"path": f"notes/log/{today}.md", "settings": {"place": "Oslo"}}
        self.assertEqual(helper.log_day_with(get, lambda _: "---\ndate: x\n---\n", lambda path, k, v: written.update({k: v}), p), {"skipped": "weather noted"})
        self.assertTrue(written["weather"].startswith("☁ 4 °C"), written)  # the sky first, from its code
        self.assertEqual(helper.log_day_with(get, lambda _: "weather: 4 °C", lambda *a: self.fail("twice"), p)["skipped"], "the day has its weather")
        self.assertEqual(helper.log_day_with(get, lambda _: "", lambda *a: self.fail("an old day"), {"path": "notes/log/2020-01-01.md"})["skipped"], "not today's log")

    def test_todays_log_is_filled_once_it_is_there_with_the_sun_times(self):
        import datetime
        path = f"notes/log/{datetime.date.today().isoformat()}.md"
        written = {}
        p = {"settings": {"place": "Oslo"}}
        self.assertEqual(helper.fill_today_with(web(), lambda: {"log": {"path": path}}, lambda _: None, lambda *a: self.fail("no log yet"), p), {"skipped": "no log today yet"})
        helper.fill_today_with(web(), lambda: {"log": {"path": path}}, lambda _: "---\ndate: x\n---\n", lambda _p, k, v: written.update({k: v}), p)
        self.assertEqual(written["weather"], "🌧 10 °C, light rain, 4 °C / 12 °C · Oslo · ↑07:08 ↓18:02")


if __name__ == "__main__":
    unittest.main()
