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

/**
 * 주소 비교용 정규화.
 *
 * 도로명 비교에서는 대부분의 불필요한 기호를 제거하지만
 * 지번번호 비교에 사용할 수 있도록 하이픈(-)은 보존한다.
 *
 * 예:
 * 123-4 → 123-4
 * 1234 → 1234
 */
function normalizeAddress(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return normalizeAddressBase(
    String(value)
  );
}

/**
 * 지번번호 비교 전용 정규화.
 *
 * normalizeAddress()와 동일하게 처리하되
 * 하이픈을 반드시 보존한다.
 */
function normalizeAddressForNumbers(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return normalizeAddressBase(
    String(value)
  );
}

function normalizeAddressBase(
  value
) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(
      /[()[\]{}.,'’"`·\/]/g,
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
    )
    .trim();
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
    normalizeAddressForNumbers(
      value
    );

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
    normalizeAddress(
      value
    );

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
          stationAddress
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
      stationAddress
    );

  const merchantNumbers =
    extractAddressNumbers(
      merchantAddress
    );

  const commonNumbers =
    stationNumbers.filter(
      (number) =>
        merchantNumbers.includes(
          number
        )
    );

  if (
    commonNumbers.length >
    0
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
    stationAddresses.length ===
      0 ||
    merchantAddresses.length ===
      0
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
 * 회사명으로 볼 가능성이 높은 문자열인지 확인한다.
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
   * 한쪽 이름에 다른 쪽 전체 주유소명이 들어 있고
   * 남는 문자열이 실제 회사명처럼 보이는 경우만 허용.
   */
  const stationContainsMerchant =
    station.includes(
      merchant
    );

  if (
    stationContainsMerchant &&
    merchant.length >= 4
  ) {
    const remainder =
      station.replace(
        merchant,
        ""
      );

    if (
      isCompanyLike(
        remainder
      )
    ) {
      return {
        score: 100,

        exact: false,

        coreMatch: true,

        companyMatch: true,

        commonCore:
          merchant,
      };
    }
  }

  const merchantContainsStation =
    merchant.includes(
      station
    );

  if (
    merchantContainsStation &&
    station.length >= 4
  ) {
    const remainder =
      merchant.replace(
        station,
        ""
      );

    if (
      isCompanyLike(
        remainder
      )
    ) {
      return {
        score: 100,

        exact: false,

        coreMatch: true,

        companyMatch: true,

        commonCore:
          station,
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
     * 양쪽 모두 회사명이 붙어 있고
     * 회사명까지 동일/포함 관계인 경우
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
     * 한쪽은 주유소명만,
     * 다른 쪽에는 회사명이 붙은 경우
     */
    if (
      stationRemainder ===
        "" &&
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
      merchantRemainder ===
        "" &&
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

  let reviewRequired =
    false;

  let reviewType =
    null;

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

    if (
      address.type ===
      "exact"
    ) {
      score += 30;

      matchStatus =
        "matched";

      reason =
        "주유소명과 주소가 모두 일치합니다.";
    } else if (
      address.type ===
      "roadAndNumber"
    ) {
      score += 25;

      matchStatus =
        "matched";

      reason =
        "주유소명과 주소의 도로명·번호가 일치합니다.";
    } else if (
      address.type ===
      "roadOnly"
    ) {
      score += 5;

      /**
       * 같은 도로만으로는
       * 자동 할인 적용을 하지 않는다.
       *
       * 상세조회 후 다시 판단할 수 있도록
       * 확인 필요 상태로 둔다.
       */
      matchStatus =
        "needs_confirmation";

      reviewRequired =
        true;

      reviewType =
        "road-only";

      reason =
        "주유소명은 일치하지만 주소가 동일 도로까지만 확인되어 추가 확인이 필요합니다.";
    } else {
      /**
       * 이름만 일치하는 경우도
       * 자동 할인 적용하지 않는다.
       */
      matchStatus =
        "needs_confirmation";

      reviewRequired =
        true;

      reviewType =
        "name-only";

      if (
        name.companyMatch
      ) {
        reason =
          "주유소명과 사업자명 구성이 일치하지만 주소 확인이 필요합니다.";
      } else {
        reason =
          "주유소명이 일치하지만 주소 확인이 필요합니다.";
      }
    }
  } else {
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

    reviewRequired,

    reviewType,

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
   * 실제로 이름이 맞는 후보만 검토한다.
   */
  const nameCandidates =
    allCandidates.filter(
      (candidate) =>
        candidate.nameScore >=
        100
    );

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
   * 같은 이름의 공식 가맹점이 여러 개면
   * 자동 선택하지 않는다.
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
   * 이름 + 정확한 주소
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

  /**
   * 이름 + 도로명 + 번호
   */
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
   * 이름 + 같은 도로만 일치
   *
   * 자동 할인 적용은 하지 않는다.
   */
  if (
    best.addressType ===
      "roadOnly" &&
    nameCandidates.length ===
      1
  ) {
    return {
      matchStatus:
        "needs_confirmation",

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
        true,

      reviewType:
        "road-only",

      reason:
        "주유소명이 일치하지만 주소가 동일 도로까지만 확인되어 추가 확인이 필요합니다.",
    };
  }

  /**
   * 주소가 없고 이름만 유일하게 일치
   *
   * 자동 할인 적용은 하지 않는다.
   */
  if (
    nameCandidates.length ===
      1 &&
    best.nameScore ===
      100
  ) {
    return {
      matchStatus:
        "needs_confirmation",

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
        true,

      reviewType:
        "name-only",

      reason:
        best.companyMatch
          ? "주유소명과 사업자명 구성이 일치하지만 주소 확인이 필요합니다."
          : "주유소명이 공식 가맹점과 정확히 일치하지만 주소 확인이 필요합니다.",
    };
  }

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
