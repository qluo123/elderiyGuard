<script setup lang="ts">
import { ref, onMounted, watch, computed, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { MapLocation, Timer, ArrowLeft, ArrowRight, ArrowDown, List, VideoPlay, VideoPause, Close, ZoomIn, ZoomOut, Filter, Calendar, PieChart } from '@element-plus/icons-vue'
import type { DayTrajectory, ProcessedRecord } from '@/types/location'
import { fetchLocationData, processDeviceData, formatTime, wgs84ToGcj02 } from '@/services/dataService'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// 修复Leaflet标记图标路径问题
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
})

const route = useRoute()
const router = useRouter()

const mapContainer = ref<HTMLDivElement | null>(null)
const trajectoryDays = ref<DayTrajectory[]>([])
const selectedDay = ref<string>('')
const loading = ref(false)
const mapReady = ref(false)
const sidebarOpen = ref(false)
const isSidebarCollapsed = ref(false)

// 侧边栏折叠状态
const expandedSections = ref({
  filters: true,
  days: true,
  details: true,
  records: true
})

function toggleSection(section: string) {
  expandedSections.value[section as keyof typeof expandedSections.value] = 
    !expandedSections.value[section as keyof typeof expandedSections.value]
}

// 是否只显示停留点区域
const showOnlyStayArea = ref(false)

// 切换显示停留点区域
function toggleStayAreaView() {
  showOnlyStayArea.value = !showOnlyStayArea.value
  if (showOnlyStayArea.value) {
    fitToStayPoints()
  } else {
    fitToTrajectory()
  }
}

// 适配地图视图到停留点区域
function fitToStayPoints() {
  if (!map || stayPoints.value.length === 0) return
  
  const latLngs: L.LatLngExpression[] = []
  stayPoints.value.forEach(stay => {
    const [gcjLng, gcjLat] = wgs84ToGcj02(stay.lng, stay.lat)
    latLngs.push([gcjLat, gcjLng])
  })
  
  const bounds = L.latLngBounds(latLngs)
  
  // 添加一些边距
  map.fitBounds(bounds, { padding: [50, 50] })
}

// 适配地图视图到完整轨迹
function fitToTrajectory() {
  if (!map || pathPoints.value.length === 0) return
  
  const bounds = L.latLngBounds(pathPoints.value)
  map.fitBounds(bounds, { padding: [50, 50] })
}

// 显示单个停留点的区域
function showStayPointArea(stay: typeof stayPoints.value[0]) {
  if (!map) return
  
  const [gcjLng, gcjLat] = wgs84ToGcj02(stay.lng, stay.lat)
  
  // 创建一个围绕停留点的边界区域（大约200米范围）
  const offset = 0.0018 // 约200米
  const bounds = L.latLngBounds([
    [gcjLat - offset, gcjLng - offset],
    [gcjLat + offset, gcjLng + offset]
  ])
  
  map.fitBounds(bounds, { padding: [30, 30], animate: true })
  
  // 在停留点位置显示一个标记
  if (stayPointMarker) {
    stayPointMarker.remove()
  }
  
  stayPointMarker = L.marker([gcjLat, gcjLng], {
    icon: L.divIcon({
      className: 'stay-point-highlight',
      html: '<div style="width:24px;height:24px;border-radius:50%;background:#f56c6c;border:3px solid white;box-shadow:0 0 10px rgba(245,108,108,0.6);"></div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    })
  }).addTo(map)
}

// 停留点高亮标记
let stayPointMarker: L.Marker | null = null
const dateRange = ref<[Date, Date] | null>(null)
const startTimeFilter = ref<string>('')
const endTimeFilter = ref<string>('')

// 快捷时间筛选选项
const quickTimeFilters = [
  { label: '全部时间', start: '', end: '' },
  { label: '早晨', start: '06:00', end: '12:00' },
  { label: '下午', start: '12:00', end: '18:00' },
  { label: '晚上', start: '18:00', end: '23:59' },
  { label: '夜间', start: '00:00', end: '06:00' }
]
const currentQuickFilter = ref('')

// 速度筛选
const speedRange = ref([0, 20])

// 停留点筛选
const showOnlyStayPoints = ref(false)
const minStayDuration = ref(5)

// 轨迹对比功能
const compareMode = ref(false)
const comparedDays = ref<string[]>([])
const compareColors = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#909399']

// 播放控制相关
const isPlaying = ref(false)
const playSpeed = ref(1)
const currentPlayIndex = ref(0)
const playInterval = ref<number | null>(null)
const currentPositionMarker = ref<L.Marker | null>(null)
const playProgress = ref(0)
const currentPlayTime = ref('')

const filteredTrajectoryDays = computed(() => {
  if (!dateRange.value && !startTimeFilter.value && !endTimeFilter.value) {
    return trajectoryDays.value
  }
  return trajectoryDays.value.filter(day => {
    const dayDate = new Date(day.date)
    if (dateRange.value) {
      const [start, end] = dateRange.value
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
      if (dayDate < start || dayDate > end) return false
    }
    if (startTimeFilter.value || endTimeFilter.value) {
      const dayRecords = day.records.filter(r => {
        if (startTimeFilter.value && r.timeStr < startTimeFilter.value) return false
        if (endTimeFilter.value && r.timeStr > endTimeFilter.value) return false
        return true
      })
      return dayRecords.length > 0
    }
    return true
  })
})

function clearFilters() {
  dateRange.value = null
  startTimeFilter.value = ''
  endTimeFilter.value = ''
}

function applyTimeFilter() {
  if (startTimeFilter.value && endTimeFilter.value && startTimeFilter.value > endTimeFilter.value) {
    ElMessage.warning('开始时间不能大于结束时间')
    return
  }
  currentQuickFilter.value = ''
}

function applyQuickTimeFilter(filter: { label: string; start: string; end: string }) {
  startTimeFilter.value = filter.start
  endTimeFilter.value = filter.end
  currentQuickFilter.value = filter.label
  if (mapReady.value) {
    drawTrajectory()
  }
}

function applySpeedFilter() {
  if (mapReady.value) {
    drawTrajectory()
  }
}

function applyStayFilter() {
  if (mapReady.value) {
    drawTrajectory()
  }
}

// 轨迹对比功能
function toggleCompareMode() {
  if (!compareMode.value) {
    comparedDays.value = []
    if (mapReady.value) {
      drawTrajectory()
    }
  }
}

function drawCompareTrajectories() {
  if (!map || !compareMode.value) return
  clearMap()

  const allPoints: L.LatLngExpression[] = []
  
  comparedDays.value.forEach((day, index) => {
    const trajectory = trajectoryDays.value.find(d => d.date === day)
    if (trajectory) {
      const points: L.LatLngExpression[] = []
      trajectory.records.forEach(record => {
        const [gcjLng, gcjLat] = wgs84ToGcj02(record.lng, record.lat)
        points.push([gcjLat, gcjLng])
        allPoints.push([gcjLat, gcjLng])
      })
      
      const color = compareColors[index % compareColors.length]
      const comparePolyline = L.polyline(points, {
        color: color,
        weight: 4,
        opacity: 0.8,
      }).addTo(map!)
      polylineSegments.push(comparePolyline)
      
      // 添加日期标记
      if (points.length > 0) {
        const startPoint = points[0]
        L.marker(startPoint, {
          icon: L.divIcon({
            className: 'compare-marker',
            html: `<div style="background: ${color}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 12px;">${day}</div>`,
            iconSize: [80, 20]
          })
        }).addTo(map!)
      }
    }
  })
  
  if (allPoints.length > 0) {
    const bounds = L.latLngBounds(allPoints)
    map.fitBounds(bounds, { padding: [60, 60] })
  }
}

function clearCompare() {
  comparedDays.value = []
  if (mapReady.value && compareMode.value) {
    drawCompareTrajectories()
  }
}

// 计算速度并生成颜色
function getSpeedColor(speed: number): string {
  // 根据速度返回不同颜色
  if (speed < 1) return '#67c23a' // 低速 - 绿色
  if (speed < 3) return '#409eff' // 中速 - 蓝色
  if (speed < 6) return '#e6a23c' // 高速 - 橙色
  return '#f56c6c' // 超高速 - 红色
}

// 计算两点之间的速度
function calculateSpeed(lat1: number, lng1: number, time1: number, lat2: number, lng2: number, time2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distance = R * c * 1000 // 米
  const timeDiff = (time2 - time1) / 1000 // 秒
  return timeDiff > 0 ? distance / timeDiff * 3.6 : 0 // 转换为 km/h
}

// 轨迹绘制动画
function animateTrajectory(points: L.LatLngExpression[]) {
  if (!map || points.length === 0) return
  
  let progress = 0
  const duration = 5000 // 总动画时间（毫秒），增加时间使动画更流畅
  const startTime = Date.now()
  
  const animationLine = L.polyline([], {
    color: '#409eff',
    weight: 6,
    opacity: 1,
  }).addTo(map!)
  
  const animate = () => {
    const elapsed = Date.now() - startTime
    progress = Math.min(elapsed / duration, 1)
    
    // 使用更平滑的缓动函数
    const easedProgress = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2
    
    const currentIndex = Math.floor(easedProgress * (points.length - 1))
    const nextIndex = Math.min(currentIndex + 1, points.length - 1)
    
    // 计算当前点的位置（在两个点之间插值）
    const t = (easedProgress * (points.length - 1)) - currentIndex
    const currentPoint = points[currentIndex]
    const nextPoint = points[nextIndex]
    
    let intermediatePoint: L.LatLngExpression
    if (Array.isArray(currentPoint) && Array.isArray(nextPoint) && currentPoint.length === 2 && nextPoint.length === 2) {
      intermediatePoint = [
        currentPoint[0] + (nextPoint[0] - currentPoint[0]) * t,
        currentPoint[1] + (nextPoint[1] - currentPoint[1]) * t
      ] as L.LatLngTuple
    } else {
      intermediatePoint = currentPoint as L.LatLngExpression
    }
    
    // 更新轨迹线
    const linePoints = points.slice(0, currentIndex + 1) as L.LatLngExpression[]
    linePoints.push(intermediatePoint)
    animationLine.setLatLngs(linePoints)
    
    if (progress < 1) {
      requestAnimationFrame(animate)
    } else {
      // 动画结束，显示完整轨迹
      animationLine.setLatLngs(points)
    }
  }
  
  animate()
}

let map: L.Map | null = null
let polyline: L.Polyline | null = null
let playbackPolyline: L.Polyline | null = null
let polylineSegments: L.Polyline[] = []
let markers: L.Marker[] = []
let popup: L.Popup | null = null

const currentTrajectory = computed(() => {
  if (!selectedDay.value) return null
  return filteredTrajectoryDays.value.find(d => d.date === selectedDay.value) || null
})

const filteredCurrentRecords = computed(() => {
  if (!currentTrajectory.value) return []
  let records = currentTrajectory.value.records
  
  // 时间筛选
  if (startTimeFilter.value || endTimeFilter.value) {
    records = records.filter(r => {
      if (startTimeFilter.value && r.timeStr < startTimeFilter.value) return false
      if (endTimeFilter.value && r.timeStr > endTimeFilter.value) return false
      return true
    })
  }
  
  // 速度筛选
  if (speedRange.value[0] > 0 || speedRange.value[1] < 20) {
    const filtered: typeof records = []
    for (let i = 0; i < records.length - 1; i++) {
      const record1 = records[i]
      const record2 = records[i + 1]
      const speed = calculateSpeed(
        record1.lat, record1.lng, record1.time,
        record2.lat, record2.lng, record2.time
      )
      if (speed >= speedRange.value[0] && speed <= speedRange.value[1]) {
        filtered.push(record1)
        if (i === records.length - 2) {
          filtered.push(record2)
        }
      }
    }
    records = filtered
  }
  
  // 停留点筛选
  if (showOnlyStayPoints.value) {
    const stayPointLocs = stayPoints.value.map(stay => `${stay.lat.toFixed(6)},${stay.lng.toFixed(6)}`)
    records = records.filter(r => {
      const loc = `${r.lat.toFixed(6)},${r.lng.toFixed(6)}`
      return stayPointLocs.includes(loc)
    })
  }
  
  return records
})

const trajectoryStats = computed(() => {
  if (!filteredCurrentRecords.value.length) return null
  const records = filteredCurrentRecords.value
  let totalDistance = 0
  let maxSpeed = 0
  let avgSpeed = 0
  const speeds: number[] = []

  for (let i = 1; i < records.length; i++) {
    const prev = records[i - 1]
    const curr = records[i]
    const timeDiff = (curr.time - prev.time) / 1000 / 60
    if (timeDiff > 0) {
      const R = 6371
      const dLat = (curr.lat - prev.lat) * Math.PI / 180
      const dLon = (curr.lng - prev.lng) * Math.PI / 180
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(prev.lat * Math.PI / 180) * Math.cos(curr.lat * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      const distance = R * c * 1000
      totalDistance += distance
      const speed = distance / timeDiff / 60
      speeds.push(speed)
      if (speed > maxSpeed) maxSpeed = speed
    }
  }

  if (speeds.length > 0) {
    avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length
  }

  const duration = records.length > 1 ? (records[records.length - 1].time - records[0].time) / 1000 / 60 : 0

  return {
    totalDistance: (totalDistance / 1000).toFixed(2),
    maxSpeed: maxSpeed.toFixed(1),
    avgSpeed: avgSpeed.toFixed(1),
    duration: duration.toFixed(0),
    pointCount: records.length
  }
})

const pathPoints = computed(() => {
  if (!filteredCurrentRecords.value.length) return []
  return filteredCurrentRecords.value.map(r => {
    const [lng, lat] = wgs84ToGcj02(r.lng, r.lat)
    return [lat, lng] as [number, number]
  })
})

function clearMap() {
  if (polyline) {
    polyline.remove()
    polyline = null
  }
  if (playbackPolyline) {
    playbackPolyline.remove()
    playbackPolyline = null
  }
  polylineSegments.forEach(segment => segment.remove())
  polylineSegments = []
  markers.forEach(m => m.remove())
  markers = []
  if (currentPositionMarker.value) {
    currentPositionMarker.value.remove()
    currentPositionMarker.value = null
  }
  if (stayPointMarker) {
    stayPointMarker.remove()
    stayPointMarker = null
  }
  if (popup) {
    popup.remove()
    popup = null
  }
}

function addMarkers(records: ProcessedRecord[]) {
  if (!map) return
  records.forEach((r) => {
    const [gcjLng, gcjLat] = wgs84ToGcj02(r.lng, r.lat)
    const marker = L.marker([gcjLat, gcjLng], {
      title: r.formattedTime,
    }).addTo(map!)

    marker.bindPopup(`
      <div style="padding:4px;">
        <div style="font-weight:bold;margin-bottom:4px;">${r.formattedTime}</div>
        <div>纬度: ${r.lat.toFixed(6)}</div>
        <div>经度: ${r.lng.toFixed(6)}</div>
        ${r.name ? `<div>位置: ${r.name}</div>` : ''}
      </div>
    `)

    markers.push(marker)
  })
}

function drawTrajectory() {
  if (!map || !currentTrajectory.value) return
  clearMap()

  const points = pathPoints.value
  if (points.length === 0) return

  // 分析停留点
  analyzeStayPoints()

  // 生成带颜色的轨迹线段
  const records = filteredCurrentRecords.value
  const segments: Array<{ points: L.LatLngExpression[]; color: string }> = []

  for (let i = 0; i < records.length - 1; i++) {
    const record1 = records[i]
    const record2 = records[i + 1]
    const [gcjLng1, gcjLat1] = wgs84ToGcj02(record1.lng, record1.lat)
    const [gcjLng2, gcjLat2] = wgs84ToGcj02(record2.lng, record2.lat)
    
    const speed = calculateSpeed(
      record1.lat, record1.lng, record1.time,
      record2.lat, record2.lng, record2.time
    )
    
    const color = getSpeedColor(speed)
    
    segments.push({
      points: [[gcjLat1, gcjLng1], [gcjLat2, gcjLng2]],
      color
    })
  }

  // 绘制完整轨迹（半透明，带颜色区分）
  segments.forEach(segment => {
    const segmentLine = L.polyline(segment.points, {
      color: segment.color,
      weight: 4,
      opacity: 0.3,
    }).addTo(map!)
    polylineSegments.push(segmentLine)
  })

  // 绘制播放轨迹（高亮）
  playbackPolyline = L.polyline([], {
    color: '#409eff',
    weight: 6,
    opacity: 1,
  }).addTo(map)

  // 添加轨迹点击事件
  segments.forEach((segment, index) => {
    if (polylineSegments[index]) {
      polylineSegments[index].on('click', (e) => {
        showTrajectoryDetails(e)
      })
    }
  })

  // 添加停留点标记
  addStayPointMarkers()

  addMarkers(filteredCurrentRecords.value)

  // 定位到起点，然后开始绘制动画
  if (points.length > 0) {
    const startPoint = points[0]
    map.setView(startPoint, 16)
    
    // 延迟一点时间后开始动画，让地图先定位到起点
    setTimeout(() => {
      animateTrajectory(points)
    }, 300)
  }
}

// 显示轨迹详情
function showTrajectoryDetails(e: any) {
  if (!map) return
  
  const latlng = e.latlng
  const records = filteredCurrentRecords.value
  
  // 找到最近的轨迹点
  let closestRecord: any = null
  let minDistance = Infinity
  
  records.forEach((record) => {
    const [gcjLng, gcjLat] = wgs84ToGcj02(record.lng, record.lat)
    if (map) {
      const distance = map.distance(latlng, [gcjLat, gcjLng])
      if (distance < minDistance) {
        minDistance = distance
        closestRecord = record
      }
    }
  })
  
  if (closestRecord && minDistance < 50) { // 50米内的点
    L.popup({
      maxWidth: 300
    })
    .setLatLng(latlng)
    .setContent(`
      <div style="padding:4px;">
        <div style="font-weight:bold;margin-bottom:4px;">轨迹点详情</div>
        <div>时间: ${closestRecord.timeStr}</div>
        ${closestRecord.name ? `<div>位置: ${closestRecord.name}</div>` : ''}
        <div>坐标: ${closestRecord.lat.toFixed(6)}, ${closestRecord.lng.toFixed(6)}</div>
      </div>
    `)
    .openOn(map)
  }
}

function addStayPointMarkers() {
  if (!map) return
  stayPoints.value.forEach((stay, index) => {
    const [gcjLng, gcjLat] = wgs84ToGcj02(stay.lng, stay.lat)
    const durationMinutes = Math.round(stay.duration / 1000 / 60)
    
    const marker = L.marker([gcjLat, gcjLng], {
      icon: L.divIcon({
        className: 'stay-point-marker',
        html: `<div class="stay-marker-content">
                <div class="stay-marker-dot"></div>
                <div class="stay-marker-label">${index + 1}</div>
              </div>`,
        iconSize: [30, 30]
      })
    }).addTo(map!)

    marker.bindPopup(`
      <div style="padding:4px;">
        <div style="font-weight:bold;margin-bottom:4px;">停留点 ${index + 1}</div>
        ${stay.name ? `<div>位置: ${stay.name}</div>` : ''}
        <div>开始时间: ${formatTime(stay.startTime)}</div>
        <div>结束时间: ${formatTime(stay.endTime)}</div>
        <div>停留时长: ${durationMinutes} 分钟</div>
        <div>坐标: ${stay.lat.toFixed(6)}, ${stay.lng.toFixed(6)}</div>
      </div>
    `)

    markers.push(marker)
  })
}

function initMap() {
  if (!mapContainer.value) return

  const [initLng, initLat] = wgs84ToGcj02(120.121754, 36.007915)

  map = L.map(mapContainer.value, {
    zoomControl: false, // 禁用默认缩放控件，使用自定义的
    scrollWheelZoom: true,
    doubleClickZoom: true,
    dragging: true,
  }).setView([initLat, initLng], 14)

  L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=2&style=8&x={x}&y={y}&z={z}', {
    attribution: '&copy; 高德地图',
    subdomains: '1234',
    maxZoom: 18,
    tileSize: 256,
  }).addTo(map)

  L.control.scale({
    position: 'bottomleft',
    metric: true,
    imperial: false,
  }).addTo(map)

  L.control.zoom({
    position: 'topright',
  }).addTo(map)

  mapReady.value = true
  drawTrajectory()
}

async function loadData() {
  loading.value = true
  try {
    // 检查缓存
    const cacheKey = 'trajectory_data'
    if (dataCache.value[cacheKey]) {
      trajectoryDays.value = dataCache.value[cacheKey]
    } else {
      const data = await fetchLocationData()
      if (!data) {
        ElMessage.warning('未获取到轨迹数据，使用模拟数据展示')
        trajectoryDays.value = getMockData()
      } else {
        trajectoryDays.value = processDeviceData(data)
      }
      // 缓存数据
      dataCache.value[cacheKey] = trajectoryDays.value
    }
    const dayParam = route.query.day as string
    if (dayParam && trajectoryDays.value.some(d => d.date === dayParam)) {
      selectedDay.value = dayParam
    } else if (trajectoryDays.value.length > 0) {
      selectedDay.value = trajectoryDays.value[0].date
    }
  } catch (e) {
    ElMessage.error('数据加载失败')
    trajectoryDays.value = getMockData()
    if (trajectoryDays.value.length > 0) selectedDay.value = trajectoryDays.value[0].date
  } finally {
    loading.value = false
  }
}

function getMockData(): DayTrajectory[] {
  const now = Date.now()
  const records: ProcessedRecord[] = []
  for (let i = 0; i < 20; i++) {
    const t = now - i * 30 * 60 * 1000
    records.push({
      lat: 36.007915 + Math.sin(i * 0.3) * 0.005,
      lng: 120.121754 + Math.cos(i * 0.3) * 0.005,
      time: t,
      name: i === 0 ? '家' : i === 19 ? '公园' : '',
      id: `mock-${i}`,
      formattedTime: formatTime(t),
      date: new Date(t).toISOString().slice(0, 10),
      timeStr: new Date(t).toTimeString().slice(0, 5),
    })
  }
  const map = new Map<string, ProcessedRecord[]>()
  for (const r of records) {
    if (!map.has(r.date)) map.set(r.date, [])
    map.get(r.date)!.push(r)
  }
  const days: DayTrajectory[] = []
  for (const [date, list] of map) {
    list.sort((a, b) => a.time - b.time)
    days.push({ date, records: list, startPoint: list[0], endPoint: list[list.length - 1], pointCount: list.length })
  }
  days.sort((a, b) => b.date.localeCompare(a.date))
  return days
}

function selectDay(date: string) {
  selectedDay.value = date
  router.replace({ query: { day: date } })
  if (window.innerWidth < 768) {
    sidebarOpen.value = false
  }
  stopPlayback()
  if (compareMode.value) {
    if (!comparedDays.value.includes(date)) {
      comparedDays.value.push(date)
    }
    drawCompareTrajectories()
  } else {
    drawTrajectory()
  }
}

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}

function closeSidebar() {
  sidebarOpen.value = false
}

function toggleSidebarCollapse() {
  isSidebarCollapsed.value = !isSidebarCollapsed.value
}

// 停留点分析
const stayPoints = ref<Array<{
  lat: number
  lng: number
  startTime: number
  endTime: number
  duration: number
  name: string
}>>([])

function analyzeStayPoints() {
  const records = filteredCurrentRecords.value
  if (records.length < 2) {
    stayPoints.value = []
    return
  }

  const stayThreshold = minStayDuration.value * 60 * 1000 // 最小停留时间阈值
  const distanceThreshold = 0.001 // 距离阈值（约100米）
  const stays: typeof stayPoints.value = []

  let currentStay: typeof stays[0] | null = null

  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    
    if (!currentStay) {
      currentStay = {
        lat: record.lat,
        lng: record.lng,
        startTime: record.time,
        endTime: record.time,
        duration: 0,
        name: record.name || ''
      }
    } else {
      // 计算距离
      const R = 6371
      const dLat = (record.lat - currentStay.lat) * Math.PI / 180
      const dLon = (record.lng - currentStay.lng) * Math.PI / 180
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(currentStay.lat * Math.PI / 180) * Math.cos(record.lat * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      const distance = R * c * 1000

      if (distance <= distanceThreshold) {
        // 在同一位置，更新结束时间
        currentStay.endTime = record.time
        currentStay.duration = currentStay.endTime - currentStay.startTime
        if (record.name) {
          currentStay.name = record.name
        }
      } else {
        // 离开当前位置，检查是否是停留点
        if (currentStay.duration >= stayThreshold) {
          stays.push(currentStay)
        }
        // 开始新的停留
        currentStay = {
          lat: record.lat,
          lng: record.lng,
          startTime: record.time,
          endTime: record.time,
          duration: 0,
          name: record.name || ''
        }
      }
    }
  }

  // 检查最后一个停留
  if (currentStay && currentStay.duration >= stayThreshold) {
    stays.push(currentStay)
  }

  stayPoints.value = stays
}

// 播放控制功能
function startPlayback() {
  if (isPlaying.value) return
  if (filteredCurrentRecords.value.length === 0) {
    ElMessage.warning('没有轨迹数据可播放')
    return
  }

  isPlaying.value = true
  currentPlayIndex.value = 0
  playProgress.value = 0
  currentPlayTime.value = ''

  const records = filteredCurrentRecords.value
  const points = pathPoints.value
  
  // 计算每个线段的距离
  const segmentDistances: number[] = []
  let totalDistance = 0
  
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i]
    const p2 = points[i + 1]
    let distance = 0
    if (Array.isArray(p1) && Array.isArray(p2)) {
      const dLat = p2[0] - p1[0]
      const dLng = p2[1] - p1[1]
      distance = Math.sqrt(dLat * dLat + dLng * dLng)
    }
    segmentDistances.push(distance)
    totalDistance += distance
  }
  
  // 计算每个线段的动态播放时间
  // 密集区域（距离小）：使用较短的时间
  // 稀疏区域（距离大）：使用较长的时间
  const segmentDurations: number[] = []
  const minSegmentDuration = 50 // 最小线段播放时间（毫秒）
  const maxSegmentDuration = 2000 // 最大线段播放时间（毫秒）
  const baseSpeed = 0.0005 // 基础速度系数
  
  for (let i = 0; i < segmentDistances.length; i++) {
    const distance = segmentDistances[i]
    // 使用对数函数平滑速度变化
    // 距离越大，播放时间越长
    let duration = Math.log(distance / baseSpeed + 1) * 200
    
    // 限制在最小和最大时间之间
    duration = Math.max(minSegmentDuration, Math.min(maxSegmentDuration, duration))
    
    segmentDurations.push(duration)
  }
  
  const totalDuration = segmentDurations.reduce((sum, d) => sum + d, 0)
  
  // 清除之前的动画帧
  if (playInterval.value) {
    cancelAnimationFrame(playInterval.value as unknown as number)
    playInterval.value = null
  }

  // 确保完整轨迹已绘制
  if (!polylineSegments.length) {
    drawTrajectory()
    return
  }
  
  // 初始化播放轨迹
  if (playbackPolyline) {
    playbackPolyline.setLatLngs([])
  }

  // 初始化当前位置标记
  if (!currentPositionMarker.value) {
    const firstRecord = records[0]
    const [gcjLng, gcjLat] = wgs84ToGcj02(firstRecord.lng, firstRecord.lat)
    currentPositionMarker.value = L.marker([gcjLat, gcjLng], {
      icon: L.divIcon({
        className: 'current-position-marker',
        html: '<div class="marker-pulse"></div>',
        iconSize: [12, 12]
      })
    }).addTo(map!)
  } else {
    // 如果标记已存在，移动到起点
    const firstRecord = records[0]
    const [gcjLng, gcjLat] = wgs84ToGcj02(firstRecord.lng, firstRecord.lat)
    currentPositionMarker.value.setLatLng([gcjLat, gcjLng])
  }

  const startTime = Date.now()
  let animationFrameId: number
  let lastPanTime = Date.now()
  let lastLat = 0
  let lastLng = 0

  const animate = () => {
    const now = Date.now()
    const elapsed = now - startTime
    
    // 计算整体进度
    const progress = Math.min(elapsed / totalDuration, 1)
    
    // 根据动态时间分配计算当前位置
    let currentSegmentIndex = 0
    let t = 0 // 在线段内的进度（0-1）
    
    // 计算当前应该播放到哪个线段
    let accumulatedDuration = 0
    const targetDuration = progress * totalDuration
    
    for (let i = 0; i < segmentDurations.length; i++) {
      accumulatedDuration += segmentDurations[i]
      if (accumulatedDuration >= targetDuration) {
        currentSegmentIndex = i
        break
      }
    }
    
    // 计算在当前线段内的进度
    const segmentStart = currentSegmentIndex === 0 ? 0 : segmentDurations.slice(0, currentSegmentIndex).reduce((sum, d) => sum + d, 0)
    const currentSegmentDuration = segmentDurations[currentSegmentIndex]
    t = currentSegmentDuration > 0 ? (targetDuration - segmentStart) / currentSegmentDuration : 0
    
    const nextSegmentIndex = Math.min(currentSegmentIndex + 1, points.length - 1)
    
    // 获取当前和下一个点
    const currentPoint = points[currentSegmentIndex]
    const nextPoint = points[nextSegmentIndex]
    
    // 计算当前位置（线性插值）
    let currentLat: number, currentLng: number
    if (Array.isArray(currentPoint) && Array.isArray(nextPoint) && currentPoint.length === 2 && nextPoint.length === 2) {
      currentLat = currentPoint[0] + (nextPoint[0] - currentPoint[0]) * t
      currentLng = currentPoint[1] + (nextPoint[1] - currentPoint[1]) * t
    } else {
      // 使用L.latLng处理非数组类型
      const latLng = L.latLng(currentPoint)
      currentLat = latLng.lat
      currentLng = latLng.lng
    }

    // 更新当前时间显示 - 根据插值位置计算精确时间戳
    const currentRecord = records[currentSegmentIndex]
    const nextRecord = records[nextSegmentIndex]
    if (currentRecord && nextRecord) {
      // 根据插值比例 t 计算当前时间戳
      const currentTime = currentRecord.time + (nextRecord.time - currentRecord.time) * t
      currentPlayTime.value = formatTime(currentTime)
    } else if (currentRecord) {
      currentPlayTime.value = currentRecord.timeStr
    }

    // 平滑移动当前位置标记
    if (currentPositionMarker.value) {
      currentPositionMarker.value.setLatLng([currentLat, currentLng])
    }

    // 逐步生成轨迹路线（只显示到当前位置的路线）
    if (playbackPolyline) {
      const linePoints = points.slice(0, currentSegmentIndex + 1) as L.LatLngExpression[]
      // 添加当前插值点
      linePoints.push([currentLat, currentLng])
      playbackPolyline.setLatLngs(linePoints)
    }

    // 限制地图平移频率，避免抖动
    const nowPan = Date.now()
    const distanceChanged = Math.abs(currentLat - lastLat) + Math.abs(currentLng - lastLng)
    
    // 增加防抖延迟，减少地图更新频率
    if (nowPan - lastPanTime > 80 && distanceChanged > 0.0002) {
      // 使用平滑动画移动地图到当前位置
      if (map) {
        map.panTo([currentLat, currentLng], {
          animate: true,
          duration: 0.12,
          easeLinearity: 0.3
        })
      }
      lastPanTime = nowPan
      lastLat = currentLat
      lastLng = currentLng
    }

    // 更新进度
    playProgress.value = progress * 100

    if (progress < 1 && isPlaying.value) {
      animationFrameId = requestAnimationFrame(animate)
    } else if (progress >= 1) {
      // 播放完成
      stopPlayback()
    }
  }

  animationFrameId = requestAnimationFrame(animate)
  
  // 保存动画帧ID，以便在停止时清除
  playInterval.value = animationFrameId as unknown as number
}

function pausePlayback() {
  if (!isPlaying.value) return
  isPlaying.value = false
  if (playInterval.value) {
    clearInterval(playInterval.value)
    playInterval.value = null
  }
}

function stopPlayback() {
  isPlaying.value = false
  if (playInterval.value) {
    // 清除动画帧
    cancelAnimationFrame(playInterval.value as unknown as number)
    playInterval.value = null
  }
  currentPlayIndex.value = 0
  playProgress.value = 0
  currentPlayTime.value = ''
  if (currentPositionMarker.value) {
    currentPositionMarker.value.remove()
    currentPositionMarker.value = null
  }
  if (playbackPolyline) {
    playbackPolyline.setLatLngs([])
  }
}

function changePlaySpeed(speed: number) {
  playSpeed.value = speed
  if (isPlaying.value) {
    pausePlayback()
    startPlayback()
  }
}

// 进度条拖动处理
function handleProgressChange(percentage: number) {
  // 进度条拖动结束时，跳转到指定位置
  seekToProgress(percentage)
}

function handleProgressInput(percentage: number) {
  // 进度条拖动过程中，实时更新位置
  if (!isPlaying.value) {
    seekToProgress(percentage)
  }
}

function seekToProgress(percentage: number) {
  if (!map || !filteredCurrentRecords.value.length) return
  
  const records = filteredCurrentRecords.value
  const points = pathPoints.value
  
  // 计算目标位置
  const progress = percentage / 100
  const segmentProgress = progress * (points.length - 1)
  const currentSegmentIndex = Math.floor(segmentProgress)
  const nextSegmentIndex = Math.min(currentSegmentIndex + 1, points.length - 1)
  const t = segmentProgress - currentSegmentIndex
  
  const currentPoint = points[currentSegmentIndex]
  const nextPoint = points[nextSegmentIndex]
  
  let currentLat: number, currentLng: number
  if (Array.isArray(currentPoint) && Array.isArray(nextPoint) && currentPoint.length === 2 && nextPoint.length === 2) {
    currentLat = currentPoint[0] + (nextPoint[0] - currentPoint[0]) * t
    currentLng = currentPoint[1] + (nextPoint[1] - currentPoint[1]) * t
  } else {
    const latLng = L.latLng(currentPoint)
    currentLat = latLng.lat
    currentLng = latLng.lng
  }
  
  // 更新时间显示 - 根据插值位置计算精确时间戳
  const currentRecord = records[currentSegmentIndex]
  const nextRecord = records[nextSegmentIndex]
  if (currentRecord && nextRecord) {
    // 根据插值比例 t 计算当前时间戳
    const currentTime = currentRecord.time + (nextRecord.time - currentRecord.time) * t
    currentPlayTime.value = formatTime(currentTime)
  } else if (currentRecord) {
    currentPlayTime.value = currentRecord.timeStr
  }
  
  // 更新位置标记
  if (!currentPositionMarker.value) {
    currentPositionMarker.value = L.marker([currentLat, currentLng], {
      icon: L.divIcon({
        className: 'current-position-marker',
        html: '<div class="marker-pulse"></div>',
        iconSize: [12, 12]
      })
    }).addTo(map!)
  } else {
    currentPositionMarker.value.setLatLng([currentLat, currentLng])
  }
  
  // 更新轨迹路线
  if (playbackPolyline) {
    const linePoints = points.slice(0, currentSegmentIndex + 1) as L.LatLngExpression[]
    linePoints.push([currentLat, currentLng])
    playbackPolyline.setLatLngs(linePoints)
  }
  
  // 更新地图视图
  map.panTo([currentLat, currentLng], {
    animate: false
  })
}

watch(selectedDay, () => {
  if (mapReady.value) {
    stopPlayback()
    drawTrajectory()
  }
})

// 数据缓存
const dataCache = ref<Record<string, any>>({})

// 防抖函数
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => {
      func(...args)
    }, wait)
  }
}

onMounted(async () => {
  await loadData()
  initMap()
})

onUnmounted(() => {
  stopPlayback()
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<template>
  <div class="map-page" :class="{ 'hide-list': !sidebarOpen }">
    <div class="overlay" :class="{ visible: sidebarOpen }" @click="closeSidebar"></div>

    <div class="sidebar" :class="{ open: sidebarOpen, collapsed: isSidebarCollapsed }">
      <div class="sidebar-header">
        <el-button text :icon="ArrowLeft" @click="$router.push('/')">返回首页</el-button>
        <h2 v-if="!isSidebarCollapsed"><MapLocation style="width:20px;height:20px;vertical-align:middle;margin-right:6px;"/>轨迹回放</h2>
        <el-button v-if="!isSidebarCollapsed" text :icon="ArrowLeft" @click="toggleSidebarCollapse" class="collapse-btn">收起</el-button>
        <el-button v-else text :icon="ArrowRight" @click="toggleSidebarCollapse" class="expand-btn">展开</el-button>
      </div>
      <!-- 筛选条件折叠栏 -->
      <div class="collapse-section">
        <div class="collapse-header" @click="toggleSection('filters')">
          <span class="collapse-title"><Filter style="width:16px;height:16px;margin-right:4px;"/>筛选条件</span>
          <el-icon :component="expandedSections.filters ? ArrowDown : ArrowRight" style="width:16px;height:16px;"/>
        </div>
        <div v-show="expandedSections.filters" class="collapse-content filter-section">
          <div class="filter-row">
            <span class="filter-label">日期范围</span>
            <el-date-picker
              v-model="dateRange"
              type="daterange"
              range-separator="至"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              size="small"
              value-format="YYYY-MM-DD"
              @change="drawTrajectory"
            />
          </div>
          <div class="filter-row">
            <span class="filter-label">时间筛选</span>
            <div class="time-filter">
              <el-time-select
                v-model="startTimeFilter"
                placeholder="开始时间"
                start="00:00"
                step="00:15"
                end="23:45"
                size="small"
                style="width: 100px;"
                @change="applyTimeFilter"
              />
              <span class="time-separator">至</span>
              <el-time-select
                v-model="endTimeFilter"
                placeholder="结束时间"
                start="00:00"
                step="00:15"
                end="23:45"
                size="small"
                style="width: 100px;"
                @change="applyTimeFilter"
              />
            </div>
          </div>
          <div class="filter-row">
            <span class="filter-label">快捷时间</span>
            <div class="quick-filters">
              <el-button
                v-for="(filter, index) in quickTimeFilters"
                :key="index"
                size="small"
                @click="applyQuickTimeFilter(filter)"
                :type="currentQuickFilter === filter.label ? 'primary' : 'default'"
              >
                {{ filter.label }}
              </el-button>
            </div>
          </div>
          <div class="filter-row">
            <span class="filter-label">速度筛选</span>
            <div class="speed-filter">
              <el-slider
                v-model="speedRange"
                :min="0"
                :max="20"
                :step="1"
                range
                size="small"
                @change="applySpeedFilter"
              />
              <div class="speed-range">
                {{ speedRange[0] }} - {{ speedRange[1] }} km/h
              </div>
            </div>
          </div>
          <div class="filter-row">
            <span class="filter-label">停留点筛选</span>
            <div class="stay-filter">
              <el-checkbox v-model="showOnlyStayPoints" @change="applyStayFilter">
                只显示停留点
              </el-checkbox>
              <el-input-number
                v-model="minStayDuration"
                :min="1"
                :max="60"
                :step="1"
                size="small"
                placeholder="最小停留时间(分钟)"
                @change="applyStayFilter"
              />
            </div>
          </div>
          <div v-if="dateRange || startTimeFilter || endTimeFilter" class="filter-actions">
            <el-button size="small" @click="clearFilters">清除筛选</el-button>
            <span class="filter-info">共 {{ filteredTrajectoryDays.length }} 天</span>
          </div>
          <div class="compare-mode">
            <el-checkbox v-model="compareMode" @change="toggleCompareMode">
              轨迹对比模式
            </el-checkbox>
            <div v-if="compareMode" class="compare-days">
              <el-select
                v-model="comparedDays"
                multiple
                placeholder="选择要对比的日期"
                size="small"
                @change="drawCompareTrajectories"
              >
                <el-option
                  v-for="day in filteredTrajectoryDays"
                  :key="day.date"
                  :label="day.date"
                  :value="day.date"
                />
              </el-select>
              <el-button
                size="small"
                @click="clearCompare"
              >
                清除对比
              </el-button>
            </div>
          </div>
        </div>
      </div>
      <div v-if="loading" class="loading-wrap">
        加载中...
      </div>
      <div v-else-if="trajectoryDays.length === 0" class="empty-wrap">
        <el-empty description="暂无轨迹数据" />
      </div>
      <!-- 日期列表折叠栏 -->
      <div v-else class="collapse-section">
        <div class="collapse-header" @click="toggleSection('days')">
          <span class="collapse-title"><Calendar style="width:16px;height:16px;margin-right:4px;"/>日期列表</span>
          <el-icon :component="expandedSections.days ? ArrowDown : ArrowRight" style="width:16px;height:16px;"/>
        </div>
        <div v-show="expandedSections.days" class="collapse-content day-list">
          <div
            v-for="day in filteredTrajectoryDays"
            :key="day.date"
            class="day-card"
            :class="{ active: selectedDay === day.date }"
            @click="selectDay(day.date)"
          >
            <div class="day-title">{{ day.date }}</div>
            <div class="day-meta">
              <el-tag size="small" type="info">{{ day.pointCount }} 个点</el-tag>
              <span class="time-range">
                <Timer style="width:12px;height:12px;" />
                {{ day.startPoint.timeStr }} - {{ day.endPoint.timeStr }}
              </span>
            </div>
          </div>
        </div>
      </div>
      <!-- 轨迹详情折叠栏 -->
      <div v-if="currentTrajectory" class="collapse-section">
        <div class="collapse-header" @click="toggleSection('details')">
          <span class="collapse-title"><PieChart style="width:16px;height:16px;margin-right:4px;"/>当日轨迹详情</span>
          <el-icon :component="expandedSections.details ? ArrowDown : ArrowRight" style="width:16px;height:16px;"/>
        </div>
        <div v-show="expandedSections.details" class="collapse-content detail-panel">
          <div class="detail-actions">
            <el-button 
              size="small" 
              :type="showOnlyStayArea ? 'primary' : 'default'" 
              @click.stop="toggleStayAreaView"
              :disabled="stayPoints.length === 0"
            >
              {{ showOnlyStayArea ? '显示完整轨迹' : '显示停留点区域' }}
            </el-button>
          </div>
          <div v-if="trajectoryStats" class="stats-cards">
          <div class="stat-item">
            <div class="stat-value">{{ trajectoryStats.totalDistance }}</div>
            <div class="stat-label">公里</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">{{ trajectoryStats.maxSpeed }}</div>
            <div class="stat-label">最大 m/min</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">{{ trajectoryStats.avgSpeed }}</div>
            <div class="stat-label">平均 m/min</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">{{ trajectoryStats.duration }}</div>
            <div class="stat-label">分钟</div>
          </div>
        </div>
          <div v-if="stayPoints.length > 0" class="stay-points-section">
            <h4>停留点分析</h4>
            <div class="stay-points-list">
              <div
                v-for="(stay, idx) in stayPoints"
                :key="idx"
                class="stay-point-item"
              >
                <div class="stay-point-dot">{{ idx + 1 }}</div>
                <div class="stay-point-content">
                  <div class="stay-point-time">
                    {{ formatTime(stay.startTime) }} - {{ formatTime(stay.endTime) }}
                  </div>
                  <div class="stay-point-duration">
                    停留 {{ Math.round(stay.duration / 1000 / 60) }} 分钟
                  </div>
                  <div v-if="stay.name" class="stay-point-name">{{ stay.name }}</div>
                  <div class="stay-point-coords">
                    {{ stay.lat.toFixed(5) }}, {{ stay.lng.toFixed(5) }}
                  </div>
                </div>
                <div class="stay-point-action">
                  <el-button 
                    size="mini" 
                    @click.stop="showStayPointArea(stay)"
                  >
                    查看区域
                  </el-button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- 记录列表折叠栏 -->
      <div v-if="filteredCurrentRecords.length > 0" class="collapse-section">
        <div class="collapse-header" @click="toggleSection('records')">
          <span class="collapse-title"><List style="width:16px;height:16px;margin-right:4px;"/>轨迹记录</span>
          <el-icon :component="expandedSections.records ? ArrowDown : ArrowRight" style="width:16px;height:16px;"/>
        </div>
        <div v-show="expandedSections.records" class="collapse-content record-list">
          <div
            v-for="(r, idx) in filteredCurrentRecords"
            :key="r.id"
            class="record-item"
            :class="{ start: idx === 0, end: idx === filteredCurrentRecords.length - 1 }"
          >
            <div class="record-dot"></div>
            <div class="record-content">
              <div class="record-time">{{ r.timeStr }}</div>
              <div class="record-coords">{{ r.lat.toFixed(5) }}, {{ r.lng.toFixed(5) }}</div>
              <div v-if="r.name" class="record-name">{{ r.name }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="map-wrap">
      <div ref="mapContainer" class="map-container"></div>
      <div v-if="!mapReady" class="map-placeholder">
        <el-empty description="地图加载中..." />
      </div>
      
      <!-- 播放控制栏 -->
      <div v-if="mapReady && filteredCurrentRecords.length > 0" class="playback-controls">
        <div class="playback-buttons">
          <el-button 
            :icon="VideoPlay" 
            type="primary" 
            circle 
            @click="startPlayback" 
            :disabled="isPlaying"
          />
          <el-button 
            :icon="VideoPause" 
            type="warning" 
            circle 
            @click="pausePlayback" 
            :disabled="!isPlaying"
          />
          <el-button 
            :icon="Close" 
            type="danger" 
            circle 
            @click="stopPlayback"
          />
        </div>
        <div class="playback-speed">
          <span class="speed-label">速度:</span>
          <el-button 
            size="small" 
            :type="playSpeed === 0.1 ? 'primary' : 'default'" 
            @click="changePlaySpeed(0.1)"
          >0.1x</el-button>
          <el-button 
            size="small" 
            :type="playSpeed === 0.25 ? 'primary' : 'default'" 
            @click="changePlaySpeed(0.25)"
          >0.25x</el-button>
          <el-button 
            size="small" 
            :type="playSpeed === 0.5 ? 'primary' : 'default'" 
            @click="changePlaySpeed(0.5)"
          >0.5x</el-button>
          <el-button 
            size="small" 
            :type="playSpeed === 1 ? 'primary' : 'default'" 
            @click="changePlaySpeed(1)"
          >1x</el-button>
          <el-button 
            size="small" 
            :type="playSpeed === 2 ? 'primary' : 'default'" 
            @click="changePlaySpeed(2)"
          >2x</el-button>
          <el-button 
            size="small" 
            :type="playSpeed === 3 ? 'primary' : 'default'" 
            @click="changePlaySpeed(3)"
          >3x</el-button>
        </div>
        <div class="playback-progress">
          <span class="current-time-label" v-if="currentPlayTime">
            <Timer style="width:14px;height:14px;vertical-align:middle;margin-right:4px;" />
            {{ currentPlayTime }}
          </span>
          <el-slider 
            v-model="playProgress" 
            :min="0" 
            :max="100" 
            :step="0.1"
            :show-tooltip="true"
            :format-tooltip="(val: number) => `${Math.round(val)}%`"
            @change="handleProgressChange"
            @input="handleProgressInput"
          />
        </div>
      </div>
    </div>

    <button class="toggle-btn list-btn" @click="toggleSidebar" :style="{ display: sidebarOpen ? 'none' : 'flex' }">
      <List style="width:20px;height:20px;" />
    </button>

    <button class="toggle-btn map-btn" @click="closeSidebar" :style="{ display: sidebarOpen ? 'flex' : 'none' }">
      <MapLocation style="width:20px;height:20px;" />
    </button>
  </div>
</template>

<style scoped>
.map-page {
  display: flex;
  height: 100vh;
  height: 100dvh;
  width: 100vw;
  overflow: hidden;
}

.sidebar {
  width: 360px;
  min-width: 360px;
  background: #f5f7fa;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: transform var(--transition-normal), width var(--transition-normal);
}

.sidebar.collapsed {
  width: 60px;
  min-width: 60px;
}

.sidebar.collapsed .sidebar-header h2,
.sidebar.collapsed .filter-section,
.sidebar.collapsed .day-list,
.sidebar.collapsed .detail-panel {
  display: none;
}

.sidebar.collapsed .sidebar-header {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-md) 0;
}

.collapse-btn,
.expand-btn {
  position: absolute;
  right: var(--spacing-md);
  top: 50%;
  transform: translateY(-50%);
}

/* 折叠栏目样式 */
.collapse-section {
  border-bottom: 1px solid #e4e7ed;
}

.collapse-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #fff;
  cursor: pointer;
  transition: background-color var(--transition-fast);
}

.collapse-header:hover {
  background: #f5f7fa;
}

.collapse-title {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  display: flex;
  align-items: center;
}

.collapse-content {
  background: #fff;
  padding: 0 16px;
  animation: slideDown 0.2s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    max-height: 0;
  }
  to {
    opacity: 1;
    max-height: 1000px;
  }
}

@media (max-width: 479px) {
  .sidebar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 1000;
    width: 90%;
    max-width: 280px;
    min-width: 260px;
    transform: translateX(-100%);
  }

  .sidebar.open {
    transform: translateX(0);
    box-shadow: var(--shadow-lg);
  }
}

@media (min-width: 480px) and (max-width: 767px) {
  .sidebar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 1000;
    width: 85%;
    max-width: 320px;
    min-width: 280px;
    transform: translateX(-100%);
  }

  .sidebar.open {
    transform: translateX(0);
    box-shadow: var(--shadow-lg);
  }
}

@media (min-width: 768px) and (max-width: 1023px) {
  .sidebar {
    width: 300px;
    min-width: 300px;
  }
}

@media (min-width: 1024px) and (max-width: 1439px) {
  .sidebar {
    width: 340px;
    min-width: 340px;
  }
}

@media (min-width: 1440px) {
  .sidebar {
    width: 380px;
    min-width: 380px;
  }
}

.sidebar-header {
  padding: var(--spacing-md);
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  flex-shrink: 0;
}

@media (max-width: 479px) {
  .sidebar-header {
    padding: var(--spacing-sm) var(--spacing-md);
  }
}

@media (min-width: 480px) and (max-width: 767px) {
  .sidebar-header {
    padding: var(--spacing-sm) var(--spacing-md);
  }
}

.sidebar-header h2 {
  margin: var(--spacing-sm) 0 0;
  font-size: var(--font-size-lg);
  color: #303133;
}

@media (max-width: 479px) {
  .sidebar-header h2 {
    font-size: var(--font-size-base);
  }
}

@media (min-width: 480px) and (max-width: 767px) {
  .sidebar-header h2 {
    font-size: var(--font-size-base);
  }
}

.filter-section {
  padding: var(--spacing-sm) var(--spacing-md);
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  flex-shrink: 0;
}

@media (max-width: 479px) {
  .filter-section {
    padding: var(--spacing-xs) var(--spacing-sm);
  }
}

.filter-row {
  display: flex;
  align-items: center;
  margin-bottom: var(--spacing-xs);
  gap: var(--spacing-xs);
  flex-wrap: wrap;
}

@media (max-width: 479px) {
  .filter-row {
    flex-direction: column;
    align-items: flex-start;
  }
}

.filter-label {
  font-size: var(--font-size-xs);
  color: #606266;
  min-width: 56px;
}

@media (max-width: 479px) {
  .filter-label {
    min-width: auto;
    margin-bottom: 4px;
  }
}

.time-filter {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  flex-wrap: wrap;
}

@media (max-width: 479px) {
  .time-filter {
    width: 100%;
    justify-content: space-between;
  }

  .time-filter .el-time-select {
    flex: 1;
    min-width: 0;
  }
}

.time-separator {
  color: #909399;
  font-size: var(--font-size-xs);
}

.filter-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: var(--spacing-xs);
  padding-top: var(--spacing-xs);
  border-top: 1px dashed #e4e7ed;
}

.filter-info {
  font-size: var(--font-size-xs);
  color: #409eff;
}

.loading-wrap, .empty-wrap {
  padding: var(--spacing-xl);
  text-align: center;
  flex-shrink: 0;
}

@media (max-width: 479px) {
  .loading-wrap, .empty-wrap {
    padding: var(--spacing-lg);
  }
}

.day-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-sm);
}

@media (max-width: 479px) {
  .day-list {
    padding: var(--spacing-xs);
  }
}

.day-card {
  background: #fff;
  border-radius: var(--radius-md);
  padding: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  border: 1px solid transparent;
}

.day-card:hover {
  border-color: #c6e2ff;
  box-shadow: 0 2px 8px rgba(64,158,255,0.1);
}

.day-card.active {
  border-color: #409eff;
  background: #ecf5ff;
}

@media (max-width: 479px) {
  .day-card {
    padding: var(--spacing-xs) var(--spacing-sm);
    margin-bottom: var(--spacing-xs);
  }
}

@media (min-width: 480px) and (max-width: 767px) {
  .day-card {
    padding: var(--spacing-xs) var(--spacing-sm);
    margin-bottom: var(--spacing-xs);
  }
}

.day-title {
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
  font-size: var(--font-size-sm);
}

@media (max-width: 479px) {
  .day-title {
    font-size: var(--font-size-xs);
  }
}

@media (min-width: 768px) and (max-width: 1023px) {
  .day-title {
    font-size: var(--font-size-base);
  }
}

.day-meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-size: var(--font-size-xs);
  color: #606266;
  flex-wrap: wrap;
}

.time-range {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 11px;
}

@media (max-width: 479px) {
  .time-range {
    font-size: 10px;
  }
}

.detail-panel {
  flex-shrink: 0;
  max-height: 40vh;
  max-height: 40dvh;
  overflow-y: auto;
  padding: var(--spacing-md);
  background: #fff;
  border-top: 1px solid #e4e7ed;
}

@media (max-width: 479px) {
  .detail-panel {
    max-height: 30vh;
    max-height: 30dvh;
    padding: var(--spacing-sm);
  }
}

@media (min-width: 480px) and (max-width: 767px) {
  .detail-panel {
    max-height: 35vh;
    max-height: 35dvh;
    padding: var(--spacing-sm);
  }
}

@media (min-width: 768px) and (max-width: 1023px) {
  .detail-panel {
    max-height: 35vh;
    max-height: 35dvh;
  }
}

.stats-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-md);
  padding: var(--spacing-sm);
  background: #f5f7fa;
  border-radius: var(--radius-md);
}

@media (max-width: 479px) {
  .stats-cards {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--spacing-xs);
    padding: var(--spacing-xs);
  }
}

@media (min-width: 480px) and (max-width: 767px) {
  .stats-cards {
    grid-template-columns: repeat(2, 1fr);
  }
}

.stat-item {
  text-align: center;
}

.stat-value {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: #409eff;
}

@media (max-width: 479px) {
  .stat-value {
    font-size: var(--font-size-sm);
  }
}

.stat-label {
  font-size: 10px;
  color: #909399;
  margin-top: 2px;
}

@media (max-width: 479px) {
  .stat-label {
    font-size: 9px;
  }
}

.detail-panel h4 {
  margin: 0 0 var(--spacing-sm);
  font-size: var(--font-size-sm);
  color: #303133;
}

@media (max-width: 479px) {
  .detail-panel h4 {
    font-size: var(--font-size-xs);
    margin-bottom: var(--spacing-xs);
  }
}

.record-list {
  padding-left: var(--spacing-xs);
}

.record-item {
  display: flex;
  align-items: flex-start;
  padding: var(--spacing-xs) 0;
  border-left: 2px solid #dcdfe6;
  padding-left: var(--spacing-sm);
  position: relative;
}

@media (max-width: 479px) {
  .record-item {
    padding: 6px 0;
  }
}

.record-item.start {
  border-left-color: #409eff;
}

.record-item.end {
  border-left-color: #67c23a;
}

.record-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #c0c4cc;
  position: absolute;
  left: -5px;
  top: 10px;
}

@media (max-width: 479px) {
  .record-dot {
    width: 6px;
    height: 6px;
    left: -4px;
    top: 8px;
  }
}

.record-item.start .record-dot {
  background: #409eff;
}

.record-item.end .record-dot {
  background: #67c23a;
}

.record-content {
  font-size: var(--font-size-xs);
}

@media (max-width: 479px) {
  .record-content {
    font-size: 11px;
  }
}

.record-time {
  font-weight: 500;
  color: #303133;
}

.record-coords {
  color: #606266;
  font-size: 11px;
  margin-top: 2px;
}

@media (max-width: 479px) {
  .record-coords {
    font-size: 10px;
  }
}

.record-name {
  color: #409eff;
  font-size: 11px;
  margin-top: 2px;
}

@media (max-width: 479px) {
  .record-name {
    font-size: 10px;
  }
}

.map-wrap {
  flex: 1;
  position: relative;
  min-width: 0;
}

.map-container {
  width: 100%;
  height: 100%;
}

.map-placeholder {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
}

/* 播放控制栏样式 */
.playback-controls {
  position: absolute;
  bottom: var(--spacing-lg);
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.95);
  border-radius: var(--radius-lg);
  padding: var(--spacing-md);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  min-width: 300px;
  max-width: 90%;
  z-index: 1001;
}

@media (max-width: 479px) {
  .playback-controls {
    bottom: var(--spacing-md);
    padding: var(--spacing-sm);
    min-width: 280px;
  }
}

.playback-buttons {
  display: flex;
  justify-content: center;
  gap: var(--spacing-md);
}

.playback-speed {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
  flex-wrap: wrap;
}

.speed-label {
  font-size: var(--font-size-xs);
  color: #606266;
  white-space: nowrap;
}

.playback-progress {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.current-time-label {
  display: inline-flex;
  align-items: center;
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: #409eff;
  background: rgba(64, 158, 255, 0.1);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  align-self: flex-start;
}

/* 当前位置标记动画 */
:deep(.current-position-marker) {
  z-index: 1000;
}

:deep(.marker-pulse) {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #409eff;
  position: relative;
  animation: pulse 1.5s infinite;
}

:deep(.marker-pulse::before) {
  content: '';
  position: absolute;
  top: -6px;
  left: -6px;
  right: -6px;
  bottom: -6px;
  border-radius: 50%;
  background: rgba(64, 158, 255, 0.3);
  animation: pulse-ring 1.5s infinite;
}

/* 停留点标记 */
:deep(.stay-point-marker) {
  z-index: 999;
}

:deep(.stay-marker-content) {
  position: relative;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
}

:deep(.stay-marker-dot) {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #67c23a;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 0 4px rgba(103, 194, 58, 0.3);
}

:deep(.stay-marker-label) {
  position: relative;
  z-index: 1;
  color: white;
  font-size: 12px;
  font-weight: bold;
}

@keyframes pulse {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  100% {
    transform: scale(1.2);
    opacity: 0.7;
  }
}

@keyframes pulse-ring {
  0% {
    transform: scale(0.8);
    opacity: 0.8;
  }
  100% {
    transform: scale(2);
    opacity: 0;
  }
}

/* 停留点分析样式 */
.stay-points-section {
  margin-top: var(--spacing-md);
  padding-top: var(--spacing-md);
  border-top: 1px solid #e4e7ed;
}

.stay-points-list {
  margin-top: var(--spacing-sm);
}

.stay-point-item {
  display: flex;
  align-items: flex-start;
  padding: var(--spacing-sm) 0;
  border-left: 2px solid #67c23a;
  padding-left: var(--spacing-sm);
  position: relative;
  margin-bottom: var(--spacing-sm);
}

.stay-point-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #67c23a;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
  position: absolute;
  left: -11px;
  top: 12px;
}

.stay-point-content {
  font-size: var(--font-size-xs);
  flex: 1;
}

.stay-point-time {
  font-weight: 500;
  color: #303133;
  margin-bottom: 2px;
}

.stay-point-duration {
  color: #67c23a;
  font-size: 11px;
  margin-bottom: 2px;
}

.stay-point-name {
  color: #409eff;
  font-size: 11px;
  margin-bottom: 2px;
}

.stay-point-coords {
  color: #606266;
  font-size: 10px;
}

.toggle-btn {
  display: none;
  position: fixed;
  z-index: 1001;
  padding: var(--spacing-sm);
  border-radius: var(--radius-md);
  background: #fff;
  box-shadow: var(--shadow-md);
  border: none;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.toggle-btn:hover {
  background: #f5f7fa;
}

.toggle-btn.list-btn {
  left: var(--spacing-md);
  bottom: var(--spacing-lg);
}

.toggle-btn.map-btn {
  right: var(--spacing-md);
  bottom: var(--spacing-lg);
}

@media (max-width: 479px) {
  .toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    padding: 0;
  }

  .toggle-btn.list-btn {
    left: var(--spacing-sm);
    bottom: var(--spacing-md);
  }

  .toggle-btn.map-btn {
    right: var(--spacing-sm);
    bottom: var(--spacing-md);
  }
}

@media (min-width: 480px) and (max-width: 767px) {
  .toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
  }

  .toggle-btn.list-btn {
    left: var(--spacing-md);
    bottom: var(--spacing-lg);
  }

  .toggle-btn.map-btn {
    right: var(--spacing-md);
    bottom: var(--spacing-lg);
  }
}

.overlay {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999;
}

@media (max-width: 767px) {
  .overlay.visible {
    display: block;
  }
}

@media (max-width: 767px) {
  .map-page.hide-list .sidebar {
    transform: translateX(-100%);
  }
}

@media (min-width: 768px) and (max-width: 1023px) {
  .toggle-btn {
    display: none !important;
  }
}

@media (orientation: landscape) and (max-height: 500px) {
  .sidebar {
    max-height: 100vh;
    max-height: 100dvh;
  }

  .detail-panel {
    max-height: 25vh;
    max-height: 25dvh;
  }

  .stats-cards {
    margin-bottom: var(--spacing-sm);
  }

  .sidebar-header h2 {
    font-size: var(--font-size-base);
  }
  
  .playback-controls {
    bottom: var(--spacing-md);
    padding: var(--spacing-sm);
  }
}

@media (min-width: 1920px) {
  .toggle-btn {
    width: 50px;
    height: 50px;
  }

  .toggle-btn.list-btn {
    left: var(--spacing-lg);
    bottom: var(--spacing-2xl);
  }

  .toggle-btn.map-btn {
    right: var(--spacing-lg);
    bottom: var(--spacing-2xl);
  }
  
  .playback-controls {
    min-width: 400px;
    padding: var(--spacing-lg);
  }
}
</style>
