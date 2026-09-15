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
 * 할인 조건(강릉페이 매칭 / 특정 정유사 브랜드)에 따라
 * 이 결제수단을 이 주유소에 실제로 적용할 수 있는지(eligible) 결정합니다.
 *
 * - requiresLocalPayMatch=true: station.localPayMatch.matchStatus가
 *   "matched"일 때만 적용. probable/possible 등은 잘못된 할인 계산을
 *   막기 위해 제외합니다.
 * - brandCode 지정(예: "SOL" = S-OIL): station.brandCode가 정확히
 *   같을 때만 적용.
 * - 두 조건은 동시에 걸 수 있고, 모두 만족해야 eligible=true입니다.
 * - 조건이 하나도 없으면 항상 eligible=true (기존 일반 할인과 동일).
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

  let eligible = true;

  if (
    paymentOption.requiresLocalPayMatch
  ) {
    const matchStatus =
      station?.localPayMatch?.matchStatus ??
      "unmatched";

    if (matchStatus !== "matched") {
      eligible = false;
    }
  }

  if (
    paymentOption.brandCode
  ) {
    const stationBrand =
      station?.brandCode || "";

    if (
      stationBrand !==
      paymentOption.brandCode
    ) {
      eligible = false;
    }
  }

  return {
    ...paymentOption,
    eligible,
  };
}

/**
 * 등록된 여러 할인 항목(discounts) 중, 이 주유소에 실제로
 * 적용 가능한 것들을 조건 검사한 뒤, 할인액이 가장 큰 것을 고릅니다.
 * 적용 가능한 게 없으면 할인 없음을 반환합니다.
 */
export function pickBestPaymentOption({
  station,
  discounts,
  liters,
}) {
  if (
    !Array.isArray(discounts) ||
    discounts.length === 0
  ) {
    return {
      type: "none",
    };
  }

  const pricePerLiter =
    Number(
      station?.pricePerLiter
    );

  if (
    !Number.isFinite(
      pricePerLiter
    ) ||
    pricePerLiter <= 0 ||
    !Number.isFinite(
      Number(liters)
    ) ||
    Number(liters) <= 0
  ) {
    return {
      type: "none",
    };
  }

  const fuelCost =
    pricePerLiter *
    Number(liters);

  let best = null;
  let bestAmount = 0;

  for (
    const discount of discounts
  ) {
    const resolved =
      resolveEffectivePaymentOption(
        {
          station,
          paymentOption:
            discount,
        }
      );

    if (
      resolved.type ===
        "none" ||
      resolved.eligible ===
        false
    ) {
      continue;
    }

    let discountResult;

    try {
      discountResult =
        calculateDiscount(
          {
            fuelCost,
            liters,
            paymentOption:
              resolved,
          }
        );
    } catch {
      continue;
    }

    if (
      discountResult.discountAmount >
      bestAmount
    ) {
      bestAmount =
        discountResult.discountAmount;

      best = {
        ...resolved,

        label:
          discount.label ||
          null,
      };
    }
  }

  return (
    best || {
      type: "none",
    }
  );
}

export function calculateDiscount({
  fuelCost,
  liters,
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

  if (type === "perLiter") {
    return calculatePerLiterDiscount({
      fuelCost,
      liters,
      rate,
    });
  }

  throw new Error(
    `지원하지 않는 할인 방식입니다: ${type}`
  );
}

function calculatePerLiterDiscount({
  fuelCost,
  liters,
  rate,
}) {
  if (
    typeof rate !== "number" ||
    !Number.isFinite(rate) ||
    rate < 0
  ) {
    throw new Error(
      "리터당 할인액이 올바르지 않습니다."
    );
  }

  if (
    typeof liters !== "number" ||
    !Number.isFinite(liters) ||
    liters <= 0
  ) {
    throw new Error(
      "리터당 할인을 계산하려면 주유량이 필요합니다."
    );
  }

  const discountAmount = Math.min(
    rate * liters,
    fuelCost
  );

  return createDiscountResult({
    discountAmount,
    type: "perLiter",
    rate,
  });
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
      liters,
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
