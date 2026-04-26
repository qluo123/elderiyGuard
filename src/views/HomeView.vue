<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  MapLocation,
  Timer,
  Place,
  TrendCharts,
  Calendar,
  ArrowRight,
  Location,
} from '@element-plus/icons-vue'
import type { DayTrajectory } from '@/types/location'
import { fetchLocationData, processDeviceData, formatTime } from '@/services/dataService'

const router = useRouter()

const trajectoryDays = ref<DayTrajectory[]>([])
const loading = ref(false)
const deviceId = ref('')

const totalPoints = ref(0)
const totalDays = ref(0)
const latestUpdate = ref('--')
const activeDays = ref(0)

async function loadData() {
  loading.value = true
  try {
    const data = await fetchLocationData()
    if (!data) {
      ElMessage.warning('未获取到轨迹数据，使用模拟数据展示')
      trajectoryDays.value = getMockData()
      deviceId.value = '模拟设备'
    } else {
      trajectoryDays.value = processDeviceData(data)
      deviceId.value = data.device_id
    }
    computeStats()
  } catch (e) {
    ElMessage.error('数据加载失败')
    trajectoryDays.value = getMockData()
    computeStats()
  } finally {
    loading.value = false
  }
}

function computeStats() {
  totalDays.value = trajectoryDays.value.length
  totalPoints.value = trajectoryDays.value.reduce((sum, d) => sum + d.pointCount, 0)
  activeDays.value = trajectoryDays.value.length
  if (trajectoryDays.value.length > 0 && trajectoryDays.value[0].records.length > 0) {
    const latest = trajectoryDays.value[0].records[trajectoryDays.value[0].records.length - 1]
    latestUpdate.value = formatTime(latest.time)
  }
}

function getMockData(): DayTrajectory[] {
  const now = Date.now()
  const records = []
  for (let i = 0; i < 30; i++) {
    const t = now - i * 2 * 60 * 60 * 1000
    records.push({
      lat: 36.007915 + Math.sin(i * 0.3) * 0.008,
      lng: 120.121754 + Math.cos(i * 0.3) * 0.008,
      time: t,
      name: i === 0 ? '家' : i === 29 ? '医院' : '',
      id: `mock-${i}`,
      formattedTime: formatTime(t),
      date: new Date(t).toISOString().slice(0, 10),
      timeStr: new Date(t).toTimeString().slice(0, 5),
    })
  }
  const map = new Map<string, typeof records>()
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

function goToMap(day?: string) {
  if (day) {
    router.push({ path: '/map', query: { day } })
  } else {
    router.push('/map')
  }
}

onMounted(loadData)
</script>

<template>
  <div class="home-page">
    <div class="hero">
      <h1><Location style="width:28px;height:28px;vertical-align:middle;margin-right:10px;"/>老年人行动轨迹监护系统</h1>
      <p class="subtitle">实时追踪 · 安全守护 · 轨迹回放</p>
      <el-tag v-if="deviceId" type="success" size="large">设备 ID: {{ deviceId }}</el-tag>
    </div>

    <el-row :gutter="16" class="stats-row">
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover">
          <el-statistic title="总轨迹点" :value="totalPoints" />
          <TrendCharts class="stat-icon" />
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover">
          <el-statistic title="记录天数" :value="totalDays" />
          <Calendar class="stat-icon" />
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover">
          <el-statistic title="活跃天数" :value="activeDays" />
          <Timer class="stat-icon" />
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover">
          <el-statistic title="最新更新" :value="latestUpdate" />
          <Place class="stat-icon" />
        </el-card>
      </el-col>
    </el-row>

    <div class="section">
      <div class="section-header">
        <h2><MapLocation style="width:20px;height:20px;vertical-align:middle;margin-right:6px;"/>近期轨迹</h2>
        <el-button type="primary" :icon="MapLocation" @click="goToMap()">查看地图</el-button>
      </div>

      <div v-if="loading" class="loading-wrap">
        加载中...
      </div>
      <el-empty v-else-if="trajectoryDays.length === 0" description="暂无轨迹数据" />
      <el-row v-else :gutter="16">
        <el-col v-for="day in trajectoryDays.slice(0, 6)" :key="day.date" :xs="24" :sm="12" :md="8" class="day-col">
          <el-card shadow="hover" class="day-card" @click="goToMap(day.date)">
            <div class="day-header">
              <span class="day-date">{{ day.date }}</span>
              <el-tag size="small" type="primary">{{ day.pointCount }} 个点</el-tag>
            </div>
            <div class="day-body">
              <div class="time-range">
                <Timer style="width:14px;height:14px;" />
                <span>{{ day.startPoint.timeStr }} - {{ day.endPoint.timeStr }}</span>
              </div>
              <div class="coords">
                <Place style="width:14px;height:14px;" />
                <span>起点: {{ day.startPoint.lat.toFixed(4) }}, {{ day.startPoint.lng.toFixed(4) }}</span>
              </div>
              <div class="coords">
                <MapLocation style="width:14px;height:14px;" />
                <span>终点: {{ day.endPoint.lat.toFixed(4) }}, {{ day.endPoint.lng.toFixed(4) }}</span>
              </div>
            </div>
            <div class="day-footer">
              <el-button text type="primary" :icon="ArrowRight">查看详情</el-button>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <div v-if="trajectoryDays.length > 0" class="section">
      <div class="section-header">
        <h2><Timer style="width:20px;height:20px;vertical-align:middle;margin-right:6px;"/>最新轨迹时间线</h2>
      </div>
      <el-card>
        <div class="simple-timeline">
          <div v-for="day in trajectoryDays.slice(0, 5)" :key="day.date" class="timeline-row">
            <div class="timeline-dot"></div>
            <div class="timeline-content">
              <div class="timeline-date">{{ day.date }}</div>
              <div class="timeline-meta">
                <el-tag size="small">{{ day.pointCount }} 个轨迹点</el-tag>
                <span class="time-span">{{ day.startPoint.timeStr }} - {{ day.endPoint.timeStr }}</span>
                <el-button text type="primary" size="small" @click="goToMap(day.date)">查看地图</el-button>
              </div>
            </div>
          </div>
        </div>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.home-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--spacing-lg);
}

@media (max-width: 767px) {
  .home-page {
    padding: var(--spacing-md);
  }
}

.hero {
  text-align: center;
  padding: var(--spacing-xl) 0 var(--spacing-lg);
}

.hero h1 {
  font-size: var(--font-size-xl);
  color: #303133;
  margin: 0 0 var(--spacing-md);
  word-wrap: break-word;
}

@media (min-width: 1024px) {
  .hero h1 {
    font-size: var(--font-size-2xl);
  }
}

.subtitle {
  font-size: var(--font-size-base);
  color: #606266;
  margin: 0 0 var(--spacing-md);
}

@media (max-width: 767px) {
  .subtitle {
    font-size: var(--font-size-sm);
  }
}

.stats-row {
  margin-bottom: var(--spacing-xl);
}

@media (max-width: 767px) {
  .stats-row {
    margin-bottom: var(--spacing-lg);
  }
}

.stats-row :deep(.el-card) {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-md);
}

.stat-icon {
  position: absolute;
  right: 16px;
  bottom: 16px;
  width: 40px;
  height: 40px;
  color: #e4e7ed;
}

@media (max-width: 767px) {
  .stat-icon {
    width: 32px;
    height: 32px;
    right: 12px;
    bottom: 12px;
  }
}

.section {
  margin-bottom: var(--spacing-xl);
}

@media (max-width: 767px) {
  .section {
    margin-bottom: var(--spacing-lg);
  }
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-md);
  flex-wrap: wrap;
  gap: var(--spacing-sm);
}

.section-header h2 {
  margin: 0;
  font-size: var(--font-size-lg);
  color: #303133;
}

@media (max-width: 767px) {
  .section-header h2 {
    font-size: var(--font-size-base);
  }

  .section-header :deep(.el-button) {
    width: 100%;
  }
}

@media (min-width: 768px) and (max-width: 1023px) {
  .section-header :deep(.el-button) {
    padding: 8px 16px;
  }
}

.day-col {
  margin-bottom: var(--spacing-md);
}

.day-card {
  cursor: pointer;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
  border-radius: var(--radius-md);
}

.day-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md) !important;
}

.day-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-sm);
  flex-wrap: wrap;
  gap: var(--spacing-xs);
}

.day-date {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: #303133;
}

@media (max-width: 767px) {
  .day-date {
    font-size: var(--font-size-sm);
  }
}

.day-body {
  font-size: var(--font-size-sm);
  color: #606266;
  line-height: 1.6;
}

@media (max-width: 767px) {
  .day-body {
    font-size: var(--font-size-xs);
    line-height: 1.5;
  }
}

.day-body > div {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  margin-bottom: 4px;
}

.day-footer {
  margin-top: var(--spacing-sm);
  text-align: right;
}

@media (max-width: 767px) {
  .day-footer {
    margin-top: var(--spacing-xs);
  }
}

.simple-timeline {
  padding: var(--spacing-sm) 0;
}

.timeline-row {
  display: flex;
  align-items: flex-start;
  padding: var(--spacing-sm) 0;
  border-bottom: 1px solid #ebeef5;
}

.timeline-row:last-child {
  border-bottom: none;
}

@media (max-width: 767px) {
  .timeline-row {
    padding: var(--spacing-xs) 0;
  }
}

.timeline-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #409eff;
  margin-right: var(--spacing-sm);
  margin-top: 6px;
  flex-shrink: 0;
}

.timeline-content {
  flex: 1;
  min-width: 0;
}

.timeline-date {
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
  font-size: var(--font-size-sm);
}

@media (max-width: 767px) {
  .timeline-date {
    font-size: var(--font-size-xs);
  }
}

.timeline-meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

@media (max-width: 767px) {
  .timeline-meta {
    gap: var(--spacing-xs);
  }
}

.time-span {
  color: #606266;
  font-size: var(--font-size-xs);
}

.loading-wrap {
  padding: var(--spacing-2xl);
  text-align: center;
}

@media (max-width: 767px) {
  .loading-wrap {
    padding: var(--spacing-xl);
  }
}
</style>
