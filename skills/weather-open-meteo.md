---
name: weather-open-meteo
type: skill
description: Fetch current weather and forecasts from the Open-Meteo public API
tool: net.fetch
parameters:
  url: string
---

Fetch read-only weather data from Open-Meteo using public, unauthenticated API endpoints. Use this skill when the user asks for current conditions, hourly forecasts, daily forecasts, temperature, precipitation, wind, humidity, UV index, or weather codes for a place or coordinates.

**Allowed base URLs**: only call Open-Meteo public GET endpoints, especially:
- `https://geocoding-api.open-meteo.com/v1/search?...` for converting place names or postal codes to latitude/longitude.
- `https://api.open-meteo.com/v1/forecast?...` for weather forecasts and current conditions.

**Do not use** this skill for authenticated APIs, paid-only endpoints, non-weather web browsing, write operations, or requests to non-Open-Meteo hosts.

**Common workflow**:
1. If the user gives a place name, first URL-encode the name and call geocoding, for example `https://geocoding-api.open-meteo.com/v1/search?name=San%20Francisco&count=5&language=en&format=json`.
2. Choose the best geocoding match using the returned name, admin region, country, latitude, longitude, and timezone. If multiple likely matches remain, ask the user to clarify before fetching weather.
3. Fetch weather with latitude and longitude, using `timezone=auto` unless the user requests another timezone.
4. Keep requests focused: request only the variables needed for the answer and limit `forecast_days` when a short forecast is requested.
5. Parse JSON responses and summarize values with their units from `current_units`, `hourly_units`, and `daily_units` when present.
6. Mention the resolved location and forecast timezone in the answer. If the API returns an error, empty results, or invalid JSON, report that plainly.

**Useful forecast URL examples**:
- Current conditions: `https://api.open-meteo.com/v1/forecast?latitude=37.7749&longitude=-122.4194&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m&timezone=auto`
- Hourly forecast: `https://api.open-meteo.com/v1/forecast?latitude=37.7749&longitude=-122.4194&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,cloud_cover,wind_speed_10m&forecast_days=2&timezone=auto`
- Daily forecast: `https://api.open-meteo.com/v1/forecast?latitude=37.7749&longitude=-122.4194&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max,sunrise,sunset&forecast_days=7&timezone=auto`

**Weather code summary**:
- `0`: clear sky
- `1`, `2`, `3`: mainly clear, partly cloudy, overcast
- `45`, `48`: fog or depositing rime fog
- `51`, `53`, `55`: drizzle; `56`, `57`: freezing drizzle
- `61`, `63`, `65`: rain; `66`, `67`: freezing rain
- `71`, `73`, `75`: snow fall; `77`: snow grains
- `80`, `81`, `82`: rain showers
- `85`, `86`: snow showers
- `95`: thunderstorm; `96`, `99`: thunderstorm with hail

Open-Meteo forecast documentation describes `/v1/forecast` as accepting latitude/longitude plus weather variables and returning JSON forecasts. Open-Meteo geocoding documentation describes `/v1/search` as accepting a required `name` search term and returning matching locations.
