import {
  getLowPriceStations,
} from "./opinet.js";

async function main() {
  console.log(
    "===== 오피넷 원본 응답 필드 확인 ====="
  );

  try {
    const data =
      await getLowPriceStations({
        count: 100,
      });

    const oilList =
      data?.RESULT?.OIL;

    if (!Array.isArray(oilList)) {
      console.log(
        "오피넷 OIL 데이터가 없습니다."
      );

      console.log(
        JSON.stringify(
          data,
          null,
          2
        )
      );

      return;
    }

    console.log(
      `오피넷 원본 주유소 수: ${oilList.length}`
    );

    console.log("");

    const honggildongCandidates =
      oilList.filter(
        (oil) => {
          const text =
            JSON.stringify(
              oil
            ).toLowerCase();

          return (
            text.includes(
              "홍길동"
            ) ||
            text.includes(
              "에스제이와이"
            )
          );
        }
      );

    if (
      honggildongCandidates.length >
      0
    ) {
      console.log(
        `홍길동 관련 후보: ${honggildongCandidates.length}건`
      );

      console.log("");

      honggildongCandidates.forEach(
        (
          oil,
          index
        ) => {
          console.log(
            `===== 후보 ${index + 1} =====`
          );

          console.log(
            JSON.stringify(
              oil,
              null,
              2
            )
          );

          console.log("");
        }
      );
    } else {
      console.log(
        "홍길동주유소를 찾지 못했습니다."
      );

      console.log("");

      console.log(
        "첫 번째 오피넷 원본 데이터:"
      );

      console.log(
        JSON.stringify(
          oilList[0],
          null,
          2
        )
      );
    }
  } catch (
    error
  ) {
    console.error(
      "오피넷 API 확인 실패:"
    );

    console.error(
      error
    );

    process.exitCode = 1;
  }
}

main();