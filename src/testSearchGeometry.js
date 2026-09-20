import {
  buildExtendedSearchCenters,
  katecDistanceMeters,
} from "./searchGeometry.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  const radius = 10000;
  const centerRadius = 5000;
  const centers = buildExtendedSearchCenters({
    x: 0,
    y: 0,
    offsetMeters: 7000,
    count: 7,
  });

  assert(centers.length === 8, "중심점은 중앙 1개 + 외곽 7개여야 합니다.");

  let maxNearestDistance = 0;
  const sampleCount = 1440;

  for (let index = 0; index < sampleCount; index += 1) {
    const angle = (index * 2 * Math.PI) / sampleCount;
    const point = {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };

    const nearest = Math.min(
      ...centers.map((center) =>
        katecDistanceMeters(point.x, point.y, center.x, center.y)
      )
    );

    maxNearestDistance = Math.max(maxNearestDistance, nearest);
  }

  assert(
    maxNearestDistance <= centerRadius,
    `10km 경계에 5km 검색 공백이 있습니다: 최대 ${maxNearestDistance.toFixed(2)}m`
  );

  console.log(
    `PASS: 10km 확장 검색 기하 검증 · 최대 최근접 거리 ${maxNearestDistance.toFixed(2)}m <= ${centerRadius}m`
  );
}

main();
