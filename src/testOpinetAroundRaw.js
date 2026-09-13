import {
  getNearbyStations,
} from "./opinet.js";

import {
  wgs84ToKatec,
} from "./coordinate.js";

const TEST_LOCATION = {
  latitude:
    37.7408126,

  longitude:
    128.8805153,
};

async function main() {
  console.log(
    "===== 오피넷 aroundAll 원본 응답 확인 ====="
  );

  console.log(
    "1. 테스트 시작"
  );

  console.log(
    `2. 테스트 위치: ${TEST_LOCATION.latitude}, ${TEST_LOCATION.longitude}`
  );

  const katec =
    wgs84ToKatec(
      TEST_LOCATION
    );

  console.log(
    `3. KATEC 변환 완료: X=${katec.x}, Y=${katec.y}`
  );

  console.log(
    "4. 오피넷 API 호출 시작"
  );

  try {
    const data =
      await getNearbyStations({
        x:
          katec.x,

        y:
          katec.y,

        radius:
          5000,

        productCode:
          "B027",

        sort:
          1,
      });

    console.log(
      "5. 오피넷 API 응답 수신"
    );

    console.log("");

    console.log(
      "===== RESULT ====="
    );

    console.log(
      JSON.stringify(
        data?.RESULT,
        null,
        2
      )
    );

    console.log("");

    const oilList =
      data?.RESULT?.OIL;

    console.log(
      "===== OIL 상태 ====="
    );

    if (
      Array.isArray(
        oilList
      )
    ) {
      console.log(
        `OIL 배열: ${oilList.length}건`
      );

      if (
        oilList.length > 0
      ) {
        console.log("");

        console.log(
          "===== 첫 번째 주유소 ====="
        );

        console.log(
          JSON.stringify(
            oilList[0],
            null,
            2
          )
        );
      }
    } else {
      console.log(
        "OIL이 배열이 아닙니다."
      );

      console.log(
        `OIL 값: ${JSON.stringify(
          oilList
        )}`
      );
    }

    console.log("");

    console.log(
      "6. 테스트 종료"
    );
  } catch (
    error
  ) {
    console.error(
      "5. 오피넷 API 호출 중 오류 발생"
    );

    console.error(
      "이름:",
      error?.name
    );

    console.error(
      "메시지:",
      error?.message
    );

    console.error(
      error
    );

    process.exitCode =
      1;
  }
}

main();