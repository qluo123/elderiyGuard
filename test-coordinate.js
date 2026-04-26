// 测试坐标转换函数

// 复制 wgs84ToGcj02 函数实现
function wgs84ToGcj02(lng: number, lat: number): [number, number] {
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

  if (lat < 72.004 && lat >= 0 && lng < 180.0 && lng >= 0) {
    return [mgLng, mgLat]
  }
  return [lng, lat]
}

function transformLat(x: number, y: number): number {
  const pi = 3.1415926535897932384626
  let ret = -100.0 + 2.0 * x + 3.0 * y
  ret += 0.2 * y * y + 0.1 * x * y
  ret += 0.2 * Math.sqrt(Math.abs(x))
  ret += (2.0 * Math.sin(x * 6.0 * pi) + 2.0 * Math.sin(x * 2.0 * pi)) * 2.0 / 3.0
  ret += (2.0 * Math.sin(y * 6.0 * pi) + 2.0 * Math.sin(y * 2.0 * pi)) * 2.0 / 3.0
  ret += (2.0 * Math.sin(x * 16.0 * pi) + 2.0 * Math.sin(x * 8.0 * pi)) * 2.0 / 3.0
  ret += (2.0 * Math.sin(y * 16.0 * pi) + 2.0 * Math.sin(y * 8.0 * pi)) * 2.0 / 3.0
  return ret
}

function transformLng(x: number, y: number): number {
  const pi = 3.1415926535897932384626
  let ret = 300.0 + x + 2.0 * y
  ret += 0.1 * x * x + 0.1 * x * y
  ret += 0.1 * Math.sqrt(Math.abs(x))
  ret += (2.0 * Math.sin(x * 6.0 * pi) + 2.0 * Math.sin(x * 2.0 * pi)) * 2.0 / 3.0
  ret += (2.0 * Math.sin(x * 16.0 * pi) + 2.0 * Math.sin(x * 8.0 * pi)) * 2.0 / 3.0
  ret += (2.0 * Math.sin(y * 16.0 * pi) + 2.0 * Math.sin(y * 8.0 * pi)) * 2.0 / 3.0
  return ret
}

// 测试已知坐标点
const testPoints = [
  { name: '北京天安门', wgs84: [116.404, 39.915], expectedGcj02: [116.410244, 39.916404] },
  { name: '上海外滩', wgs84: [121.491, 31.230], expectedGcj02: [121.497068, 31.233767] }
];

console.log('测试坐标转换结果:');
testPoints.forEach(point => {
  const gcj02 = wgs84ToGcj02(point.wgs84[0], point.wgs84[1]);
  console.log(`${point.name}:`);
  console.log(`  WGS84: [${point.wgs84[0].toFixed(6)}, ${point.wgs84[1].toFixed(6)}]`);
  console.log(`  转换后: [${gcj02[0].toFixed(6)}, ${gcj02[1].toFixed(6)}]`);
  console.log(`  预期值: [${point.expectedGcj02[0].toFixed(6)}, ${point.expectedGcj02[1].toFixed(6)}]`);
  console.log(`  经度误差: ${Math.abs(gcj02[0] - point.expectedGcj02[0]).toFixed(6)}`);
  console.log(`  纬度误差: ${Math.abs(gcj02[1] - point.expectedGcj02[1]).toFixed(6)}`);
  console.log('');
});

// 测试模拟数据中的坐标
console.log('测试模拟数据坐标:');
const mockPoints = [
  { lat: 36.007915, lng: 120.121754 },
  { lat: 36.007915 + Math.sin(1 * 0.3) * 0.005, lng: 120.121754 + Math.cos(1 * 0.3) * 0.005 }
];

mockPoints.forEach((point, index) => {
  const gcj02 = wgs84ToGcj02(point.lng, point.lat);
  console.log(`模拟点 ${index + 1}:`);
  console.log(`  WGS84: [${point.lng.toFixed(6)}, ${point.lat.toFixed(6)}]`);
  console.log(`  转换后: [${gcj02[0].toFixed(6)}, ${gcj02[1].toFixed(6)}]`);
  console.log('');
});