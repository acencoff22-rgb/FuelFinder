/**
 * FuelFinder 할인 계산 엔진
 *
 * 할인 계산은 주유소의 기본 주유비를 기준으로 합니다.
 *
 * 지원 방식
 * - none    : 할인 없음
 * - percent : 일정 비율 할인
 * - fixed   : 정액 할인
 *
 * 할인 대상 여부와 할인율/한도는
 * 결제수단 옵션에서 전달받습니다.
 */

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

    discountAmount =
      Math.min(
        discountAmount,
        maxDiscount
      );
  }

  discountAmount =
    Math.min(
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

  const discountAmount =
    Math.min(
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

function validateFuelCost(
  fuelCost
) {
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