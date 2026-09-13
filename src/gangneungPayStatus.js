/**
 * 강릉페이 매칭 결과(localpayMatcher.js의 matchStatus)를
 * 앱에서 실제로 쓰는 gangneungPay.status로 변환합니다.
 *
 * 예전에는 이 로직이 src/server.js와 src/index.js에 각각
 * 따로 구현되어 있었고, 두 구현이 서로 다른 문자열을 썼습니다
 * (server.js는 "available", index.js는 "matched").
 * 프론트(public/index.html의 createPayBadge 등)는 server.js가
 * 실제로 내려주는 "available" 기준으로 만들어져 있으므로,
 * 이 파일이 그 vocabulary를 유일한 기준으로 삼습니다.
 *
 * status 값: "unavailable" | "available" | "needs_confirmation"
 */
export function createGangneungPayInfo(
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
        matchResult?.confidence ??
        0,

      merchant:
        null,

      reason:
        matchResult?.reason ??
        "공식 강릉페이 가맹 주유소 명단에서 일치 항목을 찾지 못했습니다.",

      source:
        "gangneung-pay-official-list",
    };
  }

  if (
    matchResult.matchStatus ===
    "matched"
  ) {
    return {
      status:
        "available",

      confidence:
        matchResult.confidence,

      merchant:
        matchResult.merchant,

      reason:
        matchResult.reason,

      source:
        "gangneung-pay-official-list",
    };
  }

  if (
    matchResult.matchStatus ===
      "probable" ||
    matchResult.matchStatus ===
      "possible" ||
    matchResult.matchStatus ===
      "needs_confirmation"
  ) {
    return {
      status:
        "needs_confirmation",

      confidence:
        matchResult.confidence,

      merchant:
        matchResult.merchant ??
        null,

      reason:
        matchResult.reason,

      source:
        "gangneung-pay-official-list",
    };
  }

  if (
    matchResult.matchStatus ===
    "ambiguous"
  ) {
    return {
      status:
        "needs_confirmation",

      confidence:
        matchResult.confidence,

      merchant:
        null,

      reason:
        matchResult.reason,

      source:
        "gangneung-pay-official-list",
    };
  }

  return {
    status:
      "needs_confirmation",

    confidence:
      matchResult.confidence ??
      0,

    merchant:
      matchResult.merchant ??
      null,

    reason:
      matchResult.reason ??
      "강릉페이 가맹 여부를 확정할 수 없습니다.",

    source:
      "gangneung-pay-official-list",
  };
}
