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
    .replace(/[()[\]{}.,'’"`·\-_\/]/g, "")
    .trim();
}

function normalizePhone(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value).replace(
    /\D/g,
    ""
  );
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
    .replace(/[()[\]{}.,'’"`·\-_\/]/g, "")
    .replace(/^대한민국/, "")
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

function normalizeCompanyPart(
  value
) {
  return normalizeText(value)
    .replace(
      /주식회사/g,
      ""
    )
    .replace(
      /법인/g,
      ""
    )
    .replace(
      /^주/g,
      ""
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

  /**
   * 예:
   *
   * 강원강릉시경강로1935
   * → 강원강릉시경강로
   *
   * 강원강릉시범일로596
   * → 강원강릉시범일로
   */
  const match =
    normalized.match(
      /^(.+?(?:대로|로|길))(?:\d+(?:-\d+)?)?(?:\(.+\))?$/
    );

  if (match) {
    return match[1];
  }

  /**
   * 공식 주소가
   * "강원 강릉시 경강로"처럼
   * 번호 없이 끝나는 경우
   */
  const roadMatch =
    normalized.match(
      /^(.+?(?:대로|로|길))/
    );

  return roadMatch
    ? roadMatch[1]
    : "";
}

function compareAddressPair(
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
      exact: false,
      sameRoad: false,
      commonNumbers: [],
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

  /**
   * 도로명 + 번지번호가 일치
   *
   * 실제 같은 장소일 가능성이 매우 높다.
   */
  if (
    sameRoad &&
    commonNumbers.length > 0
  ) {
    return {
      score: 95,
      exact: false,
      sameRoad: true,
      commonNumbers,
    };
  }

  /**
   * 도로명만 동일
   *
   * 공식 가맹점 주소가 축약되어 있는 경우가
   * 많으므로 참고 정보로만 사용한다.
   *
   * 단독 매칭 근거로 사용하지 않는다.
   */
  if (
    sameRoad
  ) {
    return {
      score: 35,
      exact: false,
      sameRoad: true,
      commonNumbers: [],
    };
  }

  return {
    score: 0,
    exact: false,
    sameRoad: false,
    commonNumbers: [],
  };
}

function getAddressScore(
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
      exact: false,
      sameRoad: false,
      commonNumbers: [],
    };
  }

  let best = {
    score: 0,
    exact: false,
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
      const result =
        compareAddressPair(
          stationAddress,
          merchantAddress
        );

      if (
        result.score >
        best.score
      ) {
        best =
          result;
      }
    }
  }

  return best;
}

function getPhoneScore(
  station,
  merchant
) {
  const stationPhone =
    normalizePhone(
      station?.phone
    );

  const merchantPhone =
    normalizePhone(
      merchant?.phone
    );

  if (
    !stationPhone ||
    !merchantPhone
  ) {
    return 0;
  }

  if (
    stationPhone ===
    merchantPhone
  ) {
    return 100;
  }

  if (
    stationPhone.length >= 7 &&
    merchantPhone.length >= 7
  ) {
    if (
      stationPhone.slice(-7) ===
      merchantPhone.slice(-7)
    ) {
      return 95;
    }
  }

  return 0;
}

function calculateCoordinateDistanceKm(
  station,
  merchant
) {
  const stationLat =
    Number(
      station?.latitude
    );

  const stationLng =
    Number(
      station?.longitude
    );

  const merchantLat =
    Number(
      merchant?.latitude
    );

  const merchantLng =
    Number(
      merchant?.longitude
    );

  if (
    !Number.isFinite(
      stationLat
    ) ||
    !Number.isFinite(
      stationLng
    ) ||
    !Number.isFinite(
      merchantLat
    ) ||
    !Number.isFinite(
      merchantLng
    )
  ) {
    return null;
  }

  const toRad =
    (value) =>
      value *
      Math.PI /
      180;

  const lat1 =
    toRad(
      stationLat
    );

  const lat2 =
    toRad(
      merchantLat
    );

  const dLat =
    toRad(
      merchantLat -
        stationLat
    );

  const dLng =
    toRad(
      merchantLng -
        stationLng
    );

  const a =
    Math.sin(
      dLat / 2
    ) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(
        dLng / 2
      ) ** 2;

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(
        1 - a
      )
    );

  return (
    6371 *
    c
  );
}

function getCoordinateScore(
  station,
  merchant
) {
  const distanceKm =
    calculateCoordinateDistanceKm(
      station,
      merchant
    );

  if (
    distanceKm === null
  ) {
    return {
      score: 0,
      distanceKm: null,
    };
  }

  if (
    distanceKm <= 0.05
  ) {
    return {
      score: 100,
      distanceKm,
    };
  }

  if (
    distanceKm <= 0.1
  ) {
    return {
      score: 95,
      distanceKm,
    };
  }

  if (
    distanceKm <= 0.2
  ) {
    return {
      score: 90,
      distanceKm,
    };
  }

  if (
    distanceKm <= 0.5
  ) {
    return {
      score: 80,
      distanceKm,
    };
  }

  if (
    distanceKm <= 1
  ) {
    return {
      score: 60,
      distanceKm,
    };
  }

  return {
    score: 0,
    distanceKm,
  };
}

function getStationCoreCandidates(
  value
) {
  const normalized =
    normalizeText(value);

  if (!normalized) {
    return [];
  }

  const result =
    new Set();

  const suffixes = [
    "주유소",
    "충전소",
  ];

  for (
    const suffix of suffixes
  ) {
    const index =
      normalized.indexOf(
        suffix
      );

    if (
      index < 2
    ) {
      continue;
    }

    const before =
      normalized.slice(
        0,
        index
      );

    for (
      let length = 2;
      length <=
        before.length;
      length += 1
    ) {
      result.add(
        `${before.slice(
          -length
        )}${suffix}`
      );
    }
  }

  return [
    ...result,
  ].sort(
    (a, b) =>
      b.length -
      a.length
  );
}

function findCommonStationCore(
  stationName,
  merchantName
) {
  const stationCandidates =
    getStationCoreCandidates(
      stationName
    );

  const merchantCandidates =
    getStationCoreCandidates(
      merchantName
    );

  const merchantSet =
    new Set(
      merchantCandidates
    );

  for (
    const candidate of
      stationCandidates
  ) {
    if (
      merchantSet.has(
        candidate
      )
    ) {
      return candidate;
    }
  }

  return "";
}

function removeCore(
  value,
  core
) {
  const normalized =
    normalizeText(value);

  const index =
    normalized.indexOf(
      core
    );

  if (
    index === -1
  ) {
    return "";
  }

  return (
    normalized.slice(
      0,
      index
    ) +
    normalized.slice(
      index +
        core.length
    )
  );
}

function companyPartsMatch(
  stationRemainder,
  merchantRemainder
) {
  const stationCompany =
    normalizeCompanyPart(
      stationRemainder
    );

  const merchantCompany =
    normalizeCompanyPart(
      merchantRemainder
    );

  if (
    !stationCompany ||
    !merchantCompany
  ) {
    return false;
  }

  if (
    stationCompany ===
    merchantCompany
  ) {
    return true;
  }

  if (
    stationCompany.includes(
      merchantCompany
    ) ||
    merchantCompany.includes(
      stationCompany
    )
  ) {
    return true;
  }

  return false;
}

function calculateNameScore(
  station,
  merchant
) {
  const stationName =
    normalizeText(
      station?.name
    );

  const merchantName =
    normalizeText(
      merchant?.name
    );

  if (
    !stationName ||
    !merchantName
  ) {
    return {
      score: 0,
      coreMatch: false,
      companyMatch: false,
      exactMatch: false,
      commonCore: "",
    };
  }

  if (
    stationName ===
    merchantName
  ) {
    return {
      score: 100,
      coreMatch: true,
      companyMatch: true,
      exactMatch: true,
      commonCore:
        stationName,
    };
  }

  const commonCore =
    findCommonStationCore(
      stationName,
      merchantName
    );

  if (
    commonCore
  ) {
    const stationRemainder =
      removeCore(
        stationName,
        commonCore
      );

    const merchantRemainder =
      removeCore(
        merchantName,
        commonCore
      );

    const companyMatch =
      companyPartsMatch(
        stationRemainder,
        merchantRemainder
      );

    if (
      companyMatch
    ) {
      return {
        score: 100,
        coreMatch: true,
        companyMatch: true,
        exactMatch: false,
        commonCore,
      };
    }

    return {
      score: 90,
      coreMatch: true,
      companyMatch: false,
      exactMatch: false,
      commonCore,
    };
  }

  const stationCore =
    stationName.replace(
      /주유소|충전소/g,
      ""
    );

  const merchantCore =
    merchantName.replace(
      /주유소|충전소/g,
      ""
    );

  if (
    stationCore &&
    merchantCore &&
    stationCore ===
      merchantCore
  ) {
    return {
      score: 95,
      coreMatch: true,
      companyMatch: false,
      exactMatch: false,
      commonCore: "",
    };
  }

  if (
    stationCore.length >= 3 &&
    merchantCore.length >= 3 &&
    (
      stationCore.includes(
        merchantCore
      ) ||
      merchantCore.includes(
        stationCore
      )
    )
  ) {
    return {
      score: 80,
      coreMatch: true,
      companyMatch: false,
      exactMatch: false,
      commonCore: "",
    };
  }

  return {
    score: 0,
    coreMatch: false,
    companyMatch: false,
    exactMatch: false,
    commonCore: "",
  };
}

function calculateCandidate(
  station,
  merchant
) {
  const name =
    calculateNameScore(
      station,
      merchant
    );

  const address =
    getAddressScore(
      station,
      merchant
    );

  const phoneScore =
    getPhoneScore(
      station,
      merchant
    );

  const coordinate =
    getCoordinateScore(
      station,
      merchant
    );

  let score = 0;

  /**
   * 완전한 주소 일치
   */
  if (
    address.exact
  ) {
    score = 100;

    if (
      phoneScore >= 95
    ) {
      score += 5;
    }

    if (
      name.score >= 90
    ) {
      score += 5;
    }
  }

  /**
   * 주소의 도로명 + 실제 번지 일치
   */
  else if (
    address.score >= 95
  ) {
    score =
      70 +
      Math.round(
        name.score *
          0.15
      ) +
      Math.round(
        phoneScore *
          0.10
      ) +
      Math.round(
        coordinate.score *
          0.05
      );
  }

  /**
   * 도로명만 같은 경우
   *
   * 주소 자체는 약한 근거이므로
   * 이름/전화번호가 있어야 높은 점수를 준다.
   */
  else if (
    address.sameRoad
  ) {
    score =
      15 +
      Math.round(
        name.score *
          0.45
      ) +
      Math.round(
        phoneScore *
          0.25
      ) +
      Math.round(
        coordinate.score *
          0.10
      );
  }

  /**
   * 주소가 없는 경우
   */
  else {
    score =
      Math.round(
        name.score *
          0.50 +
        phoneScore *
          0.25 +
        coordinate.score *
          0.25
      );
  }

  /**
   * 사업자명 + 핵심 주유소명이 일치하면
   * 강한 보너스를 준다.
   */
  if (
    name.companyMatch
  ) {
    score +=
      15;
  }

  score =
    Math.round(
      Math.min(
        100,
        score
      )
    );

  let reason =
    "매칭 근거 부족";

  if (
    address.exact &&
    phoneScore >= 95
  ) {
    reason =
      "주소와 전화번호가 일치합니다.";
  } else if (
    address.exact
  ) {
    reason =
      "주소가 동일합니다.";
  } else if (
    address.score >= 95 &&
    phoneScore >= 95
  ) {
    reason =
      "주소와 전화번호가 강하게 일치합니다.";
  } else if (
    address.score >= 95 &&
    name.score >= 90
  ) {
    reason =
      "주소와 상호명이 강하게 일치합니다.";
  } else if (
    address.sameRoad &&
    name.companyMatch
  ) {
    reason =
      "도로명과 주유소 핵심명 및 사업자명이 일치합니다.";
  } else if (
    name.companyMatch
  ) {
    reason =
      "주유소 핵심명과 사업자명이 일치합니다.";
  } else if (
    name.score >= 90 &&
    phoneScore >= 95
  ) {
    reason =
      "상호명과 전화번호가 일치합니다.";
  } else if (
    name.score >= 90 &&
    coordinate.score >= 95
  ) {
    reason =
      "상호명과 좌표가 강하게 일치합니다.";
  } else if (
    name.score >= 90
  ) {
    reason =
      "주유소 핵심 명칭이 일치합니다.";
  } else if (
    address.sameRoad
  ) {
    reason =
      "도로명은 같지만 동일 주유소 여부를 확정할 정보가 부족합니다.";
  }

  let matchStatus =
    "unmatched";

  /**
   * 1. 완전 주소 일치
   */
  if (
    address.exact
  ) {
    matchStatus =
      "matched";
  }

  /**
   * 2. 동일 도로 + 추가 강한 근거
   */
  else if (
    address.score >= 95 &&
    (
      name.score >= 90 ||
      phoneScore >= 95 ||
      coordinate.score >= 90
    )
  ) {
    matchStatus =
      "matched";
  }

  /**
   * 3. 사업자명까지 확인
   */
  else if (
    name.companyMatch &&
    (
      phoneScore >= 90 ||
      coordinate.score >= 90 ||
      address.sameRoad
    )
  ) {
    matchStatus =
      "matched";
  }

  /**
   * 4. 이름 + 전화
   */
  else if (
    name.score >= 90 &&
    phoneScore >= 95
  ) {
    matchStatus =
      "matched";
  }

  /**
   * 5. 이름 + 좌표
   */
  else if (
    name.score >= 90 &&
    coordinate.score >= 95
  ) {
    matchStatus =
      "matched";
  }

  /**
   * 6. 이름 + 도로명
   */
  else if (
    name.score >= 90 &&
    address.sameRoad
  ) {
    matchStatus =
      "matched";
  }

  /**
   * 7. 이름만 충분히 명확한 경우
   */
  else if (
    name.exactMatch
  ) {
    matchStatus =
      "matched";
  }

  /**
   * 애매한 후보
   */
  else if (
    score >= 60
  ) {
    matchStatus =
      "possible";
  }

  return {
    merchant,

    score,

    matchStatus,

    nameScore:
      name.score,

    addressScore:
      address.score,

    phoneScore,

    coordinateScore:
      coordinate.score,

    coordinateDistanceKm:
      coordinate.distanceKm,

    coreMatch:
      name.coreMatch,

    companyMatch:
      name.companyMatch,

    exactNameMatch:
      name.exactMatch,

    commonCore:
      name.commonCore,

    addressExact:
      address.exact,

    addressSameRoad:
      address.sameRoad,

    addressCommonNumbers:
      address.commonNumbers,

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

      phoneScore:
        0,

      coordinateScore:
        0,

      coordinateDistanceKm:
        null,

      candidates:
        [],

      reason:
        "매칭 대상 가맹점이 없습니다.",
    };
  }

  const candidates =
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

          if (
            b.phoneScore !==
            a.phoneScore
          ) {
            return (
              b.phoneScore -
              a.phoneScore
            );
          }

          return (
            b.nameScore -
            a.nameScore
          );
        }
      );

  const best =
    candidates[0];

  const second =
    candidates[1] ??
    null;

  if (
    !best ||
    best.score <= 0
  ) {
    return {
      matchStatus:
        "unmatched",

      confidence:
        0,

      merchant:
        null,

      nameScore:
        best?.nameScore ??
        0,

      addressScore:
        best?.addressScore ??
        0,

      phoneScore:
        best?.phoneScore ??
        0,

      coordinateScore:
        best?.coordinateScore ??
        0,

      coordinateDistanceKm:
        best?.coordinateDistanceKm ??
        null,

      candidates,

      reason:
        "공식 가맹점과 일치하는 정보가 없습니다.",
    };
  }

  let matchStatus =
    best.matchStatus;

  let reason =
    best.reason;

  /**
   * 강한 주소
   */
  if (
    best.addressExact
  ) {
    matchStatus =
      "matched";

    reason =
      "주소가 동일한 공식 가맹점입니다.";
  }

  /**
   * 주소 번호까지 같은 강한 후보
   */
  else if (
    best.addressScore >= 95 &&
    (
      best.nameScore >= 90 ||
      best.phoneScore >= 95 ||
      best.coordinateScore >= 90
    )
  ) {
    matchStatus =
      "matched";
  }

  /**
   * 동일 도로 + 상호
   */
  else if (
    best.addressSameRoad &&
    best.nameScore >= 90
  ) {
    matchStatus =
      "matched";
  }

  /**
   * 사업자명 일치
   */
  else if (
    best.companyMatch
  ) {
    matchStatus =
      "matched";
  }

  /**
   * 전화 + 이름
   */
  else if (
    best.phoneScore >= 95 &&
    best.nameScore >= 90
  ) {
    matchStatus =
      "matched";
  }

  /**
   * 좌표 + 이름
   */
  else if (
    best.coordinateScore >= 95 &&
    best.nameScore >= 90
  ) {
    matchStatus =
      "matched";
  }

  /**
   * 완전 동일 상호
   */
  else if (
    best.exactNameMatch
  ) {
    matchStatus =
      "matched";
  }

  /**
   * 후보 간 점수 차이가 작은 경우에만
   * ambiguous
   *
   * 단, 둘 다 0인 경우는 절대 ambiguous가 아니다.
   */
  else if (
    second &&
    second.score > 0 &&
    best.score >= 60 &&
    second.score >=
      best.score - 5
  ) {
    matchStatus =
      "ambiguous";

    reason =
      "상위 후보 간 점수 차이가 작아 자동 확정하지 않았습니다.";
  }

  /**
   * 낮은 점수는 자동 가맹 처리하지 않는다.
   */
  else if (
    best.score < 60
  ) {
    matchStatus =
      "unmatched";

    reason =
      "동일 주유소로 확정할 근거가 부족합니다.";
  }

  const matchedMerchant =
    matchStatus ===
      "matched"
      ? best.merchant
      : null;

  return {
    matchStatus,

    confidence:
      best.score,

    merchant:
      matchedMerchant,

    nameScore:
      best.nameScore,

    addressScore:
      best.addressScore,

    phoneScore:
      best.phoneScore,

    coordinateScore:
      best.coordinateScore,

    coordinateDistanceKm:
      best.coordinateDistanceKm,

    coreMatch:
      best.coreMatch,

    companyMatch:
      best.companyMatch,

    exactNameMatch:
      best.exactNameMatch,

    commonCore:
      best.commonCore,

    addressExact:
      best.addressExact,

    addressSameRoad:
      best.addressSameRoad,

    candidates,

    reason,
  };
}