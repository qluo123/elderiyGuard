import axios from 'axios'
import type { DeviceData, LocationRecord, ProcessedRecord, DayTrajectory } from '@/types/location'

const GITEE_OWNER = import.meta.env.VITE_GITEE_OWNER || 'qxp792'
const GITEE_REPO = import.meta.env.VITE_GITEE_REPO || 'elderly-guard'
const GITEE_BRANCH = import.meta.env.VITE_GITEE_BRANCH || 'master'
const GITEE_DATA_DIR = import.meta.env.VITE_GITEE_DATA_DIR || 'location_data'
const GITEE_TOKEN = import.meta.env.VITE_GITEE_TOKEN || ''

const isDev = import.meta.env.DEV
const PROXY_PREFIX = '/api/gitee'

const GITEE_API_BASE = isDev
  ? `${PROXY_PREFIX}/api/v5/repos/${GITEE_OWNER}/${GITEE_REPO}/contents/${GITEE_DATA_DIR}`
  : `https://gitee.com/api/v5/repos/${GITEE_OWNER}/${GITEE_REPO}/contents/${GITEE_DATA_DIR}`

const GITEE_RAW_BASE = isDev
  ? `${PROXY_PREFIX}/${GITEE_OWNER}/${GITEE_REPO}/raw/${GITEE_BRANCH}/${GITEE_DATA_DIR}`
  : `https://gitee.com/${GITEE_OWNER}/${GITEE_REPO}/raw/${GITEE_BRANCH}/${GITEE_DATA_DIR}`

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (GITEE_TOKEN && GITEE_TOKEN !== 'YOUR_GITEE_TOKEN') {
    headers.Authorization = `token ${GITEE_TOKEN}`
  }
  return headers
}

function buildUrl(base: string, token?: string): string {
  if (!token || token === 'YOUR_GITEE_TOKEN') return base
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}access_token=${token}`
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${d} ${h}:${min}:${s}`
}

function getDateStr(timestamp: number): string {
  const date = new Date(timestamp)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getTimeStr(timestamp: number): string {
  const date = new Date(timestamp)
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${h}:${min}`
}

function processRecords(records: LocationRecord[]): ProcessedRecord[] {
  return records.map((r, idx) => ({
    ...r,
    id: `${r.time}-${idx}`,
    formattedTime: formatTime(r.time),
    date: getDateStr(r.time),
    timeStr: getTimeStr(r.time),
  }))
}

function groupByDay(records: ProcessedRecord[]): DayTrajectory[] {
  const map = new Map<string, ProcessedRecord[]>()
  for (const r of records) {
    if (!map.has(r.date)) map.set(r.date, [])
    map.get(r.date)!.push(r)
  }
  const days: DayTrajectory[] = []
  for (const [date, list] of map) {
    list.sort((a, b) => a.time - b.time)
    days.push({
      date,
      records: list,
      startPoint: list[0],
      endPoint: list[list.length - 1],
      pointCount: list.length,
    })
  }
  days.sort((a, b) => b.date.localeCompare(a.date))
  return days
}

async function fetchFileList(): Promise<string[]> {
  try {
    const url = buildUrl(GITEE_API_BASE, GITEE_TOKEN)
    const res = await axios.get(url, {
      timeout: 15000,
      headers: getAuthHeaders(),
    })
    if (Array.isArray(res.data)) {
      return res.data
        .filter((item: any) => item.type === 'file' && item.name.endsWith('.json'))
        .map((item: any) => item.name)
        .sort()
    }
    return []
  } catch {
    return []
  }
}

function decodeBase64Content(base64Str: string): string {
  try {
    return atob(base64Str)
  } catch {
    return ''
  }
}

async function fetchDayFile(filename: string): Promise<DeviceData | null> {
  try {
    const apiUrl = buildUrl(`${GITEE_API_BASE}/${filename}`, GITEE_TOKEN)
    const res = await axios.get(apiUrl, {
      timeout: 15000,
      headers: getAuthHeaders(),
    })
    const fileData = res.data
    if (fileData && fileData.content && fileData.encoding === 'base64') {
      const jsonStr = decodeBase64Content(fileData.content)
      if (jsonStr) {
        return JSON.parse(jsonStr) as DeviceData
      }
    }
    return null
  } catch {
    return null
  }
}

export async function fetchLocationData(): Promise<DeviceData | null> {
  const files = await fetchFileList()
  if (files.length === 0) {
    return null
  }

  const allRecords: LocationRecord[] = []
  let deviceId = ''

  for (const file of files) {
    const data = await fetchDayFile(file)
    if (data && data.records && Array.isArray(data.records)) {
      allRecords.push(...data.records)
      if (data.device_id) {
        deviceId = data.device_id
      }
    }
  }

  if (allRecords.length === 0) {
    return null
  }

  return {
    device_id: deviceId,
    records: allRecords,
  }
}

export function processDeviceData(data: DeviceData): DayTrajectory[] {
  const processed = processRecords(data.records)
  return groupByDay(processed)
}

export { formatTime, getDateStr, getTimeStr, wgs84ToGcj02 }

function wgs84ToGcj02(lng: number, lat: number): [number, number] {
  if (outOfChina(lng, lat)) {
    return [lng, lat]
  }
  
  const a = 6378245.0
  const ee = 0.006693421622965947
  const pi = 3.1415926535897932384626

  let dLat = transformLat(lng - 105.0, lat - 35.0)
  let dLng = transformLng(lng - 105.0, lat - 35.0)

  const radLat = lat / 180.0 * pi
  let magic = Math.sin(radLat)
  magic = 1 - ee * magic * magic
  const sqrtMagic = Math.sqrt(magic)

  dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * pi)
  dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * pi)

  const mgLat = lat + dLat
  const mgLng = lng + dLng

  // 调整坐标偏移，解决偏北问题
  const adjustedLat = mgLat - 0.0001
  
  return [mgLng, adjustedLat]
}

function outOfChina(lng: number, lat: number): boolean {
  return !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55)
}

function transformLat(x: number, y: number): number {
  const pi = 3.1415926535897932384626
  let ret = -100.0 + 2.0 * x + 3.0 * y
  ret += 0.2 * y * y + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  ret += (20.0 * Math.sin(6.0 * x * pi) + 20.0 * Math.sin(2.0 * x * pi)) * 2.0 / 3.0
  ret += (20.0 * Math.sin(y * pi) + 40.0 * Math.sin(y / 3.0 * pi)) * 2.0 / 3.0
  ret += (150.0 * Math.sin(y / 12.0 * pi) + 300.0 * Math.sin(y / 30.0 * pi)) * 2.0 / 3.0
  return ret
}

function transformLng(x: number, y: number): number {
  const pi = 3.1415926535897932384626
  let ret = 300.0 + x + 2.0 * y
  ret += 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  ret += (20.0 * Math.sin(6.0 * x * pi) + 20.0 * Math.sin(2.0 * x * pi)) * 2.0 / 3.0
  ret += (20.0 * Math.sin(x * pi) + 40.0 * Math.sin(x / 3.0 * pi)) * 2.0 / 3.0
  ret += (150.0 * Math.sin(x / 12.0 * pi) + 300.0 * Math.sin(x / 30.0 * pi)) * 2.0 / 3.0
  return ret
}
