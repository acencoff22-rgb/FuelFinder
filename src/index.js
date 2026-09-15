import { calculateFuelCost } from "./calculator.js";

import {
  resolveEffectivePaymentOption,
  pickBestPaymentOption,
} from "../public/shared/calc.js";

import {
  matchStationToLocalPay,
} from "./localpayMatcher.js";

import {
  createGangneungPayInfo,
} from "./gangneungPayStatus.js";

/**
 * 여러 주유소의 실질 비용을 계산하고
 * 실질가격이 낮은 순서로 정렬합니다.
 *
 * options
 * - liters
 * - fuelEfficiency
 * - paymentOption  (단일 할인 — 기존 방식, 하위 호환용)
 * - discounts      (여러 할인 등록 — 주유소마다 적용 가능한 것 중
 *                    가장 유리한 걸 자동 선택. 지정되면 paymentOption보다 우선)
 *
 * 지역화폐 옵션
 * - localPayMerchants
 *   : 한국조폐공사 지역화폐 가맹점 목록
 *
 * - localPayMatchOptions
 *   : 매칭 엔진 옵션
 *
 * discounts 항목 예시
 *
 * {
 *   label: "강릉페이",
 *   type: "percent",
 *   rate: 10,
 *   requiresLocalPayMatch: true
 * }
 * {
 *   label: "A카드",
 *   type: "perLiter",
 *   rate: 100,
 *   brandCode: "SOL"
 * }
 *
 * requiresLocalPayMatch=true이면 지역화폐 매칭 상태가
 * matched인 주유소에서만, brandCode가 있으면 그 주유소의
 * brandCode가 정확히 같을 때만 할인 적용이 됩니다.
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

  const discounts =
    Array.isArray(
      options.discounts
    ) &&
    options.discounts
      .length > 0
      ? options.discounts
      : null;

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
      /**
       * discounts(여러 할인 등록)가 있으면 그중 이 주유소에
       * 적용 가능한 것 중 가장 유리한 걸 자동으로 고릅니다.
       * 없으면 기존 방식대로 단일 paymentOption을 그대로 판단합니다.
       */
      const effectivePaymentOption =
        discounts
          ? pickBestPaymentOption(
              {
                station:
                  enrichedStation,
                discounts,
                liters:
                  options.liters,
              }
            )
          : resolveEffectivePaymentOption(
              {
                station:
                  enrichedStation,
                paymentOption,
              }
            );

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
      createGangneungPayInfo(
        matchResult
      ),
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