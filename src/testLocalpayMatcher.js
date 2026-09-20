import {
  matchStationToLocalPay,
} from "./localpayMatcher.js";

import {
  getGangneungPayGasStations,
} from "./gangneungPayStations.js";

async function main() {
  console.log(
    "===== FuelFinder 공식 강릉페이 매칭 검증 ====="
  );

  console.log("");

  const merchants =
    getGangneungPayGasStations();

  console.log(
    `공식 가맹 일반 주유소: ${merchants.length}건`
  );

  console.log("");

  /**
   * -----------------------------------------
   * 테스트 1
   *
   * 공식 명단:
   * 쌍둥이주유소
   * -----------------------------------------
   */
  const twinStation = {
    id:
      "TEST_TWIN",

    name:
      "쌍둥이주유소",

    phone:
      "0336416765",

    address:
      "강원 강릉시 범일로 596",

    oldAddress:
      "",

    latitude:
      37.7408126,

    longitude:
      128.8805153,

    pricePerLiter:
      1699,

    distanceKm:
      1.4,
  };

  console.log(
    "===== 테스트 1: 쌍둥이주유소 ====="
  );

  const twinResult =
    matchStationToLocalPay(
      twinStation,
      merchants
    );

  printResult(
    twinResult
  );

  console.log("");

  /**
   * -----------------------------------------
   * 테스트 2
   *
   * 공식 명단에 없는
   * SK교동주유소
   * -----------------------------------------
   */
  const skStation = {
    id:
      "TEST_SK_GYODONG",

    name:
      "SK교동주유소",

    phone:
      "",

    address:
      "강원 강릉시 하슬라로 159",

    oldAddress:
      "",

    latitude:
      37.7643584,

    longitude:
      128.8744705,

    pricePerLiter:
      1699,

    distanceKm:
      1.2,
  };

  console.log(
    "===== 테스트 2: SK교동주유소 ====="
  );

  const skResult =
    matchStationToLocalPay(
      skStation,
      merchants
    );

  printResult(
    skResult
  );

  console.log("");

  /**
   * -----------------------------------------
   * 테스트 3
   *
   * 공식 명단:
   * 사임당주유소
   * -----------------------------------------
   */
  const saimdangStation = {
    id:
      "TEST_SAIMDANG",

    name:
      "사임당주유소",

    phone:
      "0336434249",

    address:
      "강원 강릉시 사임당로",

    oldAddress:
      "",

    latitude:
      null,

    longitude:
      null,

    pricePerLiter:
      1699,

    distanceKm:
      2.0,
  };

  console.log(
    "===== 테스트 3: 사임당주유소 ====="
  );

  const saimdangResult =
    matchStationToLocalPay(
      saimdangStation,
      merchants
    );

  printResult(
    saimdangResult
  );

  console.log("");

  /**
   * -----------------------------------------
   * 테스트 4
   *
   * 실제 오피넷에서 확인한 이름
   *
   * 홍길동주유소 ㈜에스제이와이에너지
   *
   * 공식 강릉페이 명단:
   *
   * (주)에스제이와이에너지홍길동주유소
   * -----------------------------------------
   */
  const honggildongStation = {
    id:
      "TEST_HONGGILDONG",

    name:
      "홍길동주유소 ㈜에스제이와이에너지",

    phone:
      "",

    address:
      "",

    oldAddress:
      "",

    latitude:
      37.757481852196086,

    longitude:
      128.88828128222673,

    pricePerLiter:
      1699,

    distanceKm:
      1.5,
  };

  console.log(
    "===== 테스트 4: 홍길동주유소 ====="
  );

  console.log(
    `오피넷 실제 명칭: ${honggildongStation.name}`
  );

  console.log(
    "공식 명칭: 홍길동주유소"
  );

  console.log("");

  const honggildongResult =
    matchStationToLocalPay(
      honggildongStation,
      merchants
    );

  printResult(
    honggildongResult
  );

  console.log("");

  console.log(
    "===== 홍길동 테스트 판정 ====="
  );

  /**
   * 이 케이스는 주소/전화가 전혀 없는 상태에서 "이름만" 근거로
   * 확정 매칭(matched)을 기대하면 안 됩니다.
   *
   * matchStationToLocalPay()는 의도적으로 이름만 일치하는 경우
   * 자동 할인 적용을 하지 않도록 설계되어 있습니다
   * (src/localpayMatcher.js의 "주소가 없고 이름만 유일하게 일치 /
   * 자동 할인 적용은 하지 않는다" 분기 참고).
   *
   * 그래서 이 테스트가 확인해야 하는 것은
   * "matched로 확정됐는가"가 아니라
   * "확정은 보류하되(needs_confirmation), 사람이 검토할 수 있도록
   *  올바른 후보(홍길동주유소)를 정확히 짚어냈는가"입니다.
   */
  if (
    honggildongResult.matchStatus ===
      "needs_confirmation" &&
    honggildongResult.reviewType ===
      "name-only" &&
    honggildongResult.merchant
      ?.name ===
      "홍길동주유소"
  ) {
    console.log(
      "PASS: 주소 정보가 없어 자동 확정은 보류했지만, 사람이 검토할 정확한 후보(홍길동주유소)를 짚어냈습니다."
    );
  } else {
    console.log(
      "FAIL: 이름만으로 유일하게 일치하는 홍길동주유소를 검토 대상 후보로 짚어내지 못했습니다."
    );
  }

  console.log("");

  console.log(
    "===== 테스트 완료 ====="
  );
}

function printResult(
  result
) {
  console.log(
    `상태: ${result.matchStatus}`
  );

  console.log(
    `신뢰도: ${result.confidence}점`
  );

  console.log(
    `이름 점수: ${result.nameScore}`
  );

  console.log(
    `주소 점수: ${result.addressScore}`
  );

  console.log(
    `전화 점수: ${result.phoneScore}`
  );

  console.log(
    `이유: ${result.reason}`
  );

  console.log("");

  if (
    result.merchant
  ) {
    console.log(
      "매칭된 공식 가맹점:"
    );

    console.log(
      `  이름: ${result.merchant.name}`
    );

    console.log(
      `  주소: ${result.merchant.address}`
    );

    console.log(
      `  전화: ${result.merchant.phone}`
    );

    console.log(
      `  유형: ${result.merchant.type}`
    );
  } else {
    console.log(
      "확정 매칭된 공식 가맹점 없음"
    );
  }

  console.log("");

  console.log(
    "상위 후보:"
  );

  result.candidates
    .slice(0, 5)
    .forEach(
      (
        candidate,
        index
      ) => {
        console.log(
          `[${index + 1}] ${candidate.merchant.name}`
        );

        console.log(
          `  점수: ${candidate.score}`
        );

        console.log(
          `  이름: ${candidate.nameScore}`
        );

        console.log(
          `  주소: ${candidate.addressScore}`
        );

        console.log("");
      }
    );
}

main();