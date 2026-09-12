import "dotenv/config";

const LOCALPAY_BASE_URL =
  "https://apis.data.go.kr/B190001/localFranchisesV3/franchiseV3";

const REQUEST_TIMEOUT_MS = 15000;

/**
 * 한국조폐공사 통합 지역화폐 가맹점 API 공통 요청 함수
 */
async function requestLocalPay({
  page = 1,
  perPage = 20,
  usageRegionCode,
  ksicCode,
} = {}) {
  const serviceKey =
    process.env.LOCALPAY_SERVICE_KEY;

  if (!serviceKey) {
    throw new Error(
      "LOCALPAY_SERVICE_KEY가 .env에 설정되어 있지 않습니다."
    );
  }

  const params = new URLSearchParams();

  params.set(
    "serviceKey",
    serviceKey
  );

  params.set(
    "page",
    String(page)
  );

  params.set(
    "perPage",
    String(perPage)
  );

  params.set(
    "returnType",
    "JSON"
  );

  if (usageRegionCode) {
    params.set(
      "cond[usage_rgn_cd::EQ]",
      String(usageRegionCode)
    );
  }

  if (ksicCode) {
    params.set(
      "cond[ksic_cd::EQ]",
      String(ksicCode)
    );
  }

  const url =
    `${LOCALPAY_BASE_URL}?${params.toString()}`;

  console.log(
    "한국조폐공사 API 요청 준비..."
  );

  console.log(
    `API 주소: ${LOCALPAY_BASE_URL}`
  );

  console.log(
    `조회 조건: regionCode=${usageRegionCode ?? "-"}, ksicCode=${ksicCode ?? "-"}, page=${page}, perPage=${perPage}`
  );

  console.log(
    "API 요청 중..."
  );

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
      REQUEST_TIMEOUT_MS
    );

  try {
    const response =
      await fetch(url, {
        method: "GET",
        signal:
          controller.signal,
      });

    console.log(
      `API HTTP 상태: ${response.status}`
    );

    if (!response.ok) {
      throw new Error(
        `한국조폐공사 API 요청 실패: HTTP ${response.status}`
      );
    }

    const responseText =
      await response.text();

    console.log(
      "API 응답 수신 완료."
    );

    let data;

    try {
      data =
        JSON.parse(
          responseText
        );
    } catch {
      throw new Error(
        "한국조폐공사 API 응답을 JSON으로 변환할 수 없습니다."
      );
    }

    console.log(
      "JSON 변환 완료."
    );

    return data;
  } catch (error) {
    if (
      error?.name ===
      "AbortError"
    ) {
      throw new Error(
        `한국조폐공사 API 요청 시간이 초과되었습니다. (${REQUEST_TIMEOUT_MS / 1000}초)`
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 강릉시 지역화폐 전체 가맹점 조회
 *
 * 강릉시 사용처지역코드:
 * 51150
 */
export async function getGangneungMerchants({
  page = 1,
  perPage = 20,
} = {}) {
  return requestLocalPay({
    page,
    perPage,
    usageRegionCode:
      "51150",
  });
}

/**
 * 강릉시 업종별 지역화폐 가맹점 조회
 */
export async function getGangneungMerchantsByKsic({
  ksicCode,
  page = 1,
  perPage = 100,
} = {}) {
  if (!ksicCode) {
    throw new Error(
      "KSIC 코드가 필요합니다."
    );
  }

  return requestLocalPay({
    page,
    perPage,
    usageRegionCode:
      "51150",
    ksicCode,
  });
}

/**
 * 강릉시 연료 소매업 조회
 *
 * API 데이터가 3자리 KSIC를 사용하는 경우를
 * 고려하여 477을 사용합니다.
 *
 * 477 = 연료 소매업
 * 47711 = 운송장비용 주유소 운영업
 */
export async function getGangneungFuelRetailers({
  page = 1,
  perPage = 100,
} = {}) {
  return getGangneungMerchantsByKsic({
    ksicCode: "477",
    page,
    perPage,
  });
}

/**
 * 강릉시 주유소 조회
 *
 * 현재는 477(연료 소매업)으로 먼저 조회한 뒤
 * 실제 반환 데이터에서 주유소만 세분화합니다.
 */
export async function getGangneungGasStations({
  page = 1,
  perPage = 100,
} = {}) {
  return getGangneungFuelRetailers({
    page,
    perPage,
  });
}