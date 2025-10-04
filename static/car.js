// Car animations and controls

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

  // Pre-calculate smoothed price values for performance
  const smoothedPrices = []
  for (let i = 0; i < dataToShow.length; i++) {
    const startIdx = Math.max(0, i - 3)
    const endIdx = Math.min(dataToShow.length - 1, i + 3)
    let sum = 0
    let count = 0
    for (let j = startIdx; j <= endIdx; j++) {
      sum += dataToShow[j]?.value || 15
      count++
    }
    smoothedPrices.push(sum / count)
  }

  const yHistory = []
  const rotationHistory = []

  // Calculate first bar position for initial drive
  const firstPriceValue = dataToShow[0]?.value || 15
  const chartHeightPx = canvas.height - paddingTop - paddingBottom
  let firstBarTopCanvas

  if (firstPriceValue < 0) {
    // Negative prices: car sits at baseline (where bars start extending downward)
    firstBarTopCanvas = paddingTop + chartHeightPx
  } else if (firstPriceValue > maxPrice) {
    // Overflow: bar at top
    firstBarTopCanvas = paddingTop
  } else {
    // Normal range: 0-maxPrice
    const normalizedHeight = firstPriceValue / maxPrice
    firstBarTopCanvas = paddingTop + chartHeightPx * (1 - normalizedHeight)
  }

  const firstBarScreenY = chartRect.top + (firstBarTopCanvas / canvas.height) * chartRect.height - element.offsetHeight

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

      // Calculate Y position based on price (matching electricity chart logic)
      let barTopCanvas
      if (priceValue < 0) {
        // Negative prices: car sits at baseline (where bars start extending downward)
        barTopCanvas = paddingTop + chartHeightPx
      } else if (priceValue > maxPrice) {
        // Overflow: bar at top
        barTopCanvas = paddingTop
      } else {
        // Normal range: 0-maxPrice
        const normalizedHeight = priceValue / maxPrice
        barTopCanvas = paddingTop + chartHeightPx * (1 - normalizedHeight)
      }

      // Smooth the Y position (reduced window for better performance)
      yHistory.push(barTopCanvas)
      if (yHistory.length > 15) yHistory.shift()

      // Simple average using stored sum for performance
      let ySum = 0
      for (let i = 0; i < yHistory.length; i++) {
        ySum += yHistory[i]
      }
      const smoothY = ySum / yHistory.length

      // Calculate rotation based on Y change
      if (yHistory.length >= 10) {
        const yChange = yHistory[yHistory.length - 1] - yHistory[yHistory.length - 10]
        rotation = Math.atan2(yChange * direction, 20) * (180 / Math.PI)
        rotation = Math.max(-80, Math.min(80, rotation))
      }

      // Smooth rotation (reduced window for better performance)
      rotationHistory.push(rotation)
      if (rotationHistory.length > 12) rotationHistory.shift()
      let rotSum = 0
      for (let i = 0; i < rotationHistory.length; i++) {
        rotSum += rotationHistory[i]
      }
      rotation = rotSum / rotationHistory.length

      // Convert canvas Y to screen Y
      const targetScreenY = chartRect.top + (smoothY / canvas.height) * chartRect.height - element.offsetHeight

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
    addDebugLog(`POST /bmw/status: TEST MODE`)
  } else {
    const vin = await initializeVIN()
    if (!vin) {
      hasConnection = false
      addDebugLog(`[BMW] Status update skipped: No VIN available`)
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

  // Update connection status
  const connectionStatus = document.getElementById('bmwConnection')
  const statusInfo = document.getElementById('bmwStatusInfo')

  if (!hasConnection) {
    connectionStatus.classList.remove('disconnected')
    connectionStatus.classList.add('error')
    statusInfo.style.display = 'none'
    return
  }

  connectionStatus.classList.remove('disconnected', 'error')
  statusInfo.style.display = 'flex'

  // Update battery bars
  const batteryBars = document.querySelectorAll('#bmwBattery .battery-bar')
  const activeBars = Math.ceil((batteryLevel / 100) * 6)
  batteryBars.forEach((bar, index) => {
    bar.classList.remove('active', 'low', 'medium', 'high')
    if (index < activeBars) {
      bar.classList.add('active')
      if (batteryLevel <= 33) {
        bar.classList.add('low')
      } else if (batteryLevel <= 66) {
        bar.classList.add('medium')
      } else {
        bar.classList.add('high')
      }
    }
  })

  // Update charging icon
  const chargingIcon = document.getElementById('bmwCharging')
  chargingIcon.classList.remove('charging')
  if (isCharging) {
    chargingIcon.textContent = '⚡ Charging'
    chargingIcon.classList.add('charging')
  } else if (batteryLevel >= 90) {
    chargingIcon.textContent = '✓ Charged'
  } else {
    chargingIcon.textContent = '🔌 Not plugged'
  }

  // Update range
  document.getElementById('bmwRange').textContent = `${range} km`

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
  const testMode = localStorage.getItem('testMode') === 'true'

  let batteryLevel, range, isCharging, hasConnection

  if (testMode) {
    hasConnection = Math.random() > 0.1
    if (hasConnection) {
      batteryLevel = Math.floor(Math.random() * 100)
      range = Math.floor(Math.random() * 50) + 10 // 10-60 km
      isCharging = batteryLevel < 80 && Math.random() > 0.6
    }
    addDebugLog(`GET /mitsubishi/status: TEST MODE`)
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

  // Update connection status
  const connectionStatus = document.getElementById('mitsubishiConnection')
  const statusInfo = document.getElementById('mitsubishiStatusInfo')

  if (!hasConnection) {
    connectionStatus.classList.remove('disconnected')
    connectionStatus.classList.add('error')
    statusInfo.style.display = 'none'
    return
  }

  connectionStatus.classList.remove('disconnected', 'error')
  statusInfo.style.display = 'flex'

  // Update battery bars
  const batteryBars = document.querySelectorAll('#mitsubishiBattery .battery-bar')
  const activeBars = Math.ceil((batteryLevel / 100) * 6)
  batteryBars.forEach((bar, index) => {
    bar.classList.remove('active', 'low', 'medium', 'high')
    if (index < activeBars) {
      bar.classList.add('active')
      if (batteryLevel <= 33) {
        bar.classList.add('low')
      } else if (batteryLevel <= 66) {
        bar.classList.add('medium')
      } else {
        bar.classList.add('high')
      }
    }
  })

  // Update charging icon
  const chargingIcon = document.getElementById('mitsubishiCharging')
  chargingIcon.classList.remove('charging')
  if (isCharging) {
    chargingIcon.textContent = '⚡ Charging'
    chargingIcon.classList.add('charging')
  } else if (batteryLevel >= 90) {
    chargingIcon.textContent = '✓ Charged'
  } else {
    chargingIcon.textContent = '🔌 Not plugged'
  }

  // Update range
  document.getElementById('mitsubishiRange').textContent = `${range} km`
}

function controlOutlander(command, button) {
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
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    updateBMWStatus()
    updateMitsubishiStatus()
    setInterval(() => {
      updateBMWStatus()
      updateMitsubishiStatus()
    }, (parseInt(localStorage.getItem('carStatusInterval')) || 5) * 60 * 1000)
  })
} else {
  updateBMWStatus()
  updateMitsubishiStatus()
  setInterval(() => {
    updateBMWStatus()
    updateMitsubishiStatus()
  }, (parseInt(localStorage.getItem('carStatusInterval')) || 5) * 60 * 1000)
}
