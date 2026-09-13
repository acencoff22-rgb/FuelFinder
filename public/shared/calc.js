/**
 * FuelFinder 실질 주유비 계산 엔진 (공유 모듈)
 *
 * 서버(src/calculator.js, src/discount.js, src/index.js)와
 * 브라우저(public/index.html)가 동일한 파일을 import합니다.
 * 계산 공식이 두 곳에서 따로 구현되어 서로 어긋나는 것을 막기 위한
 * 단일 진실 공급원(single source of truth)입니다.
 *
 * 이 파일은 순수 ES 모듈로만 유지해야 합니다.
 * Node 전용 API(process, fs 등)나 브라우저 전용 API(window, document 등)를
 * 사용하면 한쪽 환경에서 깨지므로 절대 추가하지 마세요.
 *
 * 계산 기준
 * 1. 주유비        = 리터당 가격 × 주유량
 * 2. 왕복거리      = 편도거리 × 2
 * 3. 이동 연료량   = 왕복거리 ÷ 차량 연비
 * 4. 이동비        = 이동 연료량 × 해당 주유소 가격
 * 5. 할인          = 결제수단 조건에 따른 할인액 (주유비에만 적용)
 * 6. 실질 총비용   = 할인 적용 후 주유비 + 이동비
 * 7. 실질가격      = 실질 총비용 ÷ 주유량
 */

/**
 * 지역화폐 연동 할인의 최종 적용 여부(eligible)를 결정합니다.
 *
 * 일반 할인(requiresLocalPayMatch가 없거나 false):
 *   paymentOption을 그대로 통과시킵니다.
 *
 * 지역화폐 연동 할인(requiresLocalPayMatch=true):
 *   station.localPayMatch.matchStatus가 "matched"일 때만
 *   eligible=true로 확정합니다. probable/possible 등은
 *   잘못된 할인 계산을 막기 위해 제외합니다.
 */
export function resolveEffectivePaymentOption({
  station,
  paymentOption,
}) {
  if (
    !paymentOption ||
    paymentOption.type === "none"
  ) {
    return {
      type: "none",
    };
  }

  if (!paymentOption.requiresLocalPayMatch) {
    return {
      ...paymentOption,
    };
  }

  const matchStatus =
    station?.localPayMatch?.matchStatus ??
    "unmatched";

  const eligible =
    matchStatus === "matched";

  return {
    ...paymentOption,
    eligible,
  };
}

export function calculateDiscount({
  fuelCost,
  paymentOption,
}) {
  validateFuelCost(fuelCost);

  if (!paymentOption) {
    return createNoDiscountResult();
  }

  const {
    type = "none",
    eligible = true,
    rate = 0,
    amount = 0,
    maxDiscount = null,
  } = paymentOption;

  if (!eligible) {
    return createNoDiscountResult();
  }

  if (type === "none") {
    return createNoDiscountResult();
  }

  if (type === "percent") {
    return calculatePercentDiscount({
      fuelCost,
      rate,
      maxDiscount,
    });
  }

  if (type === "fixed") {
    return calculateFixedDiscount({
      fuelCost,
      amount,
    });
  }

  throw new Error(
    `지원하지 않는 할인 방식입니다: ${type}`
  );
}

function calculatePercentDiscount({
  fuelCost,
  rate,
  maxDiscount,
}) {
  if (
    typeof rate !== "number" ||
    !Number.isFinite(rate) ||
    rate < 0 ||
    rate > 100
  ) {
    throw new Error(
      "할인율은 0 이상 100 이하의 숫자여야 합니다."
    );
  }

  let discountAmount =
    fuelCost * (rate / 100);

  if (
    maxDiscount !== null &&
    maxDiscount !== undefined
  ) {
    if (
      typeof maxDiscount !== "number" ||
      !Number.isFinite(maxDiscount) ||
      maxDiscount < 0
    ) {
      throw new Error(
        "최대 할인액이 올바르지 않습니다."
      );
    }

    discountAmount = Math.min(
      discountAmount,
      maxDiscount
    );
  }

  discountAmount = Math.min(
    discountAmount,
    fuelCost
  );

  return createDiscountResult({
    discountAmount,
    type: "percent",
    rate,
  });
}

function calculateFixedDiscount({
  fuelCost,
  amount,
}) {
  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount < 0
  ) {
    throw new Error(
      "정액 할인액이 올바르지 않습니다."
    );
  }

  const discountAmount = Math.min(
    amount,
    fuelCost
  );

  return createDiscountResult({
    discountAmount,
    type: "fixed",
    rate: null,
  });
}

function createDiscountResult({
  discountAmount,
  type,
  rate,
}) {
  return {
    discountAmount,
    type,
    rate,
  };
}

function createNoDiscountResult() {
  return {
    discountAmount: 0,
    type: "none",
    rate: 0,
  };
}

function validateFuelCost(fuelCost) {
  if (
    typeof fuelCost !== "number" ||
    !Number.isFinite(fuelCost) ||
    fuelCost < 0
  ) {
    throw new Error(
      "주유비가 올바른 숫자가 아닙니다."
    );
  }
}

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
    roundTripDistanceKm / fuelEfficiency;

  // 왕복 이동에 드는 연료비
  // 현재 MVP 기준으로 해당 주유소 가격을 사용
  const travelCost =
    travelFuelLiters * pricePerLiter;

  // 결제 할인 계산 (할인은 주유비에만 적용)
  const discountResult =
    calculateDiscount({
      fuelCost,
      paymentOption,
    });

  // 할인 적용 후 실제 주유비
  const discountedFuelCost =
    Math.max(
      0,
      fuelCost - discountResult.discountAmount
    );

  // 최종 실질 비용
  const totalCost =
    discountedFuelCost + travelCost;

  // 주유량 기준 환산
  const effectivePricePerLiter =
    totalCost / liters;

  return {
    fuelCost,
    discountAmount: discountResult.discountAmount,
    discountType: discountResult.type,
    discountRate: discountResult.rate,
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
