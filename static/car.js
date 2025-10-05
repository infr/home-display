// Car animations and controls

// Helper functions for car status management
function getCarElements(carId) {
  return {
    connectionBadge: document.getElementById(`${carId}Connection`),
    statusInfo: document.getElementById(`${carId}StatusInfo`),
    infoPanel: document.getElementById(`${carId}Panel`),
    batteryLevel: document.getElementById(`${carId}BatteryLevel`),
    batteryPercent: document.getElementById(`${carId}BatteryPercent`),
    chargingStatus: document.getElementById(`${carId}ChargingStatus`),
    range: document.getElementById(`${carId}Range`)
  }
}

function setConnectionStatus(elements, status) {
  const { connectionBadge, statusInfo, infoPanel } = elements
  const connectionText = connectionBadge.querySelector('.connection-text')

  connectionBadge.classList.remove('disconnected', 'error')

  if (status === 'disabled') {
    connectionBadge.classList.add('disconnected')
    connectionText.textContent = 'Disabled'
    statusInfo.style.display = 'none'
    infoPanel.classList.add('offline')
  } else if (status === 'offline') {
    connectionBadge.classList.add('disconnected')
    connectionText.textContent = 'Offline'
    statusInfo.style.display = 'none'
    infoPanel.classList.add('offline')
  } else { // online
    connectionText.textContent = 'Online'
    statusInfo.style.display = 'block'
    infoPanel.classList.remove('offline')
  }
}

function updateBatteryDisplay(elements, batteryLevel) {
  const { batteryLevel: batteryLevelElem, batteryPercent } = elements

  batteryLevelElem.style.width = `${batteryLevel}%`
  batteryLevelElem.classList.remove('low', 'medium', 'high')

  if (batteryLevel <= 33) {
    batteryLevelElem.classList.add('low')
  } else if (batteryLevel <= 66) {
    batteryLevelElem.classList.add('medium')
  } else {
    batteryLevelElem.classList.add('high')
  }

  batteryPercent.textContent = `${batteryLevel}%`
}

function updateChargingDisplay(elements, isCharging) {
  const { chargingStatus } = elements
  const chargingText = chargingStatus.querySelector('.status-text')
  chargingText.textContent = isCharging ? 'Charging' : 'Not charging'
}

function spinit(element) {
  element.classList.remove('spin')
  void element.offsetWidth
  element.classList.add('spin')
}

function drive(element) {
  element.classList.remove('drive')
  void element.offsetWidth
  element.classList.add('drive')
}

let isAnimatingChart = false

function driveToChart(element) {
  if (isAnimatingChart) return

  const canvas = document.getElementById('electricityChart')
  if (!canvas || typeof priceData === 'undefined' || !priceData.length) {
    drive(element)
    return
  }

  isAnimatingChart = true

  // Reset flags for new animation
  window._clearedYHistoryOnReverse = false
  window._loggedOnChart = false
  window._lastSmoothY = undefined
  window._lastRotation = undefined

  const chartRect = canvas.getBoundingClientRect()
  const carRect = element.getBoundingClientRect()

  const paddingLeft = 70
  const paddingRight = 20
  const paddingTop = 50
  const paddingBottom = 70

  // Use full canvas width, car can go beyond visible area
  const chartAreaLeft = chartRect.left
  const chartAreaRight = chartRect.right

  const duration = 12000
  const startTime = Date.now()

  // Get the data to display (same logic as in electricity.js)
  const now = new Date()
  let dataToShow = priceData.filter(price => {
    const priceDate = new Date(price.date)
    return priceDate >= now && priceDate < new Date(now.getTime() + 24 * 60 * 60 * 1000)
  }).slice(0, 96)

  const minPrice = 0
  const maxPrice = ELECTRICITY_CONFIG?.priceScale?.max || 30

  // Pre-calculate smoothed price values - use last 5 prices for smoother transitions
  const smoothedPrices = []
  for (let i = 0; i < dataToShow.length; i++) {
    const startIdx = Math.max(0, i - 4)  // Look back 4 positions (5 total including current)
    let sum = 0
    let count = 0
    for (let j = startIdx; j <= i; j++) {
      const value = dataToShow[j]?.value
      if (value !== undefined) {
        sum += value
        count++
      }
    }
    // If no valid values found, use current value or default to 15
    const smoothed = count > 0 ? sum / count : (dataToShow[i]?.value ?? 15)
    smoothedPrices.push(smoothed)
  }

  const yHistory = []
  const rotationHistory = []

  // Calculate first bar position for initial drive
  const firstPriceValue = dataToShow[0]?.value || 15
  const chartHeightPx = canvas.height - paddingTop - paddingBottom
  let firstBarTopCanvas

  // Treat very small negative values as zero to avoid jumps at negative/zero boundary
  const effectiveFirstPrice = (firstPriceValue < 0 && firstPriceValue > -0.005) ? 0 : firstPriceValue

  if (effectiveFirstPrice < 0) {
    // Negative prices: car sits at baseline (where bars start extending downward)
    firstBarTopCanvas = paddingTop + chartHeightPx
  } else if (effectiveFirstPrice > maxPrice) {
    // Overflow: bar at top
    firstBarTopCanvas = paddingTop
  } else {
    // Normal range: 0-maxPrice
    const normalizedHeight = effectiveFirstPrice / maxPrice
    firstBarTopCanvas = paddingTop + chartHeightPx * (1 - normalizedHeight)
  }

  const firstBarScreenY = chartRect.top + (firstBarTopCanvas / canvas.height) * chartRect.height - element.offsetHeight + 8

  // Track last position when leaving chart
  let lastChartX = 0
  let lastChartY = 0

  function animate() {
    const elapsed = Date.now() - startTime
    let progress = Math.min(elapsed / duration, 1)

    // Phase 1 (0-15%): Drive to start of chart
    // Phase 2 (15-85%): Drive across chart
    // Phase 3 (85-100%): Return home
    let xProgress, phase, direction = 1
    if (progress < 0.15) {
      phase = 'toStart'
      xProgress = 0
      direction = 1
    } else if (progress < 0.85) {
      phase = 'onChart'
      const chartProgress = (progress - 0.15) / 0.7
      if (chartProgress < 0.5) {
        xProgress = chartProgress * 2
        direction = 1
      } else {
        xProgress = 2 - chartProgress * 2
        direction = -1

        // Clear yHistory and rotationHistory when direction changes to prevent jumps from old forward-journey values
        if (!window._clearedYHistoryOnReverse) {
          yHistory.length = 0
          rotationHistory.length = 0
          window._clearedYHistoryOnReverse = true
        }
      }
    } else {
      phase = 'returning'
      xProgress = 0
      direction = 1
    }

    let translateX, translateY, rotation = 0

    if (phase === 'toStart') {
      // Drive from original position to start of chart
      const phaseProgress = progress / 0.15
      const targetX = chartAreaLeft
      translateX = (targetX - carRect.left) * phaseProgress
      translateY = (firstBarScreenY - carRect.top) * phaseProgress

      // Calculate rotation based on the slope to first bar
      const deltaY = firstBarScreenY - carRect.top
      const deltaX = chartAreaLeft - carRect.left
      const targetRotation = Math.atan2(deltaY, deltaX * 0.5) * (180 / Math.PI)
      const clampedRotation = Math.max(-80, Math.min(80, targetRotation))

      // Gradually increase rotation from 0 to target as we progress
      const currentRotation = clampedRotation * phaseProgress

      // Smooth rotation on the way to first bar
      rotationHistory.push(currentRotation)
      if (rotationHistory.length > 12) rotationHistory.shift()
      let rotSum = 0
      for (let i = 0; i < rotationHistory.length; i++) {
        rotSum += rotationHistory[i]
      }
      rotation = rotSum / rotationHistory.length
    } else if (phase === 'onChart') {
      // On chart - follow the data
      const chartWidth = chartAreaRight - chartAreaLeft - element.offsetWidth
      const currentX = chartAreaLeft + chartWidth * xProgress

      // Use pre-calculated smoothed price
      const dataIndex = Math.floor(xProgress * (smoothedPrices.length - 1))
      const priceValue = smoothedPrices[dataIndex] || 15

      // Mark that we've entered chart phase
      if (!window._loggedOnChart) {
        window._loggedOnChart = true
      }

      // Calculate Y position based on price (matching electricity chart logic)
      let barTopCanvas
      // Treat very small negative values as zero to avoid jumps at negative/zero boundary
      const effectivePrice = (priceValue < 0 && priceValue > -0.005) ? 0 : priceValue

      if (effectivePrice < 0) {
        // Negative prices: car sits at baseline (where bars start extending downward)
        barTopCanvas = paddingTop + chartHeightPx
      } else if (effectivePrice > maxPrice) {
        // Overflow: bar at top
        barTopCanvas = paddingTop
      } else {
        // Normal range: 0-maxPrice
        const normalizedHeight = effectivePrice / maxPrice
        barTopCanvas = paddingTop + chartHeightPx * (1 - normalizedHeight)
      }

      // Smooth the Y position with moderate window
      yHistory.push(barTopCanvas)
      if (yHistory.length > 30) yHistory.shift()

      // Simple average using stored sum for performance
      let ySum = 0
      for (let i = 0; i < yHistory.length; i++) {
        ySum += yHistory[i]
      }
      const smoothY = ySum / yHistory.length

      // Track smoothY for debugging
      window._lastSmoothY = smoothY

      // Calculate rotation based on Y change
      if (yHistory.length >= 5) {
        const lookback = Math.min(5, yHistory.length - 1)
        const yChange = yHistory[yHistory.length - 1] - yHistory[yHistory.length - 1 - lookback]
        rotation = Math.atan2(yChange * direction, 15) * (180 / Math.PI)
        rotation = Math.max(-150, Math.min(150, rotation))
      }

      // Smooth rotation with moderate window
      rotationHistory.push(rotation)
      if (rotationHistory.length > 25) rotationHistory.shift()
      let rotSum = 0
      for (let i = 0; i < rotationHistory.length; i++) {
        rotSum += rotationHistory[i]
      }
      rotation = rotSum / rotationHistory.length

      // Track rotation for debugging
      window._lastRotation = rotation

      // Convert canvas Y to screen Y
      // Add small offset to compensate for car image positioning
      const targetScreenY = chartRect.top + (smoothY / canvas.height) * chartRect.height - element.offsetHeight + 8

      translateX = currentX - carRect.left
      translateY = targetScreenY - carRect.top

      // Save position at end of chart phase for return
      if (progress >= 0.84) {
        lastChartX = translateX
        lastChartY = translateY
      }
    } else {
      // Returning home - interpolate back from last chart position
      const returnProgress = (progress - 0.85) / 0.15
      translateX = lastChartX * (1 - returnProgress)
      translateY = lastChartY * (1 - returnProgress)

      // Gradually reduce rotation to 0 as we return home
      const deltaY = firstBarScreenY - carRect.top
      const deltaX = chartAreaLeft - carRect.left
      const initialRotation = Math.atan2(deltaY, deltaX * 0.5) * (180 / Math.PI)
      const clampedInitialRotation = Math.max(-80, Math.min(80, initialRotation))

      // Keep same rotation direction but fade to 0
      const targetRotation = clampedInitialRotation * (1 - returnProgress)

      // Smoothly return rotation to 0
      rotationHistory.push(targetRotation)
      if (rotationHistory.length > 12) rotationHistory.shift()
      let rotSum = 0
      for (let i = 0; i < rotationHistory.length; i++) {
        rotSum += rotationHistory[i]
      }
      rotation = rotSum / rotationHistory.length
    }

    element.style.transform = `translate(${translateX}px, ${translateY}px) rotate(${rotation}deg)`

    if (progress < 1) {
      requestAnimationFrame(animate)
    } else {
      element.style.transform = ''
      isAnimatingChart = false
      window._loggedOnChart = false
    }
  }

  animate()
}

// BMW car control functions
let vinFetchFailed = false // Track if VIN fetch has failed to prevent repeated attempts

async function initializeVIN() {
  let vin = localStorage.getItem('bmw_vin')

  // Don't retry if we already know it failed
  if (!vin && vinFetchFailed) {
    return null
  }

  if (!vin) {
    console.log('VIN not found in localStorage. Fetching VIN from API...')
    try {
      const response = await fetch('/bmw/list')

      // Handle HTTP errors (500, 404, etc.)
      if (!response.ok) {
        vinFetchFailed = true
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }))
        addDebugLog(`GET /bmw/list: ${response.status} - FAILED`)
        throw new Error(`HTTP ${response.status}: ${errorData.detail || 'Server error'}`)
      }

      const data = await response.json()
      addDebugLog(`GET /bmw/list: ${response.status} - ${JSON.stringify(data).substring(0, 100)}`)

      // Check if the API call was successful
      if (data && data.status === 'success' && data.output) {
        const match = data.output.match(/\((\w+)\)/)
        if (match) {
          vin = match[1]
          localStorage.setItem('bmw_vin', vin)
          vinFetchFailed = false // Reset flag on success
          console.log('VIN stored in localStorage:', vin)
        } else {
          vinFetchFailed = true
          throw new Error('VIN not found in response output.')
        }
      } else {
        vinFetchFailed = true
        throw new Error('BMW list API returned failed status')
      }
    } catch (error) {
      vinFetchFailed = true
      console.error('Error fetching VIN:', error)
      addDebugLog(`GET /bmw/list: FAILED - ${error.message}`)
    }
  }
  return vin
}

async function updateBMWStatus() {
  const elements = getCarElements('bmw')

  // Check if BMW is disabled
  if (localStorage.getItem('disableBMW') === 'true') {
    setConnectionStatus(elements, 'disabled')
    return
  }

  // Check if test mode is enabled
  const testMode = localStorage.getItem('testMode') === 'true'

  let batteryLevel, range, isLocked, isCharging, hasConnection

  if (testMode) {
    // Simulate random connection status (90% success, 10% failure)
    hasConnection = Math.random() > 0.1

    if (hasConnection) {
      // Generate random test data
      batteryLevel = Math.floor(Math.random() * 100)
      range = Math.floor(Math.random() * 400) + 50 // 50-450 km
      isLocked = Math.random() > 0.5
      isCharging = batteryLevel < 80 && Math.random() > 0.6
    }
  } else {
    const vin = await initializeVIN()
    if (!vin) {
      hasConnection = false
    } else {
      try {
        const response = await fetch(`/bmw/status/${vin}`, { method: 'POST' })
        const data = await response.json()
        addDebugLog(`POST /bmw/status: ${response.status} - ${JSON.stringify(data).substring(0, 100)}`)

        if (data.status === 'success' && data.output) {
          hasConnection = true
          const output = data.output

          // Parse battery level (look for patterns like "battery: 85%" or "charge_level_hv: 85")
          const batteryMatch = output.match(/(?:battery|charge_level_hv|remaining_fuel).*?(\d+)/i)
          batteryLevel = batteryMatch ? parseInt(batteryMatch[1]) : 0

          // Parse range (look for patterns like "range: 350 km" or "remaining_range_electric: 350")
          const rangeMatch = output.match(/(?:range|remaining_range).*?(\d+)/i)
          range = rangeMatch ? parseInt(rangeMatch[1]) : 0

          // Parse lock status (look for "SECURED" or "UNLOCKED")
          isLocked = /SECURED|LOCKED/i.test(output)

          // Parse charging status (look for "CHARGING" or "charging_status")
          isCharging = /CHARGING|charging_status.*?CHARGING/i.test(output)
        } else {
          hasConnection = false
        }
      } catch (error) {
        console.error('Error fetching BMW status:', error)
        addDebugLog(`POST /bmw/status: ERROR - ${error.message}`)
        hasConnection = false
      }
    }
  }

  if (!hasConnection) {
    setConnectionStatus(elements, 'offline')
    return
  }

  setConnectionStatus(elements, 'online')

  // Update battery level
  updateBatteryDisplay(elements, batteryLevel)

  // Update charging status
  const chargingStatus = document.getElementById('bmwChargingStatus')
  const chargingText = chargingStatus.querySelector('.status-text')
  if (isCharging) {
    chargingText.textContent = '⚡ Charging'
  } else {
    chargingText.textContent = 'Not charging'
  }

  // Update range
  elements.range.textContent = `${range} km`

  // Update lock status icon
  const lockButton = document.getElementById('bmwLockStatus')
  lockButton.classList.remove('locked', 'unlocked')
  if (isLocked) {
    lockButton.classList.add('locked')
    lockButton.textContent = '🔒'
  } else {
    lockButton.classList.add('unlocked')
    lockButton.textContent = '🔓'
  }
}

function controlBMW(command, button) {
  const disabled = localStorage.getItem('disableBMW') === 'true'

  if (disabled) {
    return
  }

  const testMode = localStorage.getItem('testMode') === 'true'

  if (testMode) {
    addDebugLog(`[BMW] ${command} - TEST MODE`)
    button.classList.add('spin')
    setTimeout(() => button.classList.remove('spin'), 1000)
    return
  }

  initializeVIN().then(vin => {
    if (!vin) {
      console.error('VIN is missing. Unable to proceed with command.')
      addDebugLog(`POST /bmw/${command}: No VIN`)
      return
    }

    button.classList.add('spin')

    fetch(`/bmw/${command}/${vin}`, { method: 'POST' })
      .then(response => {
        return response.json().then(data => ({ status: response.status, data }))
      })
      .then(({ status, data }) => {
        button.classList.remove('spin')
        addDebugLog(`POST /bmw/${command}: ${status} - ${JSON.stringify(data).substring(0, 100)}`)
        if (data.status === 'success') {
          setButtonState(button, 'success')
          // Refresh status after lock/unlock commands
          if (command === 'lock' || command === 'unlock') {
            setTimeout(updateBMWStatus, 2000)
          }
        } else {
          setButtonState(button, 'error')
        }
      })
      .catch(error => {
        button.classList.remove('spin')
        setButtonState(button, 'error')
        addDebugLog(`POST /bmw/${command}: ERROR - ${error.message}`)
      })
  })
}

// Mitsubishi Outlander control functions
async function updateMitsubishiStatus() {
  const elements = getCarElements('mitsubishi')

  // Check if Mitsubishi is disabled
  if (localStorage.getItem('disableMitsubishi') === 'true') {
    setConnectionStatus(elements, 'disabled')
    return
  }

  const testMode = localStorage.getItem('testMode') === 'true'

  let batteryLevel, range, isCharging, hasConnection

  if (testMode) {
    hasConnection = Math.random() > 0.1
    if (hasConnection) {
      batteryLevel = Math.floor(Math.random() * 100)
      range = Math.floor(Math.random() * 50) + 10 // 10-60 km
      isCharging = batteryLevel < 80 && Math.random() > 0.6
    }
  } else {
    try {
      const response = await fetch('/mitsubishi/status')

      if (!response.ok) {
        hasConnection = false
        addDebugLog(`GET /mitsubishi/status: ${response.status} - FAILED`)
        throw new Error(`HTTP ${response.status}: Server error`)
      }

      const data = await response.json()
      addDebugLog(`GET /mitsubishi/status: ${response.status} - OK`)

      hasConnection = true

      // Parse battery level from "battery" field
      const batteryMatch = data.battery?.match(/(\d+)/)
      batteryLevel = batteryMatch ? parseInt(batteryMatch[1]) : 0

      // Parse charging status
      isCharging = /charging|yes/i.test(data.chargestatus || '')

      // Estimate range (Outlander PHEV has ~50km electric range)
      range = Math.round((batteryLevel / 100) * 50)

    } catch (error) {
      console.error('Error fetching Mitsubishi status:', error)
      addDebugLog(`GET /mitsubishi/status: ERROR - ${error.message}`)
      hasConnection = false
    }
  }

  if (!hasConnection) {
    setConnectionStatus(elements, 'offline')
    return
  }

  setConnectionStatus(elements, 'online')

  // Update battery level
  updateBatteryDisplay(elements, batteryLevel)

  // Update charging status
  const chargingStatus = document.getElementById('mitsubishiChargingStatus')
  const chargingText = chargingStatus.querySelector('.status-text')
  if (isCharging) {
    chargingText.textContent = '⚡ Charging'
  } else {
    chargingText.textContent = 'Not charging'
  }

  // Update range
  elements.range.textContent = `${range} km`
}

function controlOutlander(command, button) {
  const disabled = localStorage.getItem('disableMitsubishi') === 'true'

  if (disabled) {
    return
  }

  const testMode = localStorage.getItem('testMode') === 'true'

  if (testMode) {
    addDebugLog(`[Mitsubishi] ${command} - TEST MODE`)
    button.classList.add('spin')
    setTimeout(() => button.classList.remove('spin'), 1000)
    return
  }

  button.classList.add('spin')

  fetch(`/outlander/${command}`, { method: 'POST' })
    .then(response => {
      return response.json().then(data => ({ status: response.status, data }))
    })
    .then(({ status, data }) => {
      button.classList.remove('spin')
      addDebugLog(`POST /outlander/${command}: ${status} - ${JSON.stringify(data).substring(0, 100)}`)
      if (data.status === 'success') {
        setButtonState(button, 'success')
      } else {
        setButtonState(button, 'error')
      }
    })
    .catch(error => {
      button.classList.remove('spin')
      setButtonState(button, 'error')
      addDebugLog(`POST /outlander/${command}: ERROR - ${error.message}`)
    })
}

function setButtonState(button, state) {
  button.classList.add(state)
  setTimeout(() => {
    button.classList.remove(state)
  }, 10000)
}

// Initialize BMW and Mitsubishi status on load and update every 5 minutes (default, configurable in settings)
function initializeCarStatus() {
  updateBMWStatus()
  updateMitsubishiStatus()
  const carStatusInterval = (parseInt(localStorage.getItem('carStatusInterval')) || 5) * 60 * 1000
  setInterval(() => {
    updateBMWStatus()
    updateMitsubishiStatus()
  }, carStatusInterval)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeCarStatus)
} else {
  initializeCarStatus()
}
