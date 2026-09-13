import proj4 from "proj4";

// 오피넷에서 사용하는 KATEC 좌표계
const KATEC =
  "+proj=tmerc " +
  "+lat_0=38 " +
  "+lon_0=128 " +
  "+k=0.9999 " +
  "+x_0=400000 " +
  "+y_0=600000 " +
  "+ellps=bessel " +
  "+towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43 " +
  "+units=m " +
  "+no_defs";

const WGS84 = "EPSG:4326";

/**
 * WGS84(위도/경도)를 KATEC(X/Y)로 변환합니다.
 */
export function wgs84ToKatec({
  latitude,
  longitude,
}) {
  validateLatitude(latitude);
  validateLongitude(longitude);

  const [x, y] = proj4(WGS84, KATEC, [
    longitude,
    latitude,
  ]);

  return {
    x,
    y,
  };
}

/**
 * KATEC(X/Y)를 WGS84(위도/경도)로 변환합니다.
 */
export function katecToWgs84({
  x,
  y,
}) {
  validateKatecCoordinate(x, "x");
  validateKatecCoordinate(y, "y");

  const [longitude, latitude] =
    proj4(KATEC, WGS84, [x, y]);

  return {
    latitude,
    longitude,
  };
}

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

function validateKatecCoordinate(
  value,
  name
) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    throw new Error(
      `${name}는 유효한 KATEC 좌표여야 합니다.`
    );
  }
}