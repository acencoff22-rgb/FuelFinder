/**
 * FuelFinder 실질 주유비 계산 엔진
 *
 * 계산 기준
 *
 * 1. 주유비
 *    = 리터당 가격 × 주유량
 *
 * 2. 왕복거리
 *    = 편도거리 × 2
 *
 * 3. 이동 연료량
 *    = 왕복거리 ÷ 차량 연비
 *
 * 4. 이동비
 *    = 이동 연료량 × 해당 주유소 가격
 *
 * 5. 할인
 *    = 결제수단 조건에 따른 할인액
 *
 * 6. 실질 총비용
 *    = 할인 적용 후 주유비 + 이동비
 *
 * 7. 실질가격
 *    = 실질 총비용 ÷ 주유량
 */

import { calculateDiscount } from "./discount.js";

export function calculateFuelCost({
  pricePerLiter,
  liters,
  distanceKm,
  fuelEfficiency,
  paymentOption = {
    type: "none",
  },
}) {
  validateNumber(
    pricePerLiter,
    "pricePerLiter"
  );

  validateNumber(
    liters,
    "liters"
  );

  validateNumber(
    distanceKm,
    "distanceKm"
  );

  validateNumber(
    fuelEfficiency,
    "fuelEfficiency"
  );

  if (pricePerLiter <= 0) {
    throw new Error(
      "유가는 0보다 커야 합니다."
    );
  }

  if (liters <= 0) {
    throw new Error(
      "주유량은 0보다 커야 합니다."
    );
  }

  if (distanceKm < 0) {
    throw new Error(
      "거리는 음수가 될 수 없습니다."
    );
  }

  if (fuelEfficiency <= 0) {
    throw new Error(
      "연비는 0보다 커야 합니다."
    );
  }

  // 실제 주유비
  const fuelCost =
    pricePerLiter * liters;

  // 주유소까지 왕복 거리
  const roundTripDistanceKm =
    distanceKm * 2;

  // 왕복 이동에 필요한 연료량
  const travelFuelLiters =
    roundTripDistanceKm /
    fuelEfficiency;

  // 왕복 이동에 드는 연료비
  // 현재 MVP 기준으로 해당 주유소 가격을 사용
  const travelCost =
    travelFuelLiters *
    pricePerLiter;

  // 결제 할인 계산
  // 할인은 주유비에만 적용
  const discountResult =
    calculateDiscount({
      fuelCost,
      paymentOption,
    });

  // 할인 적용 후 실제 주유비
  const discountedFuelCost =
    Math.max(
      0,
      fuelCost -
        discountResult.discountAmount
    );

  // 최종 실질 비용
  const totalCost =
    discountedFuelCost +
    travelCost;

  // 주유량 기준 환산
  const effectivePricePerLiter =
    totalCost / liters;

  return {
    fuelCost,

    discountAmount:
      discountResult.discountAmount,

    discountType:
      discountResult.type,

    discountRate:
      discountResult.rate,

    discountedFuelCost,

    roundTripDistanceKm,

    travelFuelLiters,

    travelCost,

    totalCost,

    effectivePricePerLiter,
  };
}

function validateNumber(
  value,
  name
) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    throw new Error(
      `${name}은 유효한 숫자여야 합니다.`
    );
  }
}