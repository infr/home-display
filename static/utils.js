// Utility functions for clock and weather

// Clock
function updateClock() {
  const clockElement = document.getElementById('clock')
  const now = new Date()

  const date = now.toLocaleDateString('FI-fi', {
    weekday: 'short',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  })

  const time = now.toLocaleTimeString('FI-fi', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  clockElement.textContent = `${date} ${time}`
}

// Weather configuration
const WEATHER_LATITUDE = 60.2701
const WEATHER_LONGITUDE = 24.7976
const WEATHER_TIMEZONE = 'Europe/Helsinki'

async function fetchWeather() {
  const testMode = localStorage.getItem('testMode') === 'true'

  try {
    let weatherCodes, tempsMax, tempsMin, dates, currentTemp, currentWeatherCode

    if (testMode) {
      // Generate random test data
      addDebugLog(`GET /weather: TEST MODE`)
      weatherCodes = Array.from({ length: 7 }, () => [0, 1, 2, 3, 45, 61, 71, 95][Math.floor(Math.random() * 8)])
      tempsMax = Array.from({ length: 7 }, () => Math.floor(Math.random() * 50) - 20) // -20°C to 30°C
      tempsMin = tempsMax.map(max => max - Math.floor(Math.random() * 10) - 5) // 5-15°C lower than max
      dates = Array.from({ length: 7 }, (_, i) => {
        const date = new Date()
        date.setDate(date.getDate() + i)
        return date.toISOString().split('T')[0]
      })
      currentTemp = Math.floor(Math.random() * 50) - 20 // -20°C to 30°C
      currentWeatherCode = weatherCodes[0]
    } else {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_LATITUDE}&longitude=${WEATHER_LONGITUDE}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=${encodeURIComponent(
        WEATHER_TIMEZONE
      )}&current_weather=true`
      const response = await fetch(url)
      const data = await response.json()
      addDebugLog(`GET /weather: ${response.status}`)
      if (!data.daily) return
      const days = data.daily
      weatherCodes = days.weathercode
      tempsMax = days.temperature_2m_max
      tempsMin = days.temperature_2m_min
      dates = days.time
      currentTemp = data.current_weather?.temperature
      currentWeatherCode = data.current_weather?.weathercode
    }

    const icons = weatherCodes.map(code => weatherIcon(code))
    const dayNames = dates.map((d, i) =>
      i === 0 ? 'Today' : new Date(d).toLocaleDateString('en-US', { weekday: 'short' })
    )

    let html = ''
    if (typeof currentTemp === 'number') {
      html += `<div class="weather-card">
        <div class="weather-day">Now</div>
        <div class="weather-icon">${weatherIcon(currentWeatherCode)}</div>
        <div class="weather-temps">
          <span class="weather-high">${Math.round(currentTemp)}°</span>
        </div>
      </div>`
    }
    for (let i = 0; i < 3; i++) {
      html += `<div class="weather-card">
        <div class="weather-day">${dayNames[i]}</div>
        <div class="weather-icon">${icons[i]}</div>
        <div class="weather-temps">
          <span class="weather-high">${Math.round(tempsMax[i])}°</span>/<span class="weather-low">${Math.round(
        tempsMin[i]
      )}°</span>
        </div>
      </div>`
    }
    document.getElementById('weather').innerHTML = html
  } catch (e) {
    document.getElementById('weather').innerHTML = '<span style="color:#a00">Weather unavailable</span>'
    addDebugLog(`GET /weather: ERROR - ${e.message}`)
  }
}

// Open-Meteo weather codes: https://open-meteo.com/en/docs#api_form
function weatherIcon(code) {
  if ([0].includes(code)) return '☀️' // Clear
  if ([1, 2, 3].includes(code)) return '⛅' // Mainly clear/partly cloudy
  if ([45, 48].includes(code)) return '🌫️' // Fog
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '🌧️' // Rain
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '❄️' // Snow
  if ([95, 96, 99].includes(code)) return '⛈️' // Thunder
  return '☁️' // Default: Cloudy
}

// Auto-refresh every hour
setTimeout(() => {
  location.reload()
}, 60 * 60 * 1000)

// Initialize on page load
function initializeUtils() {
  updateClock()
  setInterval(updateClock, 1000)
  fetchWeather()
  // Refresh weather every 15 minutes (default, configurable in settings)
  const weatherInterval = (parseInt(localStorage.getItem('weatherInterval')) || 15) * 60 * 1000
  setInterval(fetchWeather, weatherInterval)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeUtils)
} else {
  initializeUtils()
}
