/**
 * KATEC는 미터 단위 투영좌표이므로 두 점 사이의 검색 거리 계산에
 * 유클리드 거리를 사용할 수 있습니다.
 */
export function katecDistanceMeters(x1, y1, x2, y2) {
  return Math.hypot(
    Number(x2) - Number(x1),
    Number(y2) - Number(y1)
  );
}

/**
 * Opinet 5km 제한을 우회하기 위한 10km 확장 검색 중심점입니다.
 *
 * 중앙 1개 + 반경 7km의 7개 외곽 중심점을 사용합니다.
 * 7개 외곽점의 최대 각도 간격은 약 51.4도이며, 10km 원 경계에서
 * 가장 가까운 5km 검색원까지의 최대 거리는 약 4.79km이므로
 * 10km 검색영역 경계에 검색 공백이 생기지 않습니다.
 */
export function buildExtendedSearchCenters({
  x,
  y,
  offsetMeters = 7000,
  count = 7,
}) {
  const centerX = Number(x);
  const centerY = Number(y);

  if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
    throw new Error("확장 검색 중심 좌표가 올바르지 않습니다.");
  }

  if (!Number.isFinite(offsetMeters) || offsetMeters <= 0) {
    throw new Error("확장 검색 중심 간격이 올바르지 않습니다.");
  }

  if (!Number.isInteger(count) || count < 3) {
    throw new Error("확장 검색 중심 개수가 올바르지 않습니다.");
  }

  const centers = [{ x: centerX, y: centerY }];

  for (let index = 0; index < count; index += 1) {
    const angle = (index * 2 * Math.PI) / count;
    centers.push({
      x: centerX + Math.cos(angle) * offsetMeters,
      y: centerY + Math.sin(angle) * offsetMeters,
    });
  }

  return centers;
}
