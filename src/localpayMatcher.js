function normalizeText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(
      /[()[\]{}.,'’"`·\-_\/]/g,
      ""
    )
    .trim();
}

function normalizeAddress(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(
      /[()[\]{}.,'’"`·\-_\/]/g,
      ""
    )
    .replace(
      /^대한민국/,
      ""
    )
    .replace(
      /^강원특별자치도/,
      "강원"
    )
    .replace(
      /^강원도/,
      "강원"
    )
    .replace(
      /^경기도/,
      "경기"
    )
    .replace(
      /^충청북도/,
      "충북"
    )
    .replace(
      /^충청남도/,
      "충남"
    )
    .replace(
      /^전라북도/,
      "전북"
    )
    .replace(
      /^전라남도/,
      "전남"
    )
    .replace(
      /^경상북도/,
      "경북"
    )
    .replace(
      /^경상남도/,
      "경남"
    )
    .replace(
      /^제주특별자치도/,
      "제주"
    )
    .replace(
      /^서울특별시/,
      "서울"
    )
    .replace(
      /^부산광역시/,
      "부산"
    )
    .replace(
      /^대구광역시/,
      "대구"
    )
    .replace(
      /^인천광역시/,
      "인천"
    )
    .replace(
      /^광주광역시/,
      "광주"
    )
    .replace(
      /^대전광역시/,
      "대전"
    )
    .replace(
      /^울산광역시/,
      "울산"
    )
    .replace(
      /^세종특별자치시/,
      "세종"
    );
}

function getStationAddresses(
  station
) {
  return [
    station?.address,
    station?.oldAddress,
  ]
    .map(
      normalizeAddress
    )
    .filter(Boolean);
}

function getMerchantAddresses(
  merchant
) {
  return [
    merchant?.address,
    merchant?.oldAddress,
    merchant?.detailAddress,
  ]
    .map(
      normalizeAddress
    )
    .filter(Boolean);
}

function extractAddressNumbers(
  value
) {
  const normalized =
    normalizeAddress(value);

  if (!normalized) {
    return [];
  }

  return [
    ...normalized.matchAll(
      /\d+(?:-\d+)?/g
    ),
  ].map(
    (match) =>
      match[0]
  );
}

function extractRoadName(
  value
) {
  const normalized =
    normalizeAddress(value);

  if (!normalized) {
    return "";
  }

  const match =
    normalized.match(
      /^(.+?(?:대로|로|길))/
    );

  return match
    ? match[1]
    : "";
}

function compareAddress(
  stationAddress,
  merchantAddress
) {
  const station =
    normalizeAddress(
      stationAddress
    );

  const merchant =
    normalizeAddress(
      merchantAddress
    );

  if (
    !station ||
    !merchant
  ) {
    return {
      score: 0,
      type: "none",
      sameRoad: false,
      commonNumbers: [],
    };
  }

  if (
    station ===
    merchant
  ) {
    return {
      score: 100,
      type: "exact",
      sameRoad: true,
      commonNumbers:
        extractAddressNumbers(
          station
        ),
    };
  }

  const stationRoad =
    extractRoadName(
      station
    );

  const merchantRoad =
    extractRoadName(
      merchant
    );

  const sameRoad =
    Boolean(
      stationRoad &&
      merchantRoad &&
      stationRoad ===
        merchantRoad
    );

  if (!sameRoad) {
    return {
      score: 0,
      type: "none",
      sameRoad: false,
      commonNumbers: [],
    };
  }

  const stationNumbers =
    extractAddressNumbers(
      station
    );

  const merchantNumbers =
    extractAddressNumbers(
      merchant
    );

  const commonNumbers =
    stationNumbers.filter(
      (number) =>
        merchantNumbers.includes(
          number
        )
    );

  if (
    commonNumbers.length > 0
  ) {
    return {
      score: 95,
      type: "roadAndNumber",
      sameRoad: true,
      commonNumbers,
    };
  }

  return {
    score: 35,
    type: "roadOnly",
    sameRoad: true,
    commonNumbers: [],
  };
}

function getAddressMatch(
  station,
  merchant
) {
  const stationAddresses =
    getStationAddresses(
      station
    );

  const merchantAddresses =
    getMerchantAddresses(
      merchant
    );

  if (
    stationAddresses.length === 0 ||
    merchantAddresses.length === 0
  ) {
    return {
      score: 0,
      type: "none",
      sameRoad: false,
      commonNumbers: [],
    };
  }

  let best = {
    score: 0,
    type: "none",
    sameRoad: false,
    commonNumbers: [],
  };

  for (
    const stationAddress of
      stationAddresses
  ) {
    for (
      const merchantAddress of
        merchantAddresses
    ) {
      const current =
        compareAddress(
          stationAddress,
          merchantAddress
        );

      if (
        current.score >
        best.score
      ) {
        best =
          current;
      }
    }
  }

  return best;
}

/**
 * 회사명으로 볼 가능성이 높은 문자열인지
 * 확인한다.
 *
 * 예:
 * 에스제이와이에너지
 * 백두가스산업
 * 호진상사
 * 지에스이앤알
 *
 * 반면:
 * 남
 * 강
 * 교
 * 등은 회사명으로 취급하지 않는다.
 */
function isCompanyLike(
  value
) {
  const text =
    normalizeText(
      value
    );

  if (
    text.length < 3
  ) {
    return false;
  }

  const companyKeywords = [
    "에너지",
    "상사",
    "산업",
    "기업",
    "가스",
    "유업",
    "주식회사",
    "법인",
    "이엔알",
    "이앤알",
    "코리아",
    "corp",
    "company",
  ];

  return companyKeywords.some(
    (keyword) =>
      text.includes(
        keyword
      )
  );
}

/**
 * 주유소 이름을 분석한다.
 *
 * 중요한 점:
 *
 * 남강릉주유소
 * 강릉주유소
 *
 * 는 강릉주유소가 포함되어 있어도
 * 자동 매칭하지 않는다.
 *
 * 반면:
 *
 * 홍길동주유소에스제이와이에너지
 * 에스제이와이에너지홍길동주유소
 *
 * 처럼 실제 회사명 조각이 존재하면
 * 같은 업체명으로 판단할 수 있다.
 */
function analyzeStationName(
  stationName,
  merchantName
) {
  const station =
    normalizeText(
      stationName
    );

  const merchant =
    normalizeText(
      merchantName
    );

  if (
    !station ||
    !merchant
  ) {
    return {
      score: 0,
      exact: false,
      coreMatch: false,
      companyMatch: false,
      commonCore: "",
    };
  }

  /**
   * 완전 동일
   */
  if (
    station ===
    merchant
  ) {
    return {
      score: 100,
      exact: true,
      coreMatch: true,
      companyMatch: false,
      commonCore:
        station,
    };
  }

  /**
   * 한쪽 이름에 다른 쪽의 전체 주유소명이 들어 있고
   * 남는 문자열이 실제 회사명처럼 보이는 경우를 허용한다.
   *
   * 예:
   * 홍길동주유소 + 에스제이와이에너지
   * 에스제이와이에너지 + 홍길동주유소
   */
  const stationContainsMerchant =
    station.includes(merchant);

  if (
    stationContainsMerchant &&
    merchant.length >= 4
  ) {
    const remainder =
      station.replace(merchant, "");

    if (isCompanyLike(remainder)) {
      return {
        score: 100,
        exact: false,
        coreMatch: true,
        companyMatch: true,
        commonCore: merchant,
      };
    }
  }

  const merchantContainsStation =
    merchant.includes(station);

  if (
    merchantContainsStation &&
    station.length >= 4
  ) {
    const remainder =
      merchant.replace(station, "");

    if (isCompanyLike(remainder)) {
      return {
        score: 100,
        exact: false,
        coreMatch: true,
        companyMatch: true,
        commonCore: station,
      };
    }
  }

  const suffix =
    "주유소";

  const stationSuffixIndex =
    station.lastIndexOf(
      suffix
    );

  const merchantSuffixIndex =
    merchant.lastIndexOf(
      suffix
    );

  if (
    stationSuffixIndex < 2 ||
    merchantSuffixIndex < 2
  ) {
    return {
      score: 0,
      exact: false,
      coreMatch: false,
      companyMatch: false,
      commonCore: "",
    };
  }

  /**
   * 주유소명 앞부분
   */
  const stationBefore =
    station.slice(
      0,
      stationSuffixIndex
    );

  const merchantBefore =
    merchant.slice(
      0,
      merchantSuffixIndex
    );

  /**
   * 두 이름의 마지막 부분에서
   * 공통 주유소 핵심명을 찾는다.
   *
   * 예:
   *
   * station:
   * 홍길동
   *
   * merchant:
   * 에스제이와이에너지홍길동
   *
   * → 홍길동주유소
   */
  const maxCoreLength =
    Math.min(
      stationBefore.length,
      merchantBefore.length
    );

  for (
    let length =
      maxCoreLength;
    length >= 2;
    length -= 1
  ) {
    const stationCore =
      stationBefore.slice(
        -length
      );

    const merchantCore =
      merchantBefore.slice(
        -length
      );

    if (
      stationCore !==
      merchantCore
    ) {
      continue;
    }

    const commonCore =
      `${stationCore}${suffix}`;

    const stationRemainder =
      stationBefore.slice(
        0,
        stationBefore.length -
          length
      );

    const merchantRemainder =
      merchantBefore.slice(
        0,
        merchantBefore.length -
          length
      );

    /**
     * 회사명이 양쪽에 실제로 존재
     */
    if (
      isCompanyLike(
        stationRemainder
      ) &&
      isCompanyLike(
        merchantRemainder
      )
    ) {
      const stationCompany =
        normalizeText(
          stationRemainder
        );

      const merchantCompany =
        normalizeText(
          merchantRemainder
        );

      if (
        stationCompany ===
          merchantCompany ||
        stationCompany.includes(
          merchantCompany
        ) ||
        merchantCompany.includes(
          stationCompany
        )
      ) {
        return {
          score: 100,
          exact: false,
          coreMatch: true,
          companyMatch: true,
          commonCore,
        };
      }
    }

    /**
     * 한쪽이 주유소명만 가지고 있고
     * 다른 쪽에 회사명이 붙은 경우
     *
     * 예:
     *
     * 홍길동주유소
     * 에스제이와이에너지홍길동주유소
     *
     * 회사명이 실제 회사 형태이면 인정한다.
     */
    if (
      stationRemainder === "" &&
      isCompanyLike(
        merchantRemainder
      )
    ) {
      return {
        score: 100,
        exact: false,
        coreMatch: true,
        companyMatch: true,
        commonCore,
      };
    }

    if (
      merchantRemainder === "" &&
      isCompanyLike(
        stationRemainder
      )
    ) {
      return {
        score: 100,
        exact: false,
        coreMatch: true,
        companyMatch: true,
        commonCore,
      };
    }

    /**
     * 회사명이 아닌 한 글자/짧은 접두어는
     * 주유소명 일치로 인정하지 않는다.
     *
     * 남강릉주유소
     * 강릉주유소
     *
     * 여기서 "남"은 탈락한다.
     */
  }

  return {
    score: 0,
    exact: false,
    coreMatch: false,
    companyMatch: false,
    commonCore: "",
  };
}

function calculateCandidate(
  station,
  merchant
) {
  const name =
    analyzeStationName(
      station?.name,
      merchant?.name
    );

  const address =
    getAddressMatch(
      station,
      merchant
    );

  let score = 0;
  let matchStatus =
    "unmatched";

  let reason =
    "주유소명과 주소가 일치하지 않습니다.";

  /**
   * 이름이 정확히 맞거나
   * 회사명 순서만 다른 경우
   */
  if (
    name.score === 100
  ) {
    score = 70;

    /**
     * 주소가 정확하면 최고
     */
    if (
      address.type ===
      "exact"
    ) {
      score += 30;
    }

    /**
     * 도로명 + 번호
     */
    else if (
      address.type ===
      "roadAndNumber"
    ) {
      score += 25;
    }

    /**
     * 도로명만 동일
     */
    else if (
      address.type ===
      "roadOnly"
    ) {
      score += 5;
    }

    matchStatus =
      "matched";

    if (
      address.type ===
      "exact"
    ) {
      reason =
        "주유소명과 주소가 모두 일치합니다.";
    } else if (
      address.type ===
      "roadAndNumber"
    ) {
      reason =
        "주유소명과 주소의 도로명·번호가 일치합니다.";
    } else if (
      address.type ===
      "roadOnly"
    ) {
      reason =
        "주유소명과 동일 도로명이 일치합니다.";
    } else if (
      name.companyMatch
    ) {
      reason =
        "주유소명과 사업자명 구성이 일치합니다.";
    } else {
      reason =
        "주유소명이 정확히 일치합니다.";
    }
  }

  /**
   * 이름이 전혀 안 맞고
   * 주소만 같은 경우는
   * 절대로 매칭 후보로 올리지 않는다.
   */
  else {
    score = 0;

    matchStatus =
      "unmatched";

    reason =
      "주유소명이 일치하지 않습니다.";
  }

  return {
    merchant,

    score,

    matchStatus,

    nameScore:
      name.score,

    addressScore:
      address.score,

    addressType:
      address.type,

    addressSameRoad:
      address.sameRoad,

    addressCommonNumbers:
      address.commonNumbers,

    exactNameMatch:
      name.exact,

    coreMatch:
      name.coreMatch,

    companyMatch:
      name.companyMatch,

    commonCore:
      name.commonCore,

    reason,
  };
}

export function matchStationToLocalPay(
  station,
  merchants
) {
  if (
    !station ||
    !Array.isArray(
      merchants
    ) ||
    merchants.length === 0
  ) {
    return {
      matchStatus:
        "unmatched",

      confidence:
        0,

      merchant:
        null,

      nameScore:
        0,

      addressScore:
        0,

      candidates:
        [],

      reviewRequired:
        false,

      reason:
        "매칭 대상 가맹점이 없습니다.",
    };
  }

  const allCandidates =
    merchants
      .map(
        (merchant) =>
          calculateCandidate(
            station,
            merchant
          )
      )
      .sort(
        (a, b) => {
          if (
            b.score !==
            a.score
          ) {
            return (
              b.score -
              a.score
            );
          }

          if (
            b.addressScore !==
            a.addressScore
          ) {
            return (
              b.addressScore -
              a.addressScore
            );
          }

          return (
            b.nameScore -
            a.nameScore
          );
        }
      );

  /**
   * 실제로 이름이 맞는 후보만
   * 검토 대상으로 사용한다.
   */
  const nameCandidates =
    allCandidates.filter(
      (candidate) =>
        candidate.nameScore >=
        100
    );

  /**
   * 이름이 맞는 공식 가맹점이
   * 하나도 없다.
   *
   * 같은 도로라는 이유만으로
   * 후보를 만들지 않는다.
   */
  if (
    nameCandidates.length ===
    0
  ) {
    return {
      matchStatus:
        "unmatched",

      confidence:
        0,

      merchant:
        null,

      nameScore:
        0,

      addressScore:
        0,

      candidates:
        allCandidates,

      reviewRequired:
        false,

      reason:
        "공식 가맹점 중 주유소명이 일치하는 곳이 없습니다.",
    };
  }

  const best =
    nameCandidates[0];

  /**
   * 같은 이름의 공식 가맹점이
   * 여러 개 존재하면 자동 선택하지 않는다.
   *
   * 주소가 정확히 다른 경우에도
   * 사용자가 확인할 수 있도록 후보로 남긴다.
   */
  if (
    nameCandidates.length >
    1
  ) {
    const strongCandidates =
      nameCandidates.filter(
        (candidate) =>
          candidate.score >=
          Math.max(
            70,
            best.score - 10
          )
      );

    if (
      strongCandidates.length >
      1
    ) {
      return {
        matchStatus:
          "ambiguous",

        confidence:
          best.score,

        merchant:
          null,

        nameScore:
          best.nameScore,

        addressScore:
          best.addressScore,

        candidates:
          allCandidates,

        reviewRequired:
          true,

        reviewType:
          "same-name",

        reviewCandidates:
          strongCandidates,

        reason:
          "같은 주유소명이 여러 공식 가맹점에 존재해 확인이 필요합니다.",
      };
    }
  }

  /**
   * 주소까지 강하게 확인
   */
  if (
    best.addressType ===
    "exact"
  ) {
    return {
      matchStatus:
        "matched",

      confidence:
        100,

      merchant:
        best.merchant,

      nameScore:
        best.nameScore,

      addressScore:
        best.addressScore,

      candidates:
        allCandidates,

      reviewRequired:
        false,

      reason:
        "주유소명과 주소가 모두 일치합니다.",
    };
  }

  if (
    best.addressType ===
    "roadAndNumber"
  ) {
    return {
      matchStatus:
        "matched",

      confidence:
        95,

      merchant:
        best.merchant,

      nameScore:
        best.nameScore,

      addressScore:
        best.addressScore,

      candidates:
        allCandidates,

      reviewRequired:
        false,

      reason:
        "주유소명과 주소의 도로명·번호가 일치합니다.",
    };
  }

  /**
   * 공식 명단 주소가
   * 도로명까지만 있는 경우
   *
   * 이름이 유일하면 매칭한다.
   */
  if (
    best.addressType ===
      "roadOnly" &&
    nameCandidates.length ===
      1
  ) {
    return {
      matchStatus:
        "matched",

      confidence:
        75,

      merchant:
        best.merchant,

      nameScore:
        best.nameScore,

      addressScore:
        best.addressScore,

      candidates:
        allCandidates,

      reviewRequired:
        false,

      reason:
        "주유소명이 하나로 일치하고 공식 명단과 동일 도로입니다.",
    };
  }

  /**
   * 주소가 전혀 없지만
   * 이름이 정확히 하나인 경우
   *
   * 이 경우도 자동 매칭은 가능하지만
   * 신뢰도는 낮게 둔다.
   */
  if (
    nameCandidates.length ===
      1 &&
    best.nameScore ===
      100
  ) {
    return {
      matchStatus:
        "matched",

      confidence:
        70,

      merchant:
        best.merchant,

      nameScore:
        best.nameScore,

      addressScore:
        best.addressScore,

      candidates:
        allCandidates,

      reviewRequired:
        false,

      reason:
        best.companyMatch
          ? "주유소명과 사업자명 구성이 일치합니다."
          : "주유소명이 공식 가맹점과 정확히 일치합니다.",
    };
  }

  /**
   * 마지막 안전장치
   */
  return {
    matchStatus:
      "unmatched",

    confidence:
      0,

    merchant:
      null,

    nameScore:
      best.nameScore,

    addressScore:
      best.addressScore,

    candidates:
      allCandidates,

    reviewRequired:
      false,

    reason:
      "동일 주유소로 확정할 근거가 부족합니다.",
  };
}