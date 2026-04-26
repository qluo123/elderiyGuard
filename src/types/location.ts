export interface LocationRecord {
  lat: number
  lng: number
  time: number
  name: string
}

export interface DeviceData {
  device_id: string
  records: LocationRecord[]
}

export interface ProcessedRecord extends LocationRecord {
  id: string
  formattedTime: string
  date: string
  timeStr: string
  address?: string
}

export interface DayTrajectory {
  date: string
  records: ProcessedRecord[]
  startPoint: ProcessedRecord
  endPoint: ProcessedRecord
  pointCount: number
}
