/**
 * FuelFinder의 출발 위치를 표현하는 공통 데이터 구조입니다.
 *
 * 현재 위치(GPS)와 주소 검색 결과를
 * 동일한 형태로 다루기 위한 목적입니다.
 */

export function createLocation({
  latitude,
  longitude,
  address = "",
  source = "unknown",
}) {
  validateLatitude(latitude);
  validateLongitude(longitude);

  return {
    latitude,
    longitude,
    address,
    source,
  };
}

/**
 * 위도 검증
 */
function validateLatitude(latitude) {
  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude)
  ) {
    throw new Error(
      "latitude는 유효한 숫자여야 합니다."
    );
  }

  if (latitude < -90 || latitude > 90) {
    throw new Error(
      "latitude의 범위가 올바르지 않습니다."
    );
  }
}

/**
 * 경도 검증
 */
function validateLongitude(longitude) {
  if (
    typeof longitude !== "number" ||
    !Number.isFinite(longitude)
  ) {
    throw new Error(
      "longitude는 유효한 숫자여야 합니다."
    );
  }

  if (longitude < -180 || longitude > 180) {
    throw new Error(
      "longitude의 범위가 올바르지 않습니다."
    );
  }
}