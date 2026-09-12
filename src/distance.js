/**
 * 두 좌표 사이의 직선거리를 계산합니다.
 *
 * 반환값은 km입니다.
 *
 * latitude  = 위도
 * longitude = 경도
 *
 * 계산 방식:
 * Haversine 공식
 */

export function calculateDistanceKm({
  latitude1,
  longitude1,
  latitude2,
  longitude2,
}) {
  validateCoordinate(latitude1, "latitude1", -90, 90);
  validateCoordinate(latitude2, "latitude2", -90, 90);
  validateCoordinate(longitude1, "longitude1", -180, 180);
  validateCoordinate(longitude2, "longitude2", -180, 180);

  const earthRadiusKm = 6371;

  const lat1 = toRadians(latitude1);
  const lat2 = toRadians(latitude2);

  const deltaLatitude =
    toRadians(latitude2 - latitude1);

  const deltaLongitude =
    toRadians(longitude2 - longitude1);

  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLongitude / 2) ** 2;

  const c =
    2 * Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return earthRadiusKm * c;
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function validateCoordinate(
  value,
  name,
  min,
  max
) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    throw new Error(
      `${name}은 유효한 숫자여야 합니다.`
    );
  }

  if (value < min || value > max) {
    throw new Error(
      `${name}의 범위가 올바르지 않습니다.`
    );
  }
}