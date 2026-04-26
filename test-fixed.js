// 测试修复后的坐标转换函数

function wgs84ToGcj02(lng, lat) {
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

  return [mgLng, mgLat]
}

function outOfChina(lng, lat) {
  return !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55)
}

function transformLat(x, y) {
  const pi = 3.1415926535897932384626
  let ret = -100.0 + 2.0 * x + 3.0 * y
  ret += 0.2 * y * y + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  ret += (20.0 * Math.sin(6.0 * x * pi) + 20.0 * Math.sin(2.0 * x * pi)) * 2.0 / 3.0
  ret += (20.0 * Math.sin(y * pi) + 40.0 * Math.sin(y / 3.0 * pi)) * 2.0 / 3.0
  ret += (150.0 * Math.sin(y / 12.0 * pi) + 300.0 * Math.sin(y / 30.0 * pi)) * 2.0 / 3.0
  return ret
}

function transformLng(x, y) {
  const pi = 3.1415926535897932384626
  let ret = 300.0 + x + 2.0 * y
  ret += 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  ret += (20.0 * Math.sin(6.0 * x * pi) + 20.0 * Math.sin(2.0 * x * pi)) * 2.0 / 3.0
  ret += (20.0 * Math.sin(x * pi) + 40.0 * Math.sin(x / 3.0 * pi)) * 2.0 / 3.0
  ret += (150.0 * Math.sin(x / 12.0 * pi) + 300.0 * Math.sin(x / 30.0 * pi)) * 2.0 / 3.0
  return ret
}

// 测试点：青岛地区坐标
const testPoint = { lng: 120.121754, lat: 36.007915 };
const result = wgs84ToGcj02(testPoint.lng, testPoint.lat);
console.log('原始坐标:', testPoint);
console.log('转换后坐标:', result);
console.log('经度差:', (result[0] - testPoint.lng).toFixed(6));
console.log('纬度差:', (result[1] - testPoint.lat).toFixed(6));

// 测试北京天安门
const tiananmen = { lng: 116.404, lat: 39.915 };
const tiananmenResult = wgs84ToGcj02(tiananmen.lng, tiananmen.lat);
console.log('\n天安门原始坐标:', tiananmen);
console.log('天安门转换后坐标:', tiananmenResult);
console.log('天安门经度差:', (tiananmenResult[0] - tiananmen.lng).toFixed(6));
console.log('天安门纬度差:', (tiananmenResult[1] - tiananmen.lat).toFixed(6));