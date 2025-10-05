// Settings and debug logging management

// Generate session ID on page load
const SESSION_ID = Math.random().toString(36).substring(2, 15)

// Debug logging to localStorage
function addDebugLog(message) {
  const timestamp = new Date().toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const logEntry = {
    sessionId: SESSION_ID,
    timestamp: timestamp,
    message: message
  }

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

  // Keep only last 20 logs
  if (logs.length > 20) {
    logs = logs.slice(-20)
  }

  // Save back to localStorage
  try {
    localStorage.setItem('debugLogs', JSON.stringify(logs))
  } catch (e) {
    console.error('Error saving debug logs:', e)
  }

  // Update output if it exists
  updateLogDisplay()
}

function updateLogDisplay() {
  const output = document.getElementById('output')
  if (output) {
    const stored = localStorage.getItem('debugLogs')
    if (stored) {
      const logs = JSON.parse(stored)
      output.innerHTML = logs.map(log => {
        const isOld = log.sessionId !== SESSION_ID
        const cssClass = isOld ? 'log-old' : ''
        return `<div class="${cssClass}">[${log.timestamp}] ${log.message}</div>`
      }).join('')
      // Auto-scroll to bottom
      output.scrollTop = output.scrollHeight
    }
  }
}

function loadDebugLogs() {
  updateLogDisplay()
}

function clearDebugLogs() {
  localStorage.removeItem('debugLogs')
  const output = document.getElementById('output')
  if (output) {
    output.innerHTML = ''
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
    localStorage.removeItem('disableBMW')
    localStorage.removeItem('disableMitsubishi')
    localStorage.removeItem('bmw_vin')
    location.reload()
  }
}

async function killBrowser() {
  if (confirm('Kill browser process?')) {
    try {
      const response = await fetch('/api/kill-browser', { method: 'POST' })
      const data = await response.json()
      addDebugLog(`POST /api/kill-browser: ${response.status}`)
    } catch (e) {
      addDebugLog(`POST /api/kill-browser: ERROR - ${e.message}`)
    }
  }
}

async function updateApp() {
  if (confirm('Update application? This will pull latest changes and restart.')) {
    try {
      const response = await fetch('/api/redeploy', { method: 'POST' })
      const data = await response.json()
      addDebugLog(`POST /api/redeploy: ${response.status}`)
      setTimeout(() => location.reload(), 2000)
    } catch (e) {
      addDebugLog(`POST /api/redeploy: ERROR - ${e.message}`)
    }
  }
}

async function rebootSystem() {
  if (confirm('Reboot system? This will restart the entire system.')) {
    try {
      const response = await fetch('/api/reboot', { method: 'POST' })
      const data = await response.json()
      addDebugLog(`POST /api/reboot: ${response.status}`)
    } catch (e) {
      addDebugLog(`POST /api/reboot: ERROR - ${e.message}`)
    }
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
  const disableBMW = localStorage.getItem('disableBMW') === 'true'
  const disableMitsubishi = localStorage.getItem('disableMitsubishi') === 'true'

  document.getElementById('darkModeSelect').value = themeMode
  document.getElementById('maxValue').value = maxValue
  document.getElementById('carStatusInterval').value = carStatusInterval
  document.getElementById('weatherInterval').value = weatherInterval
  document.getElementById('testModeToggle').checked = testMode
  document.getElementById('disableBMWToggle').checked = disableBMW
  document.getElementById('disableMitsubishiToggle').checked = disableMitsubishi

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

function toggleDisableBMW() {
  const disabled = document.getElementById('disableBMWToggle').checked
  localStorage.setItem('disableBMW', disabled)

  if (typeof updateBMWStatus === 'function') {
    updateBMWStatus()
  }
}

function toggleDisableMitsubishi() {
  const disabled = document.getElementById('disableMitsubishiToggle').checked
  localStorage.setItem('disableMitsubishi', disabled)

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
