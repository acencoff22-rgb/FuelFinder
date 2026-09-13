import {
  getGangneungGasStations,
} from "./localpay.js";

import {
  mapLocalPayMerchants,
} from "./localpayMapper.js";

import {
  compareStations,
} from "../index.js";

async function main() {
  console.log(
    "===== FuelFinder 주유소 + 강릉페이 통합 테스트 ====="
  );

  console.log("");

  try {
    /**
     * -----------------------------------------
     * 1. 강릉페이 가맹점 전체 조회
     * -----------------------------------------
     */

    const firstPage =
      await getGangneungGasStations({
        page: 1,
        perPage: 100,
      });

    const totalCount =
      Number(
        firstPage.matchCount
      );

    const perPage = 100;

    const totalPages =
      Number.isFinite(
        totalCount
      ) &&
      totalCount > 0
        ? Math.ceil(
            totalCount /
              perPage
          )
        : 1;

    const merchants = [];

    for (
      let page = 1;
      page <= totalPages;
      page++
    ) {
      const rawData =
        page === 1
          ? firstPage
          : await getGangneungGasStations({
              page,
              perPage,
            });

      const pageMerchants =
        mapLocalPayMerchants(
          rawData
        );

      merchants.push(
        ...pageMerchants
      );
    }

    console.log(
      `강릉페이 연료 소매업 데이터: ${merchants.length}건`
    );

    console.log("");

    /**
     * -----------------------------------------
     * 2. 테스트 오피넷 주유소
     * -----------------------------------------
     */

    const stations = [
      {
        id:
          "TEST_SK_GYODONG",

        name:
          "SK교동주유소",

        pricePerLiter:
          1699,

        address:
          "강원 강릉시 하슬라로 159",

        oldAddress:
          "",

        latitude:
          37.7643584,

        longitude:
          128.8744705,

        distanceKm:
          1.2,
      },
    ];

    /**
     * -----------------------------------------
     * 3. 강릉페이 미적용 비교
     * -----------------------------------------
     */

    console.log(
      "===== 강릉페이 미적용 ====="
    );

    const normalResult =
      compareStations(
        stations,
        {
          liters: 40,

          fuelEfficiency: 12,

          paymentOption: {
            type: "none",
          },

          localPayMerchants:
            merchants,
        }
      );

    printResult(
      normalResult
    );

    console.log("");

    /**
     * -----------------------------------------
     * 4. 강릉페이 5% 할인 가정
     *
     * 주의:
     * 실제 강릉페이 할인율을 확정하는
     * 용도가 아닙니다.
     *
     * 매칭 결과에 따라 할인 연결이
     * 제대로 작동하는지만 테스트합니다.
     * -----------------------------------------
     */

    console.log(
      "===== 강릉페이 할인 연동 테스트 ====="
    );

    const localPayResult =
      compareStations(
        stations,
        {
          liters: 40,

          fuelEfficiency: 12,

          paymentOption: {
            type: "percent",

            rate: 5,

            maxDiscount:
              null,

            requiresLocalPayMatch:
              true,
          },

          localPayMerchants:
            merchants,
        }
      );

    printResult(
      localPayResult
    );

    console.log("");

    console.log(
      "===== 테스트 완료 ====="
    );
  } catch (error) {
    console.error("");
    console.error(
      "주유소 + 강릉페이 통합 테스트 실패"
    );

    console.error(
      error.message
    );

    console.error("");

    process.exitCode = 1;
  }
}

function printResult(
  results
) {
  if (
    !Array.isArray(results) ||
    results.length === 0
  ) {
    console.log(
      "계산 결과가 없습니다."
    );

    return;
  }

  results.forEach(
    (station, index) => {
      console.log(
        `[${index + 1}] ${station.name}`
      );

      console.log(
        `  주유가격: ${formatWon(station.pricePerLiter)}원/L`
      );

      console.log(
        `  기본 주유비: ${formatWon(station.fuelCost)}원`
      );

      console.log(
        `  할인액: ${formatWon(station.discountAmount)}원`
      );

      console.log(
        `  이동비: ${formatWon(station.travelCost)}원`
      );

      console.log(
        `  총비용: ${formatWon(station.totalCost)}원`
      );

      console.log(
        `  실질가격: ${formatWon(station.effectivePricePerLiter)}원/L`
      );

      console.log("");

      console.log(
        `  강릉페이 상태: ${station.gangneungPay?.status ?? "-"}`
      );

      console.log(
        `  매칭 신뢰도: ${station.gangneungPay?.confidence ?? 0}점`
      );

      console.log(
        `  매칭 가맹점: ${station.gangneungPay?.merchant?.name ?? "-"}`
      );

      console.log(
        `  가맹점 기준일자: ${station.gangneungPay?.dataDate ?? "-"}`
      );

      console.log(
        `  적용 결제수단: ${station.appliedPaymentOption?.type ?? "-"}`
      );

      console.log("");
    }
  );
}

function formatWon(
  value
) {
  if (
    typeof value !==
      "number" ||
    !Number.isFinite(value)
  ) {
    return "-";
  }

  return Math.round(
    value
  ).toLocaleString(
    "ko-KR"
  );
}

main();