import {
  getGangneungMerchants,
} from "./localpay.js";

import {
  mapLocalPayMerchants,
} from "./localpayMapper.js";

async function main() {
  console.log(
    "===== FuelFinder 한국조폐공사 API 테스트 ====="
  );

  console.log("");

  console.log(
    "조회 지역: 강릉시"
  );

  console.log(
    "사용처지역코드: 51150"
  );

  console.log("");

  try {
    const rawData =
      await getGangneungMerchants({
        page: 1,
        perPage: 20,
      });

    console.log(
      "===== API 응답 기본 정보 ====="
    );

    console.log(
      `페이지: ${rawData.page ?? "-"}`
    );

    console.log(
      `페이지당 결과: ${rawData.perPage ?? "-"}`
    );

    console.log(
      `현재 결과 수: ${rawData.currentCount ?? "-"}`
    );

    console.log(
      `검색 결과 수: ${rawData.matchCount ?? "-"}`
    );

    console.log(
      `전체 결과 수: ${rawData.totalCount ?? "-"}`
    );

    console.log("");

    const merchants =
      mapLocalPayMerchants(
        rawData
      );

    console.log(
      `변환된 가맹점 수: ${merchants.length}`
    );

    console.log("");

    console.log(
      "===== 가맹점 샘플 ====="
    );

    merchants.forEach(
      (merchant, index) => {
        console.log(
          `[${index + 1}] ${merchant.name}`
        );

        console.log(
          `  주소: ${merchant.address}`
        );

        if (merchant.detailAddress) {
          console.log(
            `  상세주소: ${merchant.detailAddress}`
          );
        }

        console.log(
          `  전화: ${merchant.phone || "-"}`
        );

        console.log(
          `  좌표: ${merchant.latitude ?? "-"}, ${merchant.longitude ?? "-"}`
        );

        console.log(
          `  업종: ${merchant.industryName || "-"} (${merchant.industryCode || "-"})`
        );

        console.log(
          `  사업자상태: ${merchant.businessStatusName || "-"}`
        );

        console.log(
          `  제공기관: ${merchant.providerCode || "-"}`
        );

        console.log(
          `  기준일자: ${merchant.referenceDate || "-"}`
        );

        console.log("");
      }
    );

    console.log(
      "===== 테스트 완료 ====="
    );
  } catch (error) {
    console.error("");
    console.error(
      "한국조폐공사 API 테스트 실패"
    );

    console.error(
      error.message
    );

    console.error("");

    process.exitCode = 1;
  }
}

main();