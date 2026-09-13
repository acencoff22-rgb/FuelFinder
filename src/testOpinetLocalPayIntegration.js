import {
  getNearbyStations,
  getStationDetail,
  extractStationDetail,
} from "./opinet.js";

import {
  mapOpinetStations,
} from "./opinetMapper.js";

import {
  getGangneungPayGasStations,
} from "./gangneungPayStations.js";

import {
  matchStationToLocalPay,
} from "./localpayMatcher.js";

import {
  wgs84ToKatec,
} from "./coordinate.js";

const TEST_LOCATION = {
  latitude:
    37.7408126,

  longitude:
    128.8805153,
};

async function getStationDetailSafely(
  stationId
) {
  try {
    const data =
      await getStationDetail(
        stationId
      );

    const detail =
      extractStationDetail(
        data
      );

    if (
      !detail
    ) {
      return null;
    }

    return detail;
  } catch (
    error
  ) {
    console.warn(
      `[상세조회 실패] ${stationId}: ${error.message}`
    );

    return null;
  }
}

function mergeStationDetail(
  station,
  detail
) {
  if (
    !detail
  ) {
    return station;
  }

  return {
    ...station,

    name:
      detail.OS_NM ||
      station.name,

    address:
      detail.NEW_ADR ||
      station.address ||
      "",

    oldAddress:
      detail.VAN_ADR ||
      station.oldAddress ||
      "",

    phone:
      detail.TEL ||
      station.phone ||
      "",
  };
}

function getFirstPassResults(
  stations,
  merchants
) {
  return stations.map(
    (station) => {
      const result =
        matchStationToLocalPay(
          station,
          merchants
        );

      return {
        station,
        result,
      };
    }
  );
}

function getStationsNeedingDetail(
  results
) {
  return results.filter(
    ({
      result,
    }) => {
      /**
       * 이름이 여러 공식 가맹점과
       * 겹치는 경우만 상세조회한다.
       */
      if (
        result.matchStatus ===
        "ambiguous"
      ) {
        return true;
      }

      /**
       * 추가 확인이 필요한 경우
       */
      if (
        result.reviewRequired ===
        true
      ) {
        return true;
      }

      /**
       * 같은 핵심 이름은 맞지만
       * 주소가 아직 없는 경우
       *
       * 여기서는 상세주소로 확인한다.
       */
      if (
        result.matchStatus ===
          "matched" &&
        result.nameScore >= 100 &&
        (
          result.addressScore === 0 ||
          result.addressScore === 35
        )
      ) {
        return true;
      }

      return false;
    }
  );
}

async function enrichOnlyCandidates(
  results
) {
  const candidates =
    getStationsNeedingDetail(
      results
    );

  console.log(
    `상세조회 대상: ${candidates.length}건`
  );

  console.log(
    ""
  );

  const enriched =
    [];

  for (
    const item of candidates
  ) {
    console.log(
      `상세조회: ${item.station.name} (${item.station.id})`
    );

    const detail =
      await getStationDetailSafely(
        item.station.id
      );

    enriched.push({
      station:
        mergeStationDetail(
          item.station,
          detail
        ),

      detailFound:
        Boolean(
          detail
        ),
    });
  }

  return enriched;
}

async function main() {
  console.log(
    "===== FuelFinder 실제 오피넷 + 강릉페이 통합 테스트 ====="
  );

  console.log("");

  console.log(
    `테스트 위치: ${TEST_LOCATION.latitude}, ${TEST_LOCATION.longitude}`
  );

  console.log("");

  const merchants =
    getGangneungPayGasStations();

  console.log(
    `공식 강릉페이 일반 주유소: ${merchants.length}건`
  );

  console.log("");

  const katec =
    wgs84ToKatec(
      TEST_LOCATION
    );

  console.log(
    "오피넷 검색 좌표:"
  );

  console.log(
    `  KATEC X: ${katec.x}`
  );

  console.log(
    `  KATEC Y: ${katec.y}`
  );

  console.log("");

  try {
    /**
     * -----------------------------------------
     * 1단계
     *
     * 반경검색만 한다.
     *
     * 상세조회 41회를 하지 않는다.
     * -----------------------------------------
     */
    const rawData =
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

    const baseStations =
      mapOpinetStations(
        rawData
      );

    console.log(
      `오피넷 실제 주유소: ${baseStations.length}건`
    );

    console.log("");

    if (
      baseStations.length ===
      0
    ) {
      console.log(
        "오피넷에서 주유소가 조회되지 않았습니다."
      );

      return;
    }

    /**
     * -----------------------------------------
     * 2단계
     *
     * 상세주소 없이 1차 이름 매칭
     * -----------------------------------------
     */
    console.log(
      "===== 1차 이름 매칭 ====="
    );

    const firstPass =
      getFirstPassResults(
        baseStations,
        merchants
      );

    const firstMatched =
      firstPass.filter(
        ({
          result,
        }) =>
          result.matchStatus ===
          "matched"
      ).length;

    const firstAmbiguous =
      firstPass.filter(
        ({
          result,
        }) =>
          result.matchStatus ===
          "ambiguous"
      ).length;

    const firstReview =
      firstPass.filter(
        ({
          result,
        }) =>
          result.reviewRequired ===
          true
      ).length;

    console.log(
      `1차 matched: ${firstMatched}건`
    );

    console.log(
      `1차 ambiguous: ${firstAmbiguous}건`
    );

    console.log(
      `1차 추가확인: ${firstReview}건`
    );

    console.log("");

    /**
     * -----------------------------------------
     * 3단계
     *
     * 정말 필요한 주유소만 상세조회
     * -----------------------------------------
     */
    const detailTargets =
      getStationsNeedingDetail(
        firstPass
      );

    console.log(
      "===== 선택적 상세조회 ====="
    );

    console.log(
      `전체 오피넷: ${baseStations.length}건`
    );

    console.log(
      `상세조회 대상: ${detailTargets.length}건`
    );

    console.log(
      ""
    );

    const enrichedStations =
      new Map();

    for (
      const item of detailTargets
    ) {
      const station =
        item.station;

      console.log(
        `상세조회: ${station.name} (${station.id})`
      );

      const detail =
        await getStationDetailSafely(
          station.id
        );

      const enriched =
        mergeStationDetail(
          station,
          detail
        );

      enrichedStations.set(
        station.id,
        enriched
      );
    }

    console.log("");

    /**
     * -----------------------------------------
     * 4단계
     *
     * 상세정보가 확보된 후보만
     * 다시 최종 매칭한다.
     * -----------------------------------------
     */
    const finalStations =
      baseStations.map(
        (station) =>
          enrichedStations.get(
            station.id
          ) ??
          station
      );

    const finalResults =
      finalStations.map(
        (station) => {
          const result =
            matchStationToLocalPay(
              station,
              merchants
            );

          return {
            station,
            result,
          };
        }
      );

    let matchedCount = 0;
    let ambiguousCount = 0;
    let possibleCount = 0;
    let unmatchedCount = 0;

    for (
      const item of
        finalResults
    ) {
      switch (
        item.result.matchStatus
      ) {
        case "matched":
          matchedCount += 1;
          break;

        case "ambiguous":
          ambiguousCount += 1;
          break;

        case "possible":
          possibleCount += 1;
          break;

        default:
          unmatchedCount += 1;
          break;
      }
    }

    const addressCount =
      finalStations.filter(
        (station) =>
          Boolean(
            station.address ||
            station.oldAddress
          )
      ).length;

    const phoneCount =
      finalStations.filter(
        (station) =>
          Boolean(
            station.phone
          )
      ).length;

    console.log(
      "===== 최종 결과 요약 ====="
    );

    console.log(
      `확정 matched: ${matchedCount}건`
    );

    console.log(
      `ambiguous: ${ambiguousCount}건`
    );

    console.log(
      `possible: ${possibleCount}건`
    );

    console.log(
      `unmatched: ${unmatchedCount}건`
    );

    console.log("");

    console.log(
      "===== 최종 상세정보 확보 ====="
    );

    console.log(
      `주소 확보: ${addressCount}/${finalStations.length}건`
    );

    console.log(
      `전화 확보: ${phoneCount}/${finalStations.length}건`
    );

    console.log("");

    /**
     * -----------------------------------------
     * 확정 매칭
     * -----------------------------------------
     */
    console.log(
      "===== 확정 강릉페이 매칭 ====="
    );

    finalResults
      .filter(
        ({
          result,
        }) =>
          result.matchStatus ===
          "matched"
      )
      .forEach(
        (
          item,
          index
        ) => {
          const {
            station,
            result,
          } = item;

          console.log(
            `[${index + 1}] ${station.name}`
          );

          console.log(
            `  UNI_ID: ${station.id}`
          );

          console.log(
            `  오피넷 주소: ${
              station.address ||
              "(주소 없음)"
            }`
          );

          console.log(
            `  공식 가맹점: ${
              result.merchant?.name ||
              "(없음)"
            }`
          );

          console.log(
            `  공식 주소: ${
              result.merchant?.address ||
              "(주소 없음)"
            }`
          );

          console.log(
            `  신뢰도: ${result.confidence}점`
          );

          console.log(
            `  이름 점수: ${result.nameScore}`
          );

          console.log(
            `  주소 점수: ${result.addressScore}`
          );

          console.log(
            `  이유: ${result.reason}`
          );

          console.log("");
        }
      );

    /**
     * -----------------------------------------
     * 사용자 확인 필요
     * -----------------------------------------
     */
    console.log(
      "===== 사용자 확인 필요 ====="
    );

    const reviewResults =
      finalResults.filter(
        ({
          result,
        }) =>
          result.matchStatus ===
            "ambiguous" ||
          result.reviewRequired ===
            true
      );

    if (
      reviewResults.length ===
      0
    ) {
      console.log(
        "사용자 확인이 필요한 주유소가 없습니다."
      );
    } else {
      reviewResults.forEach(
        (
          item,
          index
        ) => {
          const {
            station,
            result,
          } = item;

          console.log(
            `===== 확인 ${index + 1} =====`
          );

          console.log(
            `오피넷 주유소: ${station.name}`
          );

          console.log(
            `UNI_ID: ${station.id}`
          );

          console.log(
            `주소: ${
              station.address ||
              "(주소 없음)"
            }`
          );

          console.log(
            `가격: ${station.pricePerLiter}원`
          );

          console.log(
            `거리: ${
              station.distanceKm !== null
                ? station.distanceKm.toFixed(
                    2
                  )
                : "-"
            }km`
          );

          console.log("");

          console.log(
            `판정: ${result.matchStatus}`
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
            `이유: ${result.reason}`
          );

          console.log("");

          const candidates =
            Array.isArray(
              result.reviewCandidates
            )
              ? result.reviewCandidates
              : result.candidates
                  .filter(
                    (candidate) =>
                      candidate.nameScore >=
                      100
                  )
                  .slice(
                    0,
                    5
                  );

          if (
            candidates.length ===
            0
          ) {
            console.log(
              "후보 공식 가맹점 없음"
            );
          } else {
            console.log(
              "공식 가맹점 후보:"
            );

            candidates.forEach(
              (
                candidate,
                candidateIndex
              ) => {
                const merchant =
                  candidate.merchant;

                const listIndex =
                  merchants.indexOf(
                    merchant
                  );

                console.log(
                  `  후보 ${
                    candidateIndex + 1
                  }`
                );

                console.log(
                  `    공식 목록 번호: ${
                    listIndex >= 0
                      ? listIndex +
                        1
                      : "-"
                  }`
                );

                console.log(
                  `    이름: ${
                    merchant?.name ||
                    "(없음)"
                  }`
                );

                console.log(
                  `    주소: ${
                    merchant?.address ||
                    "(없음)"
                  }`
                );

                console.log("");
              }
            );
          }
        }
      );
    }

    /**
     * -----------------------------------------
     * 상세조회 비용 확인
     * -----------------------------------------
     */
    console.log(
      "===== API 호출 절감 결과 ====="
    );

    console.log(
      `원래 방식: 최대 ${baseStations.length}건 상세조회`
    );

    console.log(
      `현재 방식: ${detailTargets.length}건 상세조회`
    );

    console.log(
      `절감: ${
        baseStations.length -
        detailTargets.length
      }건`
    );

    console.log("");

    console.log(
      "===== 통합 테스트 종료 ====="
    );
  } catch (
    error
  ) {
    console.error(
      "통합 테스트 실패:"
    );

    console.error(
      error
    );

    process.exitCode = 1;
  }
}

main();