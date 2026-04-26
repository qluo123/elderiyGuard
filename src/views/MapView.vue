<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { MapLocation, Timer, ArrowLeft, List } from '@element-plus/icons-vue'
import type { DayTrajectory, ProcessedRecord } from '@/types/location'
import { fetchLocationData, processDeviceData, formatTime, wgs84ToGcj02 } from '@/services/dataService'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const route = useRoute()
const router = useRouter()

const mapContainer = ref<HTMLDivElement | null>(null)
const trajectoryDays = ref<DayTrajectory[]>([])
const selectedDay = ref<string>('')
const loading = ref(false)
const mapReady = ref(false)
const sidebarOpen = ref(false)
const dateRange = ref<[Date, Date] | null>(null)
const startTimeFilter = ref<string>('')
const endTimeFilter = ref<string>('')

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
}

let map: L.Map | null = null
let polyline: L.Polyline | null = null
let markers: L.Marker[] = []
let popup: L.Popup | null = null

const currentTrajectory = computed(() => {
  if (!selectedDay.value) return null
  return filteredTrajectoryDays.value.find(d => d.date === selectedDay.value) || null
})

const filteredCurrentRecords = computed(() => {
  if (!currentTrajectory.value) return []
  let records = currentTrajectory.value.records
  if (startTimeFilter.value || endTimeFilter.value) {
    records = records.filter(r => {
      if (startTimeFilter.value && r.timeStr < startTimeFilter.value) return false
      if (endTimeFilter.value && r.timeStr > endTimeFilter.value) return false
      return true
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
  markers.forEach(m => m.remove())
  markers = []
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

  polyline = L.polyline(points, {
    color: '#409eff',
    weight: 4,
    opacity: 0.8,
  }).addTo(map)

  addMarkers(filteredCurrentRecords.value)

  const bounds = L.latLngBounds(points)
  map.fitBounds(bounds, { padding: [60, 60] })
}

function initMap() {
  if (!mapContainer.value) return

  const [initLng, initLat] = wgs84ToGcj02(120.121754, 36.007915)

  map = L.map(mapContainer.value, {
    zoomControl: false,
  }).setView([initLat, initLng], 14)

  L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=2&style=8&x={x}&y={y}&z={z}', {
    attribution: '&copy; 高德地图',
    subdomains: '1234',
    maxZoom: 18,
    tileSize: 256,
  }).addTo(map)

  L.control.scale({
    position: 'bottomright',
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
    const data = await fetchLocationData()
    if (!data) {
      ElMessage.warning('未获取到轨迹数据，使用模拟数据展示')
      trajectoryDays.value = getMockData()
    } else {
      trajectoryDays.value = processDeviceData(data)
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
  drawTrajectory()
}

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}

function closeSidebar() {
  sidebarOpen.value = false
}

watch(selectedDay, () => {
  if (mapReady.value) drawTrajectory()
})

onMounted(async () => {
  await loadData()
  initMap()
})
</script>

<template>
  <div class="map-page" :class="{ 'hide-list': !sidebarOpen }">
    <div class="overlay" :class="{ visible: sidebarOpen }" @click="closeSidebar"></div>

    <div class="sidebar" :class="{ open: sidebarOpen }">
      <div class="sidebar-header">
        <el-button text :icon="ArrowLeft" @click="$router.push('/')">返回首页</el-button>
        <h2><MapLocation style="width:20px;height:20px;vertical-align:middle;margin-right:6px;"/>轨迹回放</h2>
      </div>
      <div class="filter-section">
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
        <div v-if="dateRange || startTimeFilter || endTimeFilter" class="filter-actions">
          <el-button size="small" @click="clearFilters">清除筛选</el-button>
          <span class="filter-info">共 {{ filteredTrajectoryDays.length }} 天</span>
        </div>
      </div>
      <div v-if="loading" class="loading-wrap">
        加载中...
      </div>
      <div v-else-if="trajectoryDays.length === 0" class="empty-wrap">
        <el-empty description="暂无轨迹数据" />
      </div>
      <div v-else class="day-list">
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
      <div v-if="currentTrajectory" class="detail-panel">
        <h4>当日轨迹详情</h4>
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
        <div class="record-list">
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

@media (max-width: 767px) {
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

  .sidebar.collapsed {
    transform: translateX(-100%);
  }
}

@media (min-width: 768px) and (max-width: 1023px) {
  .sidebar {
    width: 300px;
    min-width: 300px;
  }
}

.sidebar-header {
  padding: var(--spacing-md);
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  flex-shrink: 0;
}

@media (max-width: 767px) {
  .sidebar-header {
    padding: var(--spacing-sm) var(--spacing-md);
  }
}

.sidebar-header h2 {
  margin: var(--spacing-sm) 0 0;
  font-size: var(--font-size-lg);
  color: #303133;
}

@media (max-width: 767px) {
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

.filter-row {
  display: flex;
  align-items: center;
  margin-bottom: var(--spacing-xs);
  gap: var(--spacing-xs);
}

.filter-label {
  font-size: var(--font-size-xs);
  color: #606266;
  min-width: 56px;
}

.time-filter {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
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

@media (max-width: 767px) {
  .loading-wrap, .empty-wrap {
    padding: var(--spacing-lg);
  }
}

.day-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-sm);
}

@media (max-width: 767px) {
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

@media (max-width: 767px) {
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

@media (max-width: 767px) {
  .day-title {
    font-size: var(--font-size-xs);
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

.detail-panel {
  flex-shrink: 0;
  max-height: 40vh;
  overflow-y: auto;
  padding: var(--spacing-md);
  background: #fff;
  border-top: 1px solid #e4e7ed;
}

@media (max-width: 767px) {
  .detail-panel {
    max-height: 35vh;
    padding: var(--spacing-sm);
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

.stat-item {
  text-align: center;
}

.stat-value {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: #409eff;
}

.stat-label {
  font-size: 10px;
  color: #909399;
  margin-top: 2px;
}

.detail-panel h4 {
  margin: 0 0 var(--spacing-sm);
  font-size: var(--font-size-sm);
  color: #303133;
}

@media (max-width: 767px) {
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

.record-item.start .record-dot {
  background: #409eff;
}

.record-item.end .record-dot {
  background: #67c23a;
}

.record-content {
  font-size: var(--font-size-xs);
}

@media (max-width: 767px) {
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

.record-name {
  color: #409eff;
  font-size: 11px;
  margin-top: 2px;
}

.map-wrap {
  flex: 1;
  position: relative;
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

@media (max-width: 767px) {
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
</style>
