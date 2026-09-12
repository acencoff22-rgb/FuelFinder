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

  return requestOpinet(
    "aroundAll.do",
    {
      x:
        String(x),

      y:
        String(y),

      radius:
        String(radius),

      prodcd:
        productCode,

      sort:
        String(sort),
    }
  );
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