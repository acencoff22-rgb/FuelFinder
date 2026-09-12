import { calculateFuelCost } from "./calculator.js";

import {
  matchStationToLocalPay,
} from "./localpayMatcher.js";

/**
 * 여러 주유소의 실질 비용을 계산하고
 * 실질가격이 낮은 순서로 정렬합니다.
 *
 * options
 * - liters
 * - fuelEfficiency
 * - paymentOption
 *
 * 지역화폐 옵션
 * - localPayMerchants
 *   : 한국조폐공사 지역화폐 가맹점 목록
 *
 * - localPayMatchOptions
 *   : 매칭 엔진 옵션
 *
 * paymentOption 예시
 *
 * {
 *   type: "percent",
 *   rate: 5,
 *   maxDiscount: 30000,
 *   requiresLocalPayMatch: true
 * }
 *
 * requiresLocalPayMatch=true이면
 * 지역화폐 매칭 상태가 matched인 주유소에서만
 * 할인 적용이 됩니다.
 */
export function compareStations(
  stations,
  options
) {
  if (!Array.isArray(stations)) {
    throw new Error(
      "주유소 목록은 배열이어야 합니다."
    );
  }

  if (stations.length === 0) {
    return [];
  }

  if (
    typeof options?.liters !==
      "number" ||
    typeof options?.fuelEfficiency !==
      "number"
  ) {
    throw new Error(
      "주유량과 차량 연비가 필요합니다."
    );
  }

  const paymentOption =
    options.paymentOption ?? {
      type: "none",
    };

  const localPayMerchants =
    Array.isArray(
      options.localPayMerchants
    )
      ? options.localPayMerchants
      : null;

  const localPayMatchOptions =
    options.localPayMatchOptions ??
    {};

  return stations
    .map((station) => {
      let enrichedStation =
        station;

      /**
       * 지역화폐 가맹점 데이터가 전달된 경우
       * 오피넷 주유소와 매칭합니다.
       */
      if (
        localPayMerchants
      ) {
        enrichedStation =
          attachLocalPayMatch({
            station,
            merchants:
              localPayMerchants,
            options:
              localPayMatchOptions,
          });
      }

      if (
        typeof enrichedStation.distanceKm !==
          "number" ||
        !Number.isFinite(
          enrichedStation.distanceKm
        )
      ) {
        return {
          ...enrichedStation,

          calculationAvailable:
            false,

          calculationError:
            "주유소까지의 거리를 확인할 수 없습니다.",
        };
      }

      /**
       * 지역화폐 전용 할인인 경우
       * 매칭 결과에 따라 실제 할인 적용 여부를 결정합니다.
       */
      const effectivePaymentOption =
        resolvePaymentOption({
          station:
            enrichedStation,
          paymentOption,
        });

      const result =
        calculateFuelCost({
          pricePerLiter:
            enrichedStation.pricePerLiter,

          liters:
            options.liters,

          distanceKm:
            enrichedStation.distanceKm,

          fuelEfficiency:
            options.fuelEfficiency,

          paymentOption:
            effectivePaymentOption,
        });

      return {
        ...enrichedStation,

        ...result,

        calculationAvailable:
          true,

        appliedPaymentOption:
          effectivePaymentOption,
      };
    })
    .filter(
      (station) =>
        station.calculationAvailable
    )
    .sort(
      (a, b) =>
        a.effectivePricePerLiter -
        b.effectivePricePerLiter
    );
}

/**
 * 오피넷 주유소에 지역화폐 매칭 결과를 붙입니다.
 */
function attachLocalPayMatch({
  station,
  merchants,
  options,
}) {
  /**
   * 좌표가 없는 주유소는
   * 매칭을 시도하지 않습니다.
   */
  if (
    !hasValidStationCoordinates(
      station
    )
  ) {
    return {
      ...station,

      localPayMatch: {
        matchStatus:
          "unmatched",

        confidence: 0,

        reason:
          "주유소 좌표가 없어 지역화폐 가맹점 매칭을 수행할 수 없습니다.",

        merchant:
          null,

        distanceMeters:
          null,

        nameScore:
          0,

        addressScore:
          0,

        candidates:
          [],
      },

      gangneungPay: {
        status:
          "unknown",

        confidence:
          0,

        merchant:
          null,

        reason:
          "주유소 좌표가 없어 지역화폐 가맹점 매칭을 수행할 수 없습니다.",
      },
    };
  }

  const matchResult =
    matchStationToLocalPay(
      station,
      merchants,
      options
    );

  return {
    ...station,

    localPayMatch:
      matchResult,

    gangneungPay:
      convertToGangneungPayStatus(
        matchResult
      ),
  };
}

/**
 * 매칭 결과를 앱에서 사용할
 * 강릉페이 상태로 변환합니다.
 *
 * 현재 데이터는 과거 기준일자가 존재하므로
 * matched라고 해서 '현재 사용 가능 확정'으로
 * 표현하지 않습니다.
 */
function convertToGangneungPayStatus(
  matchResult
) {
  if (
    !matchResult ||
    matchResult.matchStatus ===
      "unmatched"
  ) {
    return {
      status:
        "unavailable",

      confidence:
        0,

      merchant:
        null,

      reason:
        matchResult?.reason ??
        "지역화폐 가맹점 매칭 결과가 없습니다.",
    };
  }

  if (
    matchResult.matchStatus ===
    "matched"
  ) {
    return {
      status:
        "matched",

      confidence:
        matchResult.confidence,

      merchant:
        matchResult.merchant,

      reason:
        matchResult.reason,

      dataDate:
        matchResult.merchant
          ?.referenceDate ??
        null,
    };
  }

  if (
    matchResult.matchStatus ===
      "probable" ||
    matchResult.matchStatus ===
      "possible"
  ) {
    return {
      status:
        "needs_confirmation",

      confidence:
        matchResult.confidence,

      merchant:
        matchResult.merchant,

      reason:
        matchResult.reason,

      dataDate:
        matchResult.merchant
          ?.referenceDate ??
        null,
    };
  }

  return {
    status:
      "needs_confirmation",

    confidence:
      matchResult.confidence,

    merchant:
      matchResult.merchant,

    reason:
      matchResult.reason,

    dataDate:
      matchResult.merchant
        ?.referenceDate ??
      null,
  };
}

/**
 * 결제수단 옵션을 주유소별로 확정합니다.
 *
 * 일반 할인:
 *   기존 paymentOption 그대로 적용
 *
 * 지역화폐 연동 할인:
 *   requiresLocalPayMatch=true
 *   + matched
 *   → eligible=true
 *
 * 그 외:
 *   eligible=false
 */
function resolvePaymentOption({
  station,
  paymentOption,
}) {
  if (
    !paymentOption ||
    paymentOption.type ===
      "none"
  ) {
    return {
      type: "none",
    };
  }

  if (
    !paymentOption
      .requiresLocalPayMatch
  ) {
    return {
      ...paymentOption,
    };
  }

  const matchStatus =
    station
      .localPayMatch
      ?.matchStatus ??
    "unmatched";

  /**
   * 현재는 가장 확실한
   * matched만 할인 적용 대상입니다.
   *
   * probable/possible은
   * 잘못된 할인 계산을 막기 위해 제외합니다.
   */
  const eligible =
    matchStatus ===
    "matched";

  return {
    ...paymentOption,

    eligible,
  };
}

/**
 * 주유소 좌표 확인
 */
function hasValidStationCoordinates(
  station
) {
  return (
    typeof station?.latitude ===
      "number" &&
    Number.isFinite(
      station.latitude
    ) &&
    typeof station?.longitude ===
      "number" &&
    Number.isFinite(
      station.longitude
    )
  );
}