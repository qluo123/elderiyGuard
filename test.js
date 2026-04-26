// 简化的坐标转换测试

function wgs84ToGcj02(lng, lat) {
  const a = 6378245.0;
  const ee = 0.006693421622965947;
  const pi = 3.1415926535897932384626;

  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);

  const radLat = lat / 180.0 * pi;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);

  dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * pi);
  dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * pi);

  const mgLat = lat + dLat;
  const mgLng = lng + dLng;

  if (lat < 72.004 && lat >= 0 && lng < 180.0 && lng >= 0) {
    return [mgLng, mgLat];
  }
  return [lng, lat];
}

function transformLat(x, y) {
  const pi = 3.1415926535897932384626;
  let ret = -100.0 + 2.0 * x + 3.0 * y;
  ret += 0.2 * y * y + 0.1 * x * y;
  ret += 0.2 * Math.sqrt(Math.abs(x));
  ret += (2.0 * Math.sin(x * 6.0 * pi) + 2.0 * Math.sin(x * 2.0 * pi)) * 2.0 / 3.0;
  ret += (2.0 * Math.sin(y * 6.0 * pi) + 2.0 * Math.sin(y * 2.0 * pi)) * 2.0 / 3.0;
  ret += (2.0 * Math.sin(x * 16.0 * pi) + 2.0 * Math.sin(x * 8.0 * pi)) * 2.0 / 3.0;
  ret += (2.0 * Math.sin(y * 16.0 * pi) + 2.0 * Math.sin(y * 8.0 * pi)) * 2.0 / 3.0;
  return ret;
}

function transformLng(x, y) {
  const pi = 3.1415926535897932384626;
  let ret = 300.0 + x + 2.0 * y;
  ret += 0.1 * x * x + 0.1 * x * y;
  ret += 0.1 * Math.sqrt(Math.abs(x));
  ret += (2.0 * Math.sin(x * 6.0 * pi) + 2.0 * Math.sin(x * 2.0 * pi)) * 2.0 / 3.0;
  ret += (2.0 * Math.sin(x * 16.0 * pi) + 2.0 * Math.sin(x * 8.0 * pi)) * 2.0 / 3.0;
  ret += (2.0 * Math.sin(y * 16.0 * pi) + 2.0 * Math.sin(y * 8.0 * pi)) * 2.0 / 3.0;
  return ret;
}

// 测试点
const testPoint = { lng: 120.121754, lat: 36.007915 };
const result = wgs84ToGcj02(testPoint.lng, testPoint.lat);
console.log('原始坐标:', testPoint);
console.log('转换后坐标:', result);
console.log('经度差:', result[0] - testPoint.lng);
console.log('纬度差:', result[1] - testPoint.lat);