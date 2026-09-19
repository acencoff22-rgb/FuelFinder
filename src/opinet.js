import "dotenv/config";

import {
  getCachedStationDetail,
  setCachedStationDetail,
  getOpinetCacheFilePath,
} from "./opinetCache.js";

const OPINET_BASE_URL =
  "https://www.opinet.co.kr/api";

const OPINET_TIMEOUT_MS =
  15000;

/*
 * 오피넷 일반 API는 하루 호출 한도(약 300회)가 있습니다.
 * 서버 메모리에서 한국 시간 기준 하루 호출 수를 세고,
 * 한도에 가까워지면 더 호출하지 않고 안내 메시지를 반환합니다.
 * (Render가 재시작하면 카운터가 0으로 돌아가므로 최선의 안전장치입니다.)
 */
const OPINET_DAILY_LIMIT =
  Number(process.env.OPINET_DAILY_LIMIT) > 0
    ? Number(process.env.OPINET_DAILY_LIMIT)
    : 280;

let opinetUsageDay = "";
let opinetUsageCount = 0;

function getKoreaDateKey() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function countOpinetCall(endpoint) {
  const today = getKoreaDateKey();

  if (opinetUsageDay !== today) {
    opinetUsageDay = today;
    opinetUsageCount = 0;
  }

  if (opinetUsageCount >= OPINET_DAILY_LIMIT) {
    const error = new Error(
      "오피넷 하루 호출 한도에 도달했습니다. 내일 다시 이용해 주세요."
    );
    error.noRetry = true;
    throw error;
  }

  opinetUsageCount += 1;

  console.log(
    `[오피넷 호출] ${endpoint} (${opinetUsageCount}/${OPINET_DAILY_LIMIT})`
  );
}

export function getOpinetUsage() {
  return {
    day: opinetUsageDay,
    count: opinetUsageCount,
    limit: OPINET_DAILY_LIMIT,
  };
}

async function requestOpinet(
  endpoint,
  params = {}
) {
  const certkey =
    process.env.OPINET_CERTKEY;

  if (!certkey) {
    throw new Error(
      "OPINET_CERTKEY가 .env에 설정되어 있지 않습니다."
    );
  }

  countOpinetCall(endpoint);

  const searchParams =
    new URLSearchParams({
      out: "json",
      certkey,
      ...params,
    });

  const url =
    `${OPINET_BASE_URL}/${endpoint}?${searchParams.toString()}`;

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
      OPINET_TIMEOUT_MS
    );

  try {
    const response =
      await fetch(
        url,
        {
          signal:
            controller.signal,
        }
      );

    if (!response.ok) {
      throw new Error(
        `오피넷 API 요청 실패: HTTP ${response.status}`
      );
    }

    const data =
      await response.json();

    const result = data?.RESULT;
    if (result && typeof result === "object") {
      const code = String(result.CODE ?? result.code ?? "").trim();
      const message = String(
        result.MSG ??
          result.msg ??
          result.MESSAGE ??
          result.message ??
          ""
      ).trim();

      if (code || message) {
        const errorText = [
          `code=${code || "unknown"}`,
          message ? `message=${message}` : "",
        ]
          .filter(Boolean)
          .join(" ");

        /* 키 오류·한도 초과 같은 API 응답 오류는 재시도해도 같은 결과이므로 재시도하지 않습니다. */
        const apiError = new Error(
          `오피넷 ${endpoint} API 응답 오류: ${errorText}`
        );
        apiError.noRetry = true;
        throw apiError;
      }
    }

    return data;
  } catch (
    error
  ) {
    if (
      error?.name ===
      "AbortError"
    ) {
      throw new Error(
        `오피넷 API 요청 시간 초과: ${endpoint}`
      );
    }

    throw error;
  } finally {
    clearTimeout(
      timeout
    );
  }
}

export async function getLowPriceStations({
  area,
  productCode = "B027",
  count = 20,
} = {}) {
  return requestOpinet(
    "lowTop10.do",
    {
      prodcd:
        productCode,

      ...(area
        ? {
            area,
          }
        : {}),

      cnt:
        String(
          count
        ),
    }
  );
}

export async function getNearbyStations({
  x,
  y,
  radius = 5000,
  productCode = "B027",
  sort = 1,
} = {}) {
  if (
    typeof x !==
      "number" ||
    !Number.isFinite(
      x
    ) ||
    typeof y !==
      "number" ||
    !Number.isFinite(
      y
    )
  ) {
    throw new Error(
      "오피넷 검색 좌표가 올바르지 않습니다."
    );
  }

  if (
    typeof radius !==
      "number" ||
    !Number.isFinite(
      radius
    ) ||
    radius <= 0 ||
    radius > 5000
  ) {
    throw new Error(
      "검색 반경은 0보다 크고 5000m 이하여야 합니다."
    );
  }

  const maxAttempts = 2;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const data = await requestOpinet(
        "aroundAll.do",
        {
          x: String(x),
          y: String(y),
          radius: String(radius),
          prodcd: productCode,
          sort: String(sort),
        }
      );

      const oil = data?.RESULT?.OIL;
      if (!Array.isArray(oil)) {
        const resultSummary = JSON.stringify(data?.RESULT ?? {}).slice(0, 1200);
        throw new Error(
          `오피넷 주변검색 응답에 OIL 목록이 없습니다: ${resultSummary}`
        );
      }

      return data;
    } catch (error) {
      lastError = error;

      if (error?.noRetry) {
        break;
      }

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("오피넷 주변 주유소 검색에 실패했습니다.");
}

export async function getStationDetail(
  id
) {
  if (
    !id ||
    typeof id !==
      "string"
  ) {
    throw new Error(
      "오피넷 상세조회용 주유소 ID가 올바르지 않습니다."
    );
  }

  /**
   * 캐시 우선
   */
  const cached =
    getCachedStationDetail(
      id
    );

  if (
    cached
  ) {
    console.log(
      `[오피넷 캐시 사용] ${id}`
    );

    return {
      RESULT: {
        OIL:
          cached,
      },
    };
  }

  /**
   * 실제 API 호출
   */
  console.log(
    `[오피넷 상세조회 API] ${id}`
  );

  const data =
    await requestOpinet(
      "detailById.do",
      {
        id,
      }
    );

  const detail =
    extractStationDetail(
      data
    );

  /**
   * 정상 상세정보만 캐시에 저장
   */
  if (
    detail
  ) {
    setCachedStationDetail(
      id,
      detail
    );
  }

  return data;
}

export function extractStationPriceInfo(
  detail,
  productCode = "B027"
) {
  const oilPrices =
    detail?.OIL_PRICE;

  const list =
    Array.isArray(oilPrices)
      ? oilPrices
      : oilPrices && typeof oilPrices === "object"
        ? [oilPrices]
        : [];

  if (list.length === 0) {
    return null;
  }

  const matched =
    list.find(
      (item) =>
        String(item?.PRODCD || "") ===
        String(productCode)
    ) || list[0];

  const tradeDate =
    String(matched?.TRADE_DT || "").trim();

  const tradeTime =
    String(matched?.TRADE_TM || "").trim();

  if (!/^\d{8}$/.test(tradeDate)) {
    return null;
  }

  const year = Number(tradeDate.slice(0, 4));
  const month = Number(tradeDate.slice(4, 6));
  const day = Number(tradeDate.slice(6, 8));

  const hour =
    /^\d{6}$/.test(tradeTime)
      ? Number(tradeTime.slice(0, 2))
      : 0;

  const minute =
    /^\d{6}$/.test(tradeTime)
      ? Number(tradeTime.slice(2, 4))
      : 0;

  const second =
    /^\d{6}$/.test(tradeTime)
      ? Number(tradeTime.slice(4, 6))
      : 0;

  // 오피넷 거래시각은 한국시간(KST) 기준이므로
  // Render 서버의 시간대와 무관하게 UTC로 정확히 변환합니다.
  const updatedAt =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        hour - 9,
        minute,
        second
      )
    );

  if (!Number.isFinite(updatedAt.getTime())) {
    return null;
  }

  return {
    price: Number.isFinite(Number(matched?.PRICE))
      ? Number(matched.PRICE)
      : null,
    productCode: String(matched?.PRODCD || productCode),
    tradeDate,
    tradeTime,
    updatedAt: updatedAt.toISOString(),
  };
}

export function extractStationDetail(
  data
) {
  const oil =
    data?.RESULT?.OIL;

  if (
    Array.isArray(oil)
  ) {
    return (
      oil[0] ??
      null
    );
  }

  if (
    oil &&
    typeof oil ===
      "object"
  ) {
    return oil;
  }

  return null;
}

export async function getNearbyStationsWithDetails({
  x,
  y,
  radius = 5000,
  productCode = "B027",
  sort = 1,
} = {}) {
  const nearbyData =
    await getNearbyStations({
      x,
      y,
      radius,
      productCode,
      sort,
    });

  const oilList =
    nearbyData?.RESULT?.OIL;

  if (
    !Array.isArray(
      oilList
    )
  ) {
    return nearbyData;
  }

  const detailedOilList =
    [];

  for (
    const oil of oilList
  ) {
    const id =
      oil?.UNI_ID;

    if (
      !id
    ) {
      detailedOilList.push(
        oil
      );

      continue;
    }

    try {
      const detailData =
        await getStationDetail(
          id
        );

      const detail =
        extractStationDetail(
          detailData
        );

      if (
        detail
      ) {
        detailedOilList.push(
          {
            ...oil,
            ...detail,

            PRICE:
              oil.PRICE,

            DISTANCE:
              oil.DISTANCE,
          }
        );
      } else {
        detailedOilList.push(
          oil
        );
      }
    } catch (
      error
    ) {
      console.warn(
        `[오피넷 상세조회 실패] ${id}: ${error.message}`
      );

      detailedOilList.push(
        oil
      );
    }
  }

  return {
    ...nearbyData,

    RESULT: {
      ...nearbyData.RESULT,

      OIL:
        detailedOilList,
    },
  };
}

export function getOpinetCachePath() {
  return getOpinetCacheFilePath();
}