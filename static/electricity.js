// Electricity price visualization for Raspberry Pi display
// Uses Sähkötin API for 15-minute electricity spot prices

const ELECTRICITY_CONFIG = {
  apiUrl: 'https://sahkotin.fi/prices',
  updateInterval: 5 * 60 * 1000, // 5 minutes
  hoursToShow: 24, // Show 24 hours
  priceScale: {
    min: 0,
    max: 30
  },
  colors: {
    veryLow: '#22c55e',
    low: '#84cc16',
    medium: '#f59e0b',
    high: '#ef4444',
    overflow: '#9333ea',
    negative: '#06b6d4',
    current: '#3b82f6',
    background: '#f3f4f6',
    text: '#1f2937',
    grid: '#d1d5db',
    optimalCharging: 'rgba(147, 197, 253, 0.3)' // Light blue
  },
  testMode: false,
  chargingHours: 6, // Default hours needed per day (BMW 330e/Outlander PHEV Schuko charging)
  veryLowPriceThreshold: 2, // c/kWh - if all prices under this, show all as optimal
  minWindowHours: 2 // Minimum consecutive hours for a charging window
}

let electricityChart = null
let priceData = []
let currentPriceIndex = -1
let optimalChargingIndices = []

function findOptimalChargingHours(data, hoursNeeded) {
  if (!data || data.length === 0) return []

  const quartersNeeded = hoursNeeded * 4 // 15-minute intervals
  const minWindowQuarters = ELECTRICITY_CONFIG.minWindowHours * 4
  const optimalIndices = []

  // Group data by day
  const dayGroups = {}
  data.forEach((price, index) => {
    const date = new Date(price.date)
    const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`

    if (!dayGroups[dayKey]) {
      dayGroups[dayKey] = []
    }
    dayGroups[dayKey].push({ ...price, originalIndex: index })
  })

  // For each day, find consecutive blocks of cheap hours
  Object.values(dayGroups).forEach(dayData => {
    if (dayData.length === 0) return

    // Sort by price to find threshold
    const sorted = [...dayData].sort((a, b) => a.value - b.value)
    const nthCheapestIndex = Math.min(quartersNeeded - 1, sorted.length - 1)
    const thresholdPrice = sorted[nthCheapestIndex].value

    // Find consecutive blocks where price is reasonable
    const blocks = []
    let currentBlock = []

    dayData.forEach((quarter, index) => {
      if (quarter.value <= thresholdPrice + 3) { // +3c tolerance
        currentBlock.push(quarter)
      } else {
        if (currentBlock.length >= minWindowQuarters) {
          blocks.push([...currentBlock])
        }
        currentBlock = []
      }
    })

    // Don't forget the last block
    if (currentBlock.length >= minWindowQuarters) {
      blocks.push(currentBlock)
    }

    // Add all blocks to optimal indices
    blocks.forEach(block => {
      block.forEach(quarter => {
        optimalIndices.push(quarter.originalIndex)
      })
    })
  })

  return optimalIndices
}

async function fetchElectricityPrices() {
  // Check if test mode is enabled
  if (ELECTRICITY_CONFIG.testMode) {
    const now = new Date()
    const testData = []

    // Generate trend-based random data with normal distribution 0-20c
    let currentValue = Math.random() * 20 // Start with value between 0-20

    for (let i = 0; i < 96; i++) {
      const date = new Date(now.getTime() + i * 15 * 60 * 1000)

      // Add random variation (-3 to +3)
      const variation = (Math.random() - 0.5) * 6
      currentValue = currentValue + variation

      // Bias towards 0-20 range (pull back if too far out)
      if (currentValue > 25) {
        currentValue -= 4
      } else if (currentValue < 5) {
        currentValue += 2
      }

      // Clamp to range -1 to +60
      currentValue = Math.max(-1, Math.min(60, currentValue))

      testData.push({ date: date.toISOString(), value: currentValue })
    }

    priceData = testData
    updateCurrentPriceIndex()
    optimalChargingIndices = findOptimalChargingHours(priceData, ELECTRICITY_CONFIG.chargingHours)
    renderElectricityChart()
    return
  }

  try {
    const now = new Date()
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)

    const end = new Date(start)
    end.setDate(end.getDate() + 2) // Get today + tomorrow

    const url = `${ELECTRICITY_CONFIG.apiUrl}?quarter&vat&fix&start=${start.toISOString()}&end=${end.toISOString()}`

    const response = await fetch(url)
    const data = await response.json()

    if (typeof addDebugLog === 'function') {
      addDebugLog(`GET /electricity: ${response.status} - ${data.prices ? data.prices.length + ' prices' : 'no data'}`)
    }

    if (data && data.prices) {
      priceData = data.prices
      updateCurrentPriceIndex()
      optimalChargingIndices = findOptimalChargingHours(priceData, ELECTRICITY_CONFIG.chargingHours)
      renderElectricityChart()
    }
  } catch (error) {
    console.error('Error fetching electricity prices:', error)
    showError('Unable to load electricity prices')
    if (typeof addDebugLog === 'function') {
      addDebugLog(`GET /electricity: ERROR - ${error.message}`)
    }
  }
}

function updateCurrentPriceIndex() {
  const now = new Date()
  currentPriceIndex = priceData.findIndex(price => {
    const priceDate = new Date(price.date)
    const diff = now - priceDate
    return diff >= 0 && diff < 15 * 60 * 1000 // Within 15 minutes
  })
}

function getColorForPrice(price, min, max) {
  if (price < 0) return ELECTRICITY_CONFIG.colors.negative
  if (price > max) return ELECTRICITY_CONFIG.colors.overflow

  const range = max - min
  const normalized = (price - min) / range

  if (normalized < 0.33) return ELECTRICITY_CONFIG.colors.low
  if (normalized < 0.66) return ELECTRICITY_CONFIG.colors.medium
  return ELECTRICITY_CONFIG.colors.high
}

function renderElectricityChart() {
  const canvas = document.getElementById('electricityChart')
  if (!canvas) return

  const container = document.getElementById('electricity-container')
  canvas.width = container.clientWidth
  canvas.height = container.clientHeight

  const ctx = canvas.getContext('2d', { willReadFrequently: true })

  // Clear canvas
  ctx.fillStyle = ELECTRICITY_CONFIG.colors.background
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  if (priceData.length === 0) {
    ctx.fillStyle = ELECTRICITY_CONFIG.colors.text
    ctx.font = '20px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('Loading electricity prices...', canvas.width / 2, canvas.height / 2)
    return
  }

  // Get data for the next 24 hours from now
  const now = new Date()
  let dataToShow = priceData.filter(price => {
    const priceDate = new Date(price.date)
    return priceDate >= now && priceDate < new Date(now.getTime() + ELECTRICITY_CONFIG.hoursToShow * 60 * 60 * 1000)
  }).slice(0, 96) // Max 96 quarters (24 hours)

  if (dataToShow.length === 0) return

  // Use fixed price scale for consistent visual reference
  const minPrice = ELECTRICITY_CONFIG.priceScale.min
  const maxPrice = ELECTRICITY_CONFIG.priceScale.max

  const padding = { top: 50, right: 20, bottom: 70, left: 70 }
  const chartWidth = canvas.width - padding.left - padding.right
  const chartHeight = canvas.height - padding.top - padding.bottom

  // Draw current price with box
  const currentPrice = priceData[currentPriceIndex]
  if (currentPrice) {
    const priceText = `${currentPrice.value.toFixed(2)} c/kWh`
    ctx.font = 'bold 24px Arial'
    ctx.textAlign = 'center'

    const textWidth = ctx.measureText(priceText).width
    const boxPadding = 12
    const boxWidth = textWidth + boxPadding * 2
    const boxHeight = 40
    const boxX = canvas.width / 2 - boxWidth / 2
    const boxY = 10

    // Get color based on current price
    let boxColor = ELECTRICITY_CONFIG.colors.background
    const price = currentPrice.value
    if (price < 0) {
      boxColor = ELECTRICITY_CONFIG.colors.negative
    } else if (price > maxPrice) {
      boxColor = ELECTRICITY_CONFIG.colors.overflow
    } else if (price <= 6) {
      boxColor = ELECTRICITY_CONFIG.colors.veryLow
    } else if (price <= 10) {
      boxColor = ELECTRICITY_CONFIG.colors.low
    } else if (price <= 20) {
      boxColor = ELECTRICITY_CONFIG.colors.medium
    } else {
      boxColor = ELECTRICITY_CONFIG.colors.high
    }

    // Draw box with price color
    ctx.fillStyle = boxColor
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight)

    // Draw text
    ctx.fillStyle = ELECTRICITY_CONFIG.colors.text
    ctx.fillText(priceText, canvas.width / 2, boxY + 30)
  }

  // Draw grid lines (horizontal) at 5c intervals
  ctx.strokeStyle = ELECTRICITY_CONFIG.colors.grid
  ctx.lineWidth = 1
  const priceInterval = 5 // 5 cents per line

  for (let price = 0; price <= maxPrice; price += priceInterval) {
    const y = padding.top + chartHeight - ((price - minPrice) / (maxPrice - minPrice)) * chartHeight

    ctx.beginPath()
    ctx.moveTo(padding.left, y)
    ctx.lineTo(padding.left + chartWidth, y)
    ctx.stroke()

    // Y-axis labels
    ctx.fillStyle = ELECTRICITY_CONFIG.colors.text
    ctx.font = '16px Arial'
    ctx.textAlign = 'right'
    ctx.fillText(`${price}`, padding.left - 10, y + 6)
  }

  // Draw optimal charging background highlights
  const barWidth = chartWidth / dataToShow.length

  // Check if all visible prices are under threshold - if so, highlight everything
  const allUnderThreshold = dataToShow.every(p => p.value < ELECTRICITY_CONFIG.veryLowPriceThreshold)

  dataToShow.forEach((price, index) => {
    const shouldHighlight = allUnderThreshold || optimalChargingIndices.includes(priceData.indexOf(price))

    if (shouldHighlight) {
      const x = padding.left + index * barWidth
      ctx.fillStyle = ELECTRICITY_CONFIG.colors.optimalCharging
      ctx.fillRect(x, padding.top, barWidth - 1, chartHeight)
    }
  })

  // Draw bars
  dataToShow.forEach((price, index) => {
    const actualValue = price.value
    const x = padding.left + index * barWidth

    let barHeight, y

    if (actualValue < 0) {
      // Negative prices: cyan bar extending downward
      barHeight = Math.abs(actualValue / maxPrice) * chartHeight
      y = padding.top + chartHeight
      ctx.fillStyle = ELECTRICITY_CONFIG.colors.negative
      ctx.fillRect(x, y, barWidth - 1, Math.min(barHeight, 30))
      return
    } else if (actualValue > maxPrice) {
      // Overflow: purple bar at full height
      barHeight = chartHeight
      y = padding.top
      ctx.fillStyle = ELECTRICITY_CONFIG.colors.overflow
    } else {
      // Normal range: 0-30c
      barHeight = (actualValue / maxPrice) * chartHeight
      y = padding.top + chartHeight - barHeight

      if (actualValue <= 6) {
        ctx.fillStyle = ELECTRICITY_CONFIG.colors.veryLow
      } else if (actualValue <= 10) {
        ctx.fillStyle = ELECTRICITY_CONFIG.colors.low
      } else if (actualValue <= 20) {
        ctx.fillStyle = ELECTRICITY_CONFIG.colors.medium
      } else {
        ctx.fillStyle = ELECTRICITY_CONFIG.colors.high
      }
    }

    ctx.fillRect(x, y, barWidth - 1, barHeight)

    // Draw label for overflow values (above max)
    if (actualValue > maxPrice) {
      ctx.fillStyle = ELECTRICITY_CONFIG.colors.text
      ctx.font = 'bold 12px Arial'
      ctx.textAlign = 'center'
      ctx.fillText(actualValue.toFixed(1), x + barWidth / 2, y - 5)
    }
  })

  // First pass: check all data for day changes and draw vertical lines + date labels
  let lastDateDay = null
  for (let i = 0; i < dataToShow.length; i++) {
    const date = new Date(dataToShow[i].date)
    const currentDay = date.getDate() // Get day of month

    if (lastDateDay !== null && currentDay !== lastDateDay) {
      // Day changed - draw dashed line at day boundary
      const x = padding.left + i * barWidth

      ctx.strokeStyle = ELECTRICITY_CONFIG.colors.text
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5])
      ctx.beginPath()
      ctx.moveTo(x, padding.top)
      ctx.lineTo(x, padding.top + chartHeight)
      ctx.stroke()
      ctx.setLineDash([])

      // Draw date label at the day boundary
      ctx.fillStyle = ELECTRICITY_CONFIG.colors.text
      ctx.font = '14px Arial'
      ctx.textAlign = 'center'
      const dateStr = date.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })
      ctx.fillText(dateStr, x, padding.top + chartHeight + 40)
    }
    lastDateDay = currentDay
  }

  // Draw first date label if no day change occurred
  if (dataToShow.length > 0) {
    const firstDate = new Date(dataToShow[0].date)
    const firstDateStr = firstDate.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })
    ctx.fillStyle = ELECTRICITY_CONFIG.colors.text
    ctx.font = '14px Arial'
    ctx.textAlign = 'center'
    ctx.fillText(firstDateStr, padding.left, padding.top + chartHeight + 40)
  }

  // Second pass: draw hour labels (every 2 hours)
  ctx.fillStyle = ELECTRICITY_CONFIG.colors.text
  ctx.font = '16px Arial'
  ctx.textAlign = 'center'

  for (let i = 0; i < dataToShow.length; i += 8) {
    const date = new Date(dataToShow[i].date)
    const hour = date.getHours()
    const x = padding.left + (i + 4) * barWidth

    ctx.fillText(`${hour}`, x, padding.top + chartHeight + 20)
  }

}

function showError(message) {
  const canvas = document.getElementById('electricityChart')
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  ctx.fillStyle = ELECTRICITY_CONFIG.colors.background
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = '#ef4444'
  ctx.font = '18px Arial'
  ctx.textAlign = 'center'
  ctx.fillText(message, canvas.width / 2, canvas.height / 2)
}

// Initialize and set up periodic updates
function initElectricity() {
  fetchElectricityPrices()

  // Update prices every 5 minutes
  setInterval(fetchElectricityPrices, ELECTRICITY_CONFIG.updateInterval)

  // Redraw chart on window resize
  window.addEventListener('resize', () => {
    if (priceData.length > 0) {
      renderElectricityChart()
    }
  })
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initElectricity)
} else {
  initElectricity()
}
