// Settings and debug logging management

// Debug logging to localStorage
function addDebugLog(message) {
  const timestamp = new Date().toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const logEntry = `[${timestamp}] ${message}`

  // Get existing logs from localStorage
  let logs = []
  try {
    const stored = localStorage.getItem('debugLogs')
    if (stored) {
      logs = JSON.parse(stored)
    }
  } catch (e) {
    console.error('Error reading debug logs:', e)
  }

  // Add new log
  logs.push(logEntry)

  // Keep only last 10 logs
  if (logs.length > 10) {
    logs = logs.slice(-10)
  }

  // Save back to localStorage
  try {
    localStorage.setItem('debugLogs', JSON.stringify(logs))
  } catch (e) {
    console.error('Error saving debug logs:', e)
  }

  // Update textarea if it exists
  const output = document.getElementById('output')
  if (output) {
    output.value = logs.join('\n')
  }
}

function loadDebugLogs() {
  try {
    const stored = localStorage.getItem('debugLogs')
    if (stored) {
      const logs = JSON.parse(stored)
      const output = document.getElementById('output')
      if (output) {
        output.value = logs.join('\n')
      }
    }
  } catch (e) {
    console.error('Error loading debug logs:', e)
  }
}

function clearDebugLogs() {
  localStorage.removeItem('debugLogs')
  const output = document.getElementById('output')
  if (output) {
    output.value = ''
  }
}

function updateCarStatusInterval() {
  const interval = parseInt(document.getElementById('carStatusInterval').value)
  localStorage.setItem('carStatusInterval', interval)
  alert('Car status interval updated. Please reload the page for changes to take effect.')
}

function updateWeatherInterval() {
  const interval = parseInt(document.getElementById('weatherInterval').value)
  localStorage.setItem('weatherInterval', interval)
  alert('Weather interval updated. Please reload the page for changes to take effect.')
}

function resetSettings() {
  if (confirm('Reset all settings to defaults?')) {
    localStorage.removeItem('themeMode')
    localStorage.removeItem('maxValue')
    localStorage.removeItem('carStatusInterval')
    localStorage.removeItem('weatherInterval')
    localStorage.removeItem('testMode')
    localStorage.removeItem('bmw_vin')
    location.reload()
  }
}

// Settings management
function isAutoDarkMode() {
  const now = new Date()
  const hour = now.getHours()
  return hour >= 19 || hour < 6
}

function applyTheme(isDark) {
  if (isDark) {
    document.documentElement.classList.add('dark-mode')
  } else {
    document.documentElement.classList.remove('dark-mode')
  }

  // Update chart colors
  if (typeof ELECTRICITY_CONFIG !== 'undefined') {
    ELECTRICITY_CONFIG.colors.background = isDark ? '#1f2937' : '#f3f4f6'
    ELECTRICITY_CONFIG.colors.text = isDark ? '#f3f4f6' : '#1f2937'
    ELECTRICITY_CONFIG.colors.grid = isDark ? '#4b5563' : '#d1d5db'
    if (typeof renderElectricityChart === 'function') {
      renderElectricityChart()
    }
  }
}

function loadSettings() {
  const themeMode = localStorage.getItem('themeMode') || 'auto'
  const maxValue = parseInt(localStorage.getItem('maxValue')) || 30
  const carStatusInterval = parseInt(localStorage.getItem('carStatusInterval')) || 5
  const weatherInterval = parseInt(localStorage.getItem('weatherInterval')) || 15
  const testMode = localStorage.getItem('testMode') === 'true'

  document.getElementById('darkModeSelect').value = themeMode
  document.getElementById('maxValue').value = maxValue
  document.getElementById('carStatusInterval').value = carStatusInterval
  document.getElementById('weatherInterval').value = weatherInterval
  document.getElementById('testModeToggle').checked = testMode

  // Apply theme based on mode
  if (themeMode === 'dark') {
    applyTheme(true)
  } else if (themeMode === 'auto') {
    applyTheme(isAutoDarkMode())
    // Check every minute if auto mode needs to update
    setInterval(() => {
      if (localStorage.getItem('themeMode') === 'auto') {
        applyTheme(isAutoDarkMode())
      }
    }, 60000)
  } else {
    applyTheme(false)
  }

  // Show/hide test mode indicator
  const indicator = document.getElementById('testModeIndicator')
  if (testMode) {
    indicator.classList.add('active')
  } else {
    indicator.classList.remove('active')
  }

  // Update electricity config
  if (typeof ELECTRICITY_CONFIG !== 'undefined') {
    ELECTRICITY_CONFIG.priceScale.max = maxValue
    ELECTRICITY_CONFIG.testMode = testMode
  }
}

function openSettings() {
  document.getElementById('settingsModal').style.display = 'block'
  loadDebugLogs()
}

function closeSettings() {
  document.getElementById('settingsModal').style.display = 'none'
}

function updateDarkMode() {
  const mode = document.getElementById('darkModeSelect').value
  localStorage.setItem('themeMode', mode)

  if (mode === 'dark') {
    applyTheme(true)
  } else if (mode === 'auto') {
    applyTheme(isAutoDarkMode())
  } else {
    applyTheme(false)
  }
}

function updateMaxValue() {
  const maxValue = parseInt(document.getElementById('maxValue').value)
  localStorage.setItem('maxValue', maxValue)
  if (typeof ELECTRICITY_CONFIG !== 'undefined') {
    ELECTRICITY_CONFIG.priceScale.max = maxValue
    if (typeof renderElectricityChart === 'function') {
      renderElectricityChart()
    }
  }
}

function toggleTestMode() {
  const testMode = document.getElementById('testModeToggle').checked
  localStorage.setItem('testMode', testMode)

  // Show/hide test mode indicator
  const indicator = document.getElementById('testModeIndicator')
  if (testMode) {
    indicator.classList.add('active')
  } else {
    indicator.classList.remove('active')
  }

  if (typeof ELECTRICITY_CONFIG !== 'undefined') {
    ELECTRICITY_CONFIG.testMode = testMode
    if (typeof fetchElectricityPrices === 'function') {
      fetchElectricityPrices()
    }
  }

  // Update BMW and Mitsubishi status with test data
  if (typeof updateBMWStatus === 'function') {
    updateBMWStatus()
  }
  if (typeof updateMitsubishiStatus === 'function') {
    updateMitsubishiStatus()
  }
}

// Close modal when clicking outside
window.onclick = function(event) {
  const modal = document.getElementById('settingsModal')
  if (event.target === modal) {
    closeSettings()
  }
}

// Load settings on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadSettings)
} else {
  loadSettings()
}
