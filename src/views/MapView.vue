<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { MapLocation, Timer, Place, ArrowLeft } from '@element-plus/icons-vue'
import type { DayTrajectory, ProcessedRecord } from '@/types/location'
import { fetchLocationData, processDeviceData, formatTime } from '@/services/dataService'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const route = useRoute()
const router = useRouter()

const mapContainer = ref<HTMLDivElement | null>(null)
const trajectoryDays = ref<DayTrajectory[]>([])
const selectedDay = ref<string>('')
const loading = ref(false)
const mapReady = ref(false)

let map: L.Map | null = null
let polyline: L.Polyline | null = null
let markers: L.Marker[] = []
let popup: L.Popup | null = null

const currentTrajectory = computed(() => {
  if (!selectedDay.value) return null
  return trajectoryDays.value.find(d => d.date === selectedDay.value) || null
})

const pathPoints = computed(() => {
  if (!currentTrajectory.value) return []
  return currentTrajectory.value.records.map(r => [r.lat, r.lng] as [number, number])
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
    const marker = L.marker([r.lat, r.lng], {
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

  addMarkers(currentTrajectory.value.records)

  const bounds = L.latLngBounds(points)
  map.fitBounds(bounds, { padding: [60, 60] })
}

function initMap() {
  if (!mapContainer.value) return
  map = L.map(mapContainer.value, {
    zoomControl: false,
  }).setView([36.007915, 120.121754], 14)

  // 国内地图瓦片源：高德地图（无需Key，仅用于瓦片显示）
  L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
    attribution: '&copy; 高德地图',
    subdomains: '1234',
    maxZoom: 18,
  }).addTo(map)

  // 添加比例尺控件
  L.control.scale({
    position: 'bottomright',
    metric: true,
    imperial: false,
  }).addTo(map)

  // 添加缩放控件到右上角
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
  <div class="map-page">
    <div class="sidebar">
      <div class="sidebar-header">
        <el-button text :icon="ArrowLeft" @click="$router.push('/')">返回首页</el-button>
        <h2><MapLocation style="width:20px;height:20px;vertical-align:middle;margin-right:6px;"/>轨迹回放</h2>
      </div>
      <div v-if="loading" class="loading-wrap">
        加载中...
      </div>
      <div v-else-if="trajectoryDays.length === 0" class="empty-wrap">
        <el-empty description="暂无轨迹数据" />
      </div>
      <div v-else class="day-list">
        <div
          v-for="day in trajectoryDays"
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
        <div class="record-list">
          <div
            v-for="(r, idx) in currentTrajectory.records"
            :key="r.id"
            class="record-item"
            :class="{ start: idx === 0, end: idx === currentTrajectory.records.length - 1 }"
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
}
.sidebar-header {
  padding: 16px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  flex-shrink: 0;
}
.sidebar-header h2 {
  margin: 12px 0 0;
  font-size: 18px;
  color: #303133;
}
.loading-wrap, .empty-wrap {
  padding: 40px;
  text-align: center;
  flex-shrink: 0;
}
.day-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}
.day-card {
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;
  cursor: pointer;
  transition: all 0.2s;
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
.day-title {
  font-weight: 600;
  color: #303133;
  margin-bottom: 6px;
}
.day-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #606266;
}
.time-range {
  display: flex;
  align-items: center;
  gap: 4px;
}
.detail-panel {
  flex-shrink: 0;
  max-height: 40vh;
  overflow-y: auto;
  padding: 16px;
  background: #fff;
  border-top: 1px solid #e4e7ed;
}
.detail-panel h4 {
  margin: 0 0 12px;
  font-size: 14px;
  color: #303133;
}
.record-list {
  padding-left: 8px;
}
.record-item {
  display: flex;
  align-items: flex-start;
  padding: 8px 0;
  border-left: 2px solid #dcdfe6;
  padding-left: 12px;
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
  top: 12px;
}
.record-item.start .record-dot {
  background: #409eff;
}
.record-item.end .record-dot {
  background: #67c23a;
}
.record-content {
  font-size: 13px;
}
.record-time {
  font-weight: 500;
  color: #303133;
}
.record-coords {
  color: #606266;
  font-size: 12px;
  margin-top: 2px;
}
.record-name {
  color: #409eff;
  font-size: 12px;
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
</style>
