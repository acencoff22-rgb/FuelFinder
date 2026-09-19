import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import "dotenv/config";

import { wgs84ToKatec } from "./coordinate.js";

import {
  getNearbyStations,
  getStationDetail,
  extractStationDetail,
  extractStationPriceInfo,
} from "./opinet.js";

import {
  mapOpinetStations,
} from "./opinetMapper.js";

import {
  compareStations,
} from "./station.js";

import {
  getGangneungPayGasStations,
} from "./gangneungPayStations.js";

import {
  matchStationToLocalPay,
} from "./localpayMatcher.js";

import {
  createGangneungPayInfo,
} from "./gangneungPayStatus.js";

const __filename =
  fileURLToPath(import.meta.url);

const __dirname =
  path.dirname(__filename);

const publicDirectory =
  path.join(
    __dirname,
    "../public"
  );

const port =
  Number(
    process.env.PORT || 3000
  );

const host =
  process.env.HOST ||
  "0.0.0.0";

const mimeTypes = {
  ".html":
    "text/html; charset=utf-8",

  ".css":
    "text/css; charset=utf-8",

  ".js":
    "text/javascript; charset=utf-8",

  ".json":
    "application/json; charset=utf-8",
};

const supportedProducts = {
  B027: "보통휘발유",
  B034: "고급휘발유",
  D047: "자동차용경유",
};

const supportedPaymentTypes = [
  "none",
  "percent",
  "fixed",
  "perLiter",
];

/*
 * 주소 검색은 브라우저에서 외부 지오코더를 직접 호출하지 않고
 * Render 서버가 중계합니다.
 *
 * Nominatim(OpenStreetMap)은 공개 서비스이므로 과도한 요청을 막기 위해
 * 동일 검색어를 메모리에 캐시하고, 연속 요청 사이에 최소 간격을 둡니다.
 */
const geocodeCache =
  new Map();

let lastGeocodeRequestAt =
  0;

let geocodeRequestChain =
  Promise.resolve();

const GEOCODE_CACHE_TTL_MS =
  24 * 60 * 60 * 1000;

const GEOCODE_MIN_INTERVAL_MS =
  1100;

// 동일 검색의 반복 호출로 오피넷 쿼터를 불필요하게 소모하지 않도록 60초 캐시
const nearbySearchCache = new Map();
const NEARBY_CACHE_TTL_MS = 60 * 1000;
const NEARBY_CACHE_MAX = 100;

// 가격 기준일은 상세조회에서만 확인할 수 있습니다.
// 오피넷 일반 API의 일일 호출 한도를 고려해 가격순 상위 후보를 우선 확인합니다.
const PRICE_DATE_DETAIL_LIMIT = 6;
const PRICE_STALE_AFTER_DAYS = 2;

const server =
  http.createServer(
    async (
      request,
      response
    ) => {
      try {
        if (
          request.method === "POST" &&
          request.url ===
            "/api/nearby-stations"
        ) {
          await handleNearbyStations(
            request,
            response
          );

          return;
        }

        if (
          request.method === "GET" &&
          request.url.startsWith("/api/geocode")
        ) {
          await handleGeocode(
            request,
            response
          );

          return;
        }

        if (
          request.method === "GET" &&
          request.url === "/api/config"
        ) {
          handlePublicConfig(
            request,
            response
          );

          return;
        }

        if (
          request.method === "GET" &&
          request.url === "/health"
        ) {
          sendJson(
            response,
            200,
            {
              success: true,
              service: "FuelFinder",
            }
          );

          return;
        }

        if (
          request.method === "GET"
        ) {
          await handleStaticFile(
            request,
            response
          );

          return;
        }

        sendJson(
          response,
          405,
          {
            success: false,

            error:
              "허용되지 않는 요청 방식입니다.",
          }
        );
      } catch (
        error
      ) {
        console.error(
          "서버 오류"
        );

        console.error(
          error
        );

        if (
          !response.headersSent
        ) {
          sendJson(
            response,
            500,
            {
              success: false,

              error:
                error instanceof Error
                  ? error.message
                  : "알 수 없는 서버 오류가 발생했습니다.",
            }
          );
        }
      }
    }
  );

function handlePublicConfig(
  _request,
  response
) {
  sendJson(
    response,
    200,
    {
      success: true,
      kakaoJavaScriptKey:
        String(
          process.env.KAKAO_JAVASCRIPT_KEY ||
          ""
        ).trim(),
    }
  );
}

async function handleGeocode(
  request,
  response
) {
  const requestUrl =
    new URL(
      request.url,
      `http://${request.headers.host || "localhost"}`
    );

  const query =
    String(
      requestUrl.searchParams.get("q") ||
      ""
    ).trim();

  if (!query) {
    sendJson(
      response,
      400,
      {
        success: false,
        error:
          "검색할 주소나 장소명을 입력하세요.",
      }
    );

    return;
  }

  if (query.length > 200) {
    sendJson(
      response,
      400,
      {
        success: false,
        error:
          "주소 검색어가 너무 깁니다.",
      }
    );

    return;
  }

  const cacheKey =
    query.toLowerCase();

  const cached =
    geocodeCache.get(
      cacheKey
    );

  if (
    cached &&
    Date.now() - cached.timestamp <
      GEOCODE_CACHE_TTL_MS
  ) {
    sendJson(
      response,
      200,
      {
        success: true,
        results: cached.results,
        cached: true,
      }
    );

    return;
  }

  /*
   * 요청을 직렬화하여 공개 지오코더에
   * 과도한 요청이 나가지 않도록 합니다.
   */
  const runRequest =
    geocodeRequestChain.then(
      async () => {
        const elapsed =
          Date.now() -
          lastGeocodeRequestAt;

        if (
          elapsed <
          GEOCODE_MIN_INTERVAL_MS
        ) {
          await new Promise(
            (resolve) =>
              setTimeout(
                resolve,
                GEOCODE_MIN_INTERVAL_MS -
                  elapsed
              )
          );
        }

        const url =
          new URL(
            "https://nominatim.openstreetmap.org/search"
          );

        url.searchParams.set(
          "q",
          query
        );

        url.searchParams.set(
          "format",
          "jsonv2"
        );

        url.searchParams.set(
          "limit",
          "5"
        );

        url.searchParams.set(
          "countrycodes",
          "kr"
        );

        url.searchParams.set(
          "accept-language",
          "ko"
        );

        lastGeocodeRequestAt =
          Date.now();

        const externalResponse =
          await fetch(
            url,
            {
              headers: {
                Accept:
                  "application/json",
                "User-Agent":
                  "FuelFinder/1.0",
              },
              signal:
                AbortSignal.timeout(
                  8000
                ),
            }
          );

        if (
          !externalResponse.ok
        ) {
          throw new Error(
            `주소 검색 서버 오류: HTTP ${externalResponse.status}`
          );
        }

        const data =
          await externalResponse.json();

        const results =
          Array.isArray(data)
            ? data
                .map(
                  (item) => ({
                    latitude:
                      Number(
                        item.lat
                      ),
                    longitude:
                      Number(
                        item.lon
                      ),
                    label:
                      item.display_name ||
                      query,
                  })
                )
                .filter(
                  (item) =>
                    Number.isFinite(
                      item.latitude
                    ) &&
                    Number.isFinite(
                      item.longitude
                    )
                )
            : [];

        geocodeCache.set(
          cacheKey,
          {
            timestamp:
              Date.now(),
            results,
          }
        );

        /*
         * 메모리 캐시가 무한히 커지지 않도록
         * 오래된 항목을 정리합니다.
         */
        if (
          geocodeCache.size >
          200
        ) {
          const oldestKey =
            geocodeCache.keys().next()
              .value;

          if (oldestKey) {
            geocodeCache.delete(
              oldestKey
            );
          }
        }

        return results;
      }
    );

  /*
   * 한 요청이 실패해도 다음 요청의 체인은 유지합니다.
   */
  geocodeRequestChain =
    runRequest.catch(
      () => undefined
    );

  try {
    const results =
      await runRequest;

    sendJson(
      response,
      200,
      {
        success: true,
        results,
        cached: false,
      }
    );
  } catch (
    error
  ) {
    console.error(
      `[주소 검색 실패] ${error.message}`
    );

    sendJson(
      response,
      502,
      {
        success: false,
        error:
          "주소 검색 서비스를 잠시 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      }
    );
  }
}

async function handleNearbyStations(
  request,
  response
) {
  const body =
    await readJsonBody(
      request
    );

  const latitude =
    Number(
      body.latitude
    );

  const longitude =
    Number(
      body.longitude
    );

  const radius =
    body.radius === undefined
      ? 5000
      : Number(
          body.radius
        );

  const productCode =
    body.productCode ||
    "B027";

  const liters =
    Number(
      body.liters
    );

  const fuelEfficiency =
    Number(
      body.fuelEfficiency
    );

  const paymentOption =
    normalizePaymentOption(
      body.paymentOption
    );

  const discounts =
    normalizeDiscounts(
      body.discounts
    );

  validateLocation(
    latitude,
    longitude
  );

  validateRadius(
    radius
  );

  validateProductCode(
    productCode
  );

  validateVehicle(
    liters,
    fuelEfficiency
  );

  const nearbyCacheKey = JSON.stringify({
    latitude: Number(latitude.toFixed(5)),
    longitude: Number(longitude.toFixed(5)),
    radius,
    productCode,
    liters,
    fuelEfficiency,
    paymentOption,
    discounts,
  });

  const nearbyCached = nearbySearchCache.get(nearbyCacheKey);
  if (nearbyCached && Date.now() - nearbyCached.timestamp < NEARBY_CACHE_TTL_MS) {
    sendJson(response, 200, { ...nearbyCached.data, cached: true });
    return;
  }

  const katec =
    wgs84ToKatec({
      latitude,
      longitude,
    });

  console.log("");

  console.log(
    "===== 주변 주유소 검색 ====="
  );

  console.log(
    `유종: ${supportedProducts[productCode]}`
  );

  console.log(
    `WGS84: ${latitude}, ${longitude}`
  );

  console.log(
    `KATEC: X=${katec.x.toFixed(
      3
    )}, Y=${katec.y.toFixed(
      3
    )}`
  );

  if (
    discounts.length >
    0
  ) {
    console.log(
      `등록된 할인: ${discounts.length}개 (${discounts
        .map(
          (d) =>
            d.label ||
            d.type
        )
        .join(
          ", "
        )})`
    );
  } else {
    console.log(
      `할인 방식: ${paymentOption.type}`
    );

    if (
      paymentOption.type ===
      "percent"
    ) {
      console.log(
        `할인율: ${paymentOption.rate}%`
      );

      if (
        paymentOption.requiresLocalPayMatch
      ) {
        console.log(
          "강릉페이 가맹점 매칭 확인 후 할인 적용"
        );
      }
    }

    if (
      paymentOption.type ===
      "fixed"
    ) {
      console.log(
        `정액 할인: ${paymentOption.amount}원`
      );

      if (
        paymentOption.requiresLocalPayMatch
      ) {
        console.log(
          "강릉페이 가맹점 매칭 확인 후 할인 적용"
        );
      }
    }
  }

  const data =
    await getNearbyStations({
      x: katec.x,
      y: katec.y,
      radius,
      productCode,
      sort: 1,
    });

  const stations =
    mapOpinetStations(
      data
    );

  console.log(
    `오피넷 검색 결과: ${stations.length}개`
  );

  const gangneungPayStations =
    getGangneungPayGasStations();

  console.log(
    `강릉페이 공식 가맹 일반 주유소: ${gangneungPayStations.length}개`
  );

  /**
   * 1차 매칭
   *
   * aroundAll의 기본 상호명/주소를 이용합니다.
   *
   * 매칭 확정 후보뿐 아니라
   * 확인이 필요한 후보도 상세조회 대상으로 넣습니다.
   */
  const preliminary =
    stations.map(
      (station) => ({
        station,

        result:
          matchStationToLocalPay(
            station,
            gangneungPayStations
          ),
      })
    );

  const localPayDetailTargets =
    preliminary.filter(
      ({ result }) =>
        result.matchStatus === "matched" ||
        result.matchStatus === "ambiguous" ||
        result.reviewRequired === true
    );

  // 가격 기준일 표시를 위해 현재 가격이 낮은 후보도 일부 상세조회합니다.
  // 오피넷 일반 API 호출 한도를 고려하여 무제한으로 상세조회하지 않습니다.
  const priceDateTargets = stations
    .slice(0, PRICE_DATE_DETAIL_LIMIT)
    .map((station) => ({ station }));

  const detailTargetMap = new Map();

  for (const item of [
    ...localPayDetailTargets,
    ...priceDateTargets,
  ]) {
    if (item?.station?.id) {
      detailTargetMap.set(
        item.station.id,
        item.station
      );
    }
  }

  const detailTargets =
    [...detailTargetMap.values()];

  const detailedStations =
    new Map();

  for (const station of detailTargets) {
    if (!station.id) {
      continue;
    }

    try {
      const detailData =
        await getStationDetail(
          station.id
        );

      const detail =
        extractStationDetail(
          detailData
        );

      if (detail) {
        const priceInfo =
          extractStationPriceInfo(
            detail,
            productCode
          );

        detailedStations.set(
          station.id,
          {
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

            priceUpdate:
              priceInfo
                ? createPriceUpdateInfo(
                    priceInfo
                  )
                : null,
          }
        );
      }
    } catch (error) {
      console.warn(
        `[오피넷 상세조회 실패] ${station.id}: ${error.message}`
      );
    }
  }

  console.log(
    `상세조회 대상: ${detailTargets.length}개`
  );

  /**
   * 상세조회 결과를 반영한
   * 최종 강릉페이 매칭
   */
  const enrichedStations =
    stations.map(
      (station) => {
        const finalStation =
          detailedStations.get(
            station.id
          ) ||
          station;

        const matchResult =
          matchStationToLocalPay(
            finalStation,
            gangneungPayStations
          );

        return {
          ...finalStation,

          localPayMatch:
            matchResult,

          gangneungPay:
            createGangneungPayInfo(
              matchResult
            ),
        };
      }
    );

  const calculatedStations =
    compareStations(
      enrichedStations,
      {
        liters,

        fuelEfficiency,

        paymentOption,

        discounts,
      }
    );

  const eligibleStationCount =
    calculatedStations.filter(
      (station) =>
        station
          .appliedPaymentOption
          ?.eligible === true
    ).length;

  const responseData = {
    success: true,

    userLocation: {
        latitude,

        longitude,

        katec,
      },

      radius,

      productCode,

      productName:
        supportedProducts[
          productCode
        ],

      vehicle: {
        liters,

        fuelEfficiency,
      },

      paymentOption,

      discounts,

      gangneungPay: {
        officialGasStationCount:
          gangneungPayStations.length,

        discountApplied:
          eligibleStationCount > 0,

        eligibleStationCount,

        discountPolicyStatus:
          getDiscountPolicyStatus(
            paymentOption,
            discounts
          ),
      },

      priceUpdateSummary:
        createPriceUpdateSummary(
          calculatedStations
        ),

      stationCount:
        calculatedStations.length,

      stations:
        calculatedStations,
    };

  nearbySearchCache.set(nearbyCacheKey, {
    timestamp: Date.now(),
    data: responseData,
  });

  if (nearbySearchCache.size > NEARBY_CACHE_MAX) {
    const oldestKey = nearbySearchCache.keys().next().value;
    if (oldestKey) nearbySearchCache.delete(oldestKey);
  }

  sendJson(response, 200, responseData);
}

function createPriceUpdateInfo(priceInfo) {
  const updatedAt =
    new Date(priceInfo.updatedAt);

  if (!Number.isFinite(updatedAt.getTime())) {
    return null;
  }

  const ageMs =
    Math.max(
      0,
      Date.now() - updatedAt.getTime()
    );

  const ageDays =
    Math.floor(
      ageMs /
      (24 * 60 * 60 * 1000)
    );

  return {
    productCode: priceInfo.productCode,
    tradeDate: priceInfo.tradeDate,
    tradeTime: priceInfo.tradeTime,
    updatedAt: priceInfo.updatedAt,
    ageDays,
    status:
      ageDays >= PRICE_STALE_AFTER_DAYS
        ? "stale"
        : ageDays >= 1
          ? "recent"
          : "fresh",
  };
}

function createPriceUpdateSummary(stations) {
  const list =
    Array.isArray(stations)
      ? stations
      : [];

  const withDate =
    list.filter(
      (station) =>
        station?.priceUpdate?.updatedAt
    );

  const staleCount =
    withDate.filter(
      (station) =>
        station.priceUpdate.status === "stale"
    ).length;

  return {
    checkedCount: withDate.length,
    unknownCount: Math.max(
      0,
      list.length - withDate.length
    ),
    staleCount,
    staleAfterDays: PRICE_STALE_AFTER_DAYS,
  };
}

function getDiscountPolicyStatus(
  paymentOption,
  discounts
) {
  if (
    Array.isArray(
      discounts
    ) &&
    discounts.length >
      0
  ) {
    return discounts.some(
      (discount) =>
        discount.requiresLocalPayMatch
    )
      ? "local-pay-match-required"
      : "configured";
  }

  if (
    !paymentOption ||
    paymentOption.type ===
      "none"
  ) {
    return "not-configured";
  }

  if (
    paymentOption.requiresLocalPayMatch
  ) {
    return "local-pay-match-required";
  }

  return "configured";
}

function normalizePaymentOption(
  value
) {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return {
      type: "none",
    };
  }

  const type =
    String(
      value.type ||
        "none"
    );

  if (
    !supportedPaymentTypes.includes(
      type
    )
  ) {
    throw new Error(
      "지원하지 않는 할인 방식입니다."
    );
  }

  if (
    type === "none"
  ) {
    return {
      type: "none",
    };
  }

  /**
   * 강릉페이 등
   * 특정 가맹점 매칭이 필요한 할인인지
   * 서버에서도 반드시 보존합니다.
   */
  const requiresLocalPayMatch =
    value.requiresLocalPayMatch ===
    true;

  /**
   * 여러 할인을 등록할 때(예: "강릉페이", "A카드")
   * 화면에 표시할 이름과, 특정 정유사 브랜드에서만
   * 적용되는 카드인지 여부입니다. 단일 paymentOption
   * 방식(하위 호환)에서는 보통 비어 있습니다.
   */
  const label =
    typeof value.label ===
      "string" &&
    value.label.trim()
      ? value.label
          .trim()
          .slice(0, 30)
      : null;

  const brandCode =
    typeof value.brandCode ===
      "string" &&
    value.brandCode.trim()
      ? value.brandCode
          .trim()
          .toUpperCase()
          .slice(0, 10)
      : null;

  if (
    type === "percent"
  ) {
    const rate =
      Number(
        value.rate
      );

    const maxDiscount =
      value.maxDiscount ===
        null ||
      value.maxDiscount ===
        undefined ||
      value.maxDiscount ===
        ""
        ? null
        : Number(
            value.maxDiscount
          );

    if (
      !Number.isFinite(
        rate
      ) ||
      rate < 0 ||
      rate > 100
    ) {
      throw new Error(
        "할인율은 0 이상 100 이하이어야 합니다."
      );
    }

    if (
      maxDiscount !==
        null &&
      (
        !Number.isFinite(
          maxDiscount
        ) ||
        maxDiscount < 0
      )
    ) {
      throw new Error(
        "최대 할인액이 올바르지 않습니다."
      );
    }

    return {
      type: "percent",

      rate,

      maxDiscount,

      requiresLocalPayMatch,

      label,

      brandCode,
    };
  }

  if (
    type === "fixed"
  ) {
    const amount =
      Number(
        value.amount
      );

    if (
      !Number.isFinite(
        amount
      ) ||
      amount < 0
    ) {
      throw new Error(
        "정액 할인액이 올바르지 않습니다."
      );
    }

    return {
      type: "fixed",

      amount,

      requiresLocalPayMatch,

      label,

      brandCode,
    };
  }

  if (
    type === "perLiter"
  ) {
    const rate =
      Number(
        value.rate
      );

    if (
      !Number.isFinite(
        rate
      ) ||
      rate < 0
    ) {
      throw new Error(
        "리터당 할인액이 올바르지 않습니다."
      );
    }

    return {
      type: "perLiter",

      rate,

      requiresLocalPayMatch,

      label,

      brandCode,
    };
  }

  throw new Error(
    "할인 옵션을 확인할 수 없습니다."
  );
}

const MAX_DISCOUNTS = 10;

/**
 * 여러 할인 등록(discounts) 배열을 검증합니다.
 * 항목별 검증은 normalizePaymentOption을 그대로 재사용하고,
 * type이 "none"인 항목(빈 값)은 조용히 걸러냅니다.
 */
function normalizeDiscounts(
  value
) {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }

  if (
    value.length >
    MAX_DISCOUNTS
  ) {
    throw new Error(
      `할인은 최대 ${MAX_DISCOUNTS}개까지 등록할 수 있습니다.`
    );
  }

  return value
    .map(
      normalizePaymentOption
    )
    .filter(
      (discount) =>
        discount.type !==
        "none"
    );
}

function validateLocation(
  latitude,
  longitude
) {
  if (
    !Number.isFinite(
      latitude
    ) ||
    !Number.isFinite(
      longitude
    )
  ) {
    throw new Error(
      "위도와 경도가 올바른 숫자가 아닙니다."
    );
  }

  if (
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error(
      "위치 좌표 범위가 올바르지 않습니다."
    );
  }
}

function validateRadius(
  radius
) {
  if (
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
}

function validateProductCode(
  productCode
) {
  if (
    !Object.prototype.hasOwnProperty.call(
      supportedProducts,
      productCode
    )
  ) {
    throw new Error(
      "지원하지 않는 유종입니다."
    );
  }
}

function validateVehicle(
  liters,
  fuelEfficiency
) {
  if (
    !Number.isFinite(
      liters
    ) ||
    liters <= 0
  ) {
    throw new Error(
      "주유량은 0보다 커야 합니다."
    );
  }

  if (
    !Number.isFinite(
      fuelEfficiency
    ) ||
    fuelEfficiency <= 0
  ) {
    throw new Error(
      "차량 연비는 0보다 커야 합니다."
    );
  }
}

async function handleStaticFile(
  request,
  response
) {
  let requestPath =
    request.url;

  if (
    !requestPath ||
    requestPath === "/"
  ) {
    requestPath =
      "/index.html";
  }

  const decodedPath =
    decodeURIComponent(
      requestPath
        .split("?")[0]
    );

  const filePath =
    path.join(
      publicDirectory,
      decodedPath
    );

  const normalizedPublicDirectory =
    path.resolve(
      publicDirectory
    );

  const normalizedFilePath =
    path.resolve(
      filePath
    );

  if (
    !normalizedFilePath.startsWith(
      normalizedPublicDirectory +
        path.sep
    ) &&
    normalizedFilePath !==
      normalizedPublicDirectory
  ) {
    response.writeHead(
      403,
      {
        "Content-Type":
          "text/plain; charset=utf-8",
      }
    );

    response.end(
      "Forbidden"
    );

    return;
  }

  fs.readFile(
    normalizedFilePath,
    (
      error,
      data
    ) => {
      if (error) {
        response.writeHead(
          404,
          {
            "Content-Type":
              "text/plain; charset=utf-8",
          }
        );

        response.end(
          "페이지를 찾을 수 없습니다."
        );

        return;
      }

      const extension =
        path.extname(
          normalizedFilePath
        );

      const contentType =
        mimeTypes[
          extension
        ] ||
        "application/octet-stream";

      response.writeHead(
        200,
        {
          "Content-Type":
            contentType,
        }
      );

      response.end(
        data
      );
    }
  );
}

function readJsonBody(
  request
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      let body = "";

      request.on(
        "data",
        (
          chunk
        ) => {
          body += chunk;

          if (
            body.length >
            100_000
          ) {
            reject(
              new Error(
                "요청 데이터가 너무 큽니다."
              )
            );

            request.destroy();
          }
        }
      );

      request.on(
        "end",
        () => {
          try {
            if (!body) {
              resolve({});
              return;
            }

            resolve(
              JSON.parse(
                body
              )
            );
          } catch {
            reject(
              new Error(
                "JSON 형식의 요청 데이터를 읽을 수 없습니다."
              )
            );
          }
        }
      );

      request.on(
        "error",
        reject
      );
    }
  );
}

function sendJson(
  response,
  statusCode,
  data
) {
  response.writeHead(
    statusCode,
    {
      "Content-Type":
        "application/json; charset=utf-8",
    }
  );

  response.end(
    JSON.stringify(
      data
    )
  );
}

server.listen(
  port,
  host,
  () => {
    console.log(
      "===== FuelFinder 웹 서버 ====="
    );

    console.log("");

    console.log(
      `서버가 ${host}:${port} 에서 실행 중입니다.`
    );

    console.log("");

    console.log(
      "오피넷 주변 주유소 + 실질 주유비 + 강릉페이 가맹 여부가 연결되어 있습니다."
    );

    console.log("");

    console.log(
      "지원 유종: 보통휘발유 / 고급휘발유 / 자동차용경유"
    );

    console.log("");

    console.log(
      "서버를 종료하려면 Ctrl + C를 누르세요."
    );
  }
);
