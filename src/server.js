import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import "dotenv/config";

import { wgs84ToKatec } from "./coordinate.js";
import {
  buildExtendedSearchCenters,
  katecDistanceMeters,
} from "./searchGeometry.js";

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

const OPINET_MAX_RADIUS_METERS = 5000;
const APP_MAX_RADIUS_METERS = 10000;
const EXTENDED_SEARCH_CENTER_OFFSET_METERS = 7000;
const EXTENDED_SEARCH_CENTER_COUNT = 7;

const frontendOrigins =
  String(
    process.env.FRONTEND_ORIGINS ||
      "https://fuelfinder-web.onrender.com,http://localhost:3000,http://127.0.0.1:3000"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

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

// Kakao Local 권한 오류(401/403)는 반복 호출해도 같은 결과이므로
// 잠시 회로 차단하고 OpenStreetMap fallback으로 바로 넘어갑니다.
const KAKAO_LOCAL_FAILURE_COOLDOWN_MS = 5 * 60 * 1000;
let kakaoLocalDisabledUntil = 0;

const GEOCODE_CACHE_TTL_MS =
  24 * 60 * 60 * 1000;

const GEOCODE_MIN_INTERVAL_MS =
  1100;

// 동일 검색의 반복 호출로 오피넷 쿼터를 불필요하게 소모하지 않도록 60초 캐시
const nearbySearchCache = new Map();
const NEARBY_CACHE_TTL_MS = 60 * 1000;
const NEARBY_CACHE_MAX = 100;

// 오피넷 자체 조회는 사용자 차량 설정과 무관하므로 별도 캐시합니다.
// 주유량/연비/할인을 바꿔도 같은 위치·반경·유종이면 오피넷을 다시 호출하지 않습니다.
const opinetNearbyCache = new Map();
const OPINET_NEARBY_CACHE_TTL_MS = 10 * 60 * 1000;
const OPINET_NEARBY_CACHE_MAX = 200;
// 오피넷이 실패했을 때 최대 3시간 전 조회 결과까지는 대신 보여줍니다.
const OPINET_STALE_FALLBACK_MS = 3 * 60 * 60 * 1000;

// 가격 기준일은 상세조회에서만 확인할 수 있습니다.
// 오피넷 일반 API의 일일 호출 한도를 고려해 가격순 상위 후보를 우선 확인합니다.
const PRICE_DATE_DETAIL_LIMIT = 6;
const PRICE_STALE_AFTER_DAYS = 3;

const server =
  http.createServer(
    async (
      request,
      response
    ) => {
      try {
        applyCorsHeaders(
          request,
          response
        );

        if (request.method === "OPTIONS") {
          response.writeHead(204);
          response.end();
          return;
        }

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
          request.url.startsWith("/api/reverse-geocode")
        ) {
          await handleReverseGeocode(
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
          const errorMessage =
            error instanceof Error
              ? error.message
              : "알 수 없는 서버 오류가 발생했습니다.";

          const upstreamError =
            errorMessage.includes("오피넷") ||
            errorMessage.includes("Kakao REST API");

          sendJson(
            response,
            upstreamError ? 502 : 500,
            {
              success: false,
              error: errorMessage,
            }
          );
        }
      }
    }
  );

function applyCorsHeaders(
  request,
  response
) {
  const origin =
    String(
      request.headers.origin ||
        ""
    ).trim();

  if (origin) {
    const requestHost =
      String(
        request.headers.host ||
          ""
      ).trim();

    const sameOrigin =
      requestHost &&
      ((origin === `http://${requestHost}`) ||
        (origin === `https://${requestHost}`));

    const configuredWildcard =
      frontendOrigins.includes("*");

    // 공개 브라우저 API라도 모든 *.onrender.com 사이트를 허용하면
    // 제3자가 브라우저에서 FuelFinder API를 호출해 Opinet 쿼터를 소모시킬 수 있습니다.
    // 따라서 기본적으로는 명시된 FRONTEND_ORIGINS만 허용합니다.
    const allowed =
      sameOrigin ||
      configuredWildcard ||
      frontendOrigins.includes(origin);

    if (configuredWildcard) {
      response.setHeader(
        "Access-Control-Allow-Origin",
        "*"
      );
      response.setHeader(
        "Vary",
        "Origin"
      );
    } else if (allowed) {
      response.setHeader(
        "Access-Control-Allow-Origin",
        origin
      );
      response.setHeader(
        "Vary",
        "Origin"
      );
    }
  }

  response.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept"
  );

  response.setHeader(
    "Access-Control-Max-Age",
    "600"
  );
}

async function fetchKakaoRestJson(pathname, params) {
  const key = String(process.env.KAKAO_REST_API_KEY || "").trim();
  if (!key) {
    console.warn("[카카오 REST API] KAKAO_REST_API_KEY가 없어 OpenStreetMap을 사용합니다.");
    return null;
  }

  if (Date.now() < kakaoLocalDisabledUntil) {
    const error = new Error(
      "Kakao Local API가 최근 권한 오류를 반환해 잠시 OpenStreetMap fallback을 사용합니다."
    );
    error.kakaoLocalUnavailable = true;
    throw error;
  }

  const url = new URL(`https://dapi.kakao.com${pathname}`);
  for (const [name, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && String(value) !== "") {
      url.searchParams.set(name, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `KakaoAK ${key}`,
    },
    signal: AbortSignal.timeout(8000),
  });

  const responseText = await response.text();
  let responseData = null;

  try {
    responseData = responseText ? JSON.parse(responseText) : null;
  } catch {
    responseData = null;
  }

  if (!response.ok) {
    const errorCode =
      responseData && responseData.code !== undefined
        ? Number(responseData.code)
        : null;
    const rawMessage =
      responseData && responseData.msg
        ? String(responseData.msg)
        : "";

    let hint = "";
    if (response.status === 401 || errorCode === -401) {
      hint = " REST API 키가 유효한지 확인하세요.";
    } else if (response.status === 403 && errorCode === -3) {
      hint = " 카카오디벨로퍼스 앱의 사용 가능 API에서 Local API 허용 여부를 확인하세요.";
    } else if (response.status === 403) {
      hint = " 카카오디벨로퍼스에서 해당 API 사용 권한을 확인하세요.";
    }

    if (response.status === 401 || response.status === 403) {
      kakaoLocalDisabledUntil = Date.now() + KAKAO_LOCAL_FAILURE_COOLDOWN_MS;
    }

    const detail = [
      `HTTP ${response.status}`,
      errorCode !== null && Number.isFinite(errorCode) ? `code=${errorCode}` : "",
      rawMessage ? `message=${rawMessage}` : "",
    ].filter(Boolean).join(" ");

    throw new Error(`Kakao REST API ${detail}.${hint}`);
  }

  return responseData;
}

function normalizeKakaoAddressResult(document, fallbackLabel = "주소") {
  const latitude = Number(document?.y);
  const longitude = Number(document?.x);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const road = String(document?.road_address?.address_name || "").trim();
  const jibun = String(document?.address?.address_name || "").trim();
  const label = road || jibun || String(document?.address_name || fallbackLabel).trim();
  const detail = [road && jibun && road !== jibun ? jibun : "", String(document?.address?.zone_no || document?.road_address?.zone_no || "").trim()]
    .filter(Boolean)
    .join(" · ");

  return { latitude, longitude, label, detail, source: "kakao" };
}

async function geocodeWithKakao(query) {
  const addressData = await fetchKakaoRestJson("/v2/local/search/address.json", {
    query,
    size: 5,
  });

  const addressDocuments = Array.isArray(addressData?.documents)
    ? addressData.documents
    : [];

  const addressResults = addressDocuments
    .map((document) => normalizeKakaoAddressResult(document, query))
    .filter(Boolean);

  if (addressResults.length > 0) {
    return addressResults;
  }

  // 주소가 아니라 역/시설/장소명을 입력한 경우에도 검색되도록
  // Kakao Local 키워드 검색을 이어서 시도합니다.
  const keywordData = await fetchKakaoRestJson("/v2/local/search/keyword.json", {
    query,
    size: 5,
  });

  const keywordDocuments = Array.isArray(keywordData?.documents)
    ? keywordData.documents
    : [];

  return keywordDocuments
    .map((document) => {
      const latitude = Number(document?.y);
      const longitude = Number(document?.x);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
      }

      const placeName = String(document?.place_name || query).trim();
      const road = String(document?.road_address_name || "").trim();
      const jibun = String(document?.address_name || "").trim();

      return {
        latitude,
        longitude,
        label: placeName,
        detail: road || jibun,
        source: "kakao",
      };
    })
    .filter(Boolean);
}

async function reverseGeocodeWithKakao(latitude, longitude) {
  const data = await fetchKakaoRestJson("/v2/local/geo/coord2address.json", {
    x: longitude,
    y: latitude,
    input_coord: "WGS84",
  });

  const document = Array.isArray(data?.documents) ? data.documents[0] : null;
  return document ? normalizeKakaoAddressResult(document, "현재 위치") : null;
}

function normalizeKakaoRegionResult(document, fallbackLabel = "현재 위치") {
  const latitude = Number(document?.y);
  const longitude = Number(document?.x);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const city = String(document?.region_1depth_name || "").trim();
  const district = String(document?.region_2depth_name || "").trim();
  const dong = String(document?.region_3depth_name || "").trim();
  const ri = String(document?.region_4depth_name || "").trim();

  const shortLabel = dong || ri || district || city || fallbackLabel;
  const fullRegion = [city, district, dong || ri].filter(Boolean).join(" ");

  return {
    latitude,
    longitude,
    label: shortLabel,
    detail: fullRegion || String(document?.address_name || "").trim(),
    source: "kakao-region",
  };
}

async function reverseGeocodeRegionWithKakao(latitude, longitude) {
  const data = await fetchKakaoRestJson("/v2/local/geo/coord2regioncode.json", {
    x: longitude,
    y: latitude,
    input_coord: "WGS84",
  });

  const documents = Array.isArray(data?.documents) ? data.documents : [];
  const administrative = documents.find((document) => document?.region_type === "H");
  const legal = documents.find((document) => document?.region_type === "B");
  return normalizeKakaoRegionResult(administrative || legal, "현재 위치");
}

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

async function handleReverseGeocode(request, response) {
  const requestUrl = new URL(
    request.url,
    `http://${request.headers.host || "localhost"}`
  );

  const latitude = Number(requestUrl.searchParams.get("lat"));
  const longitude = Number(requestUrl.searchParams.get("lon"));

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    sendJson(response, 400, { success: false, error: "좌표가 올바르지 않습니다." });
    return;
  }

  const cacheKey = `reverse:${latitude.toFixed(5)},${longitude.toFixed(5)}`;
  const cached = geocodeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < GEOCODE_CACHE_TTL_MS) {
    sendJson(response, 200, { success: true, result: cached.result, cached: true });
    return;
  }

  const runRequest = geocodeRequestChain.then(async () => {
    let result = null;
    let kakaoFailure = null;

    try {
      result = await reverseGeocodeWithKakao(latitude, longitude);
    } catch (error) {
      kakaoFailure = error;
      console.warn(`[카카오 역지오코딩 실패] ${error.message}`);
    }

    if (!result && !kakaoFailure?.kakaoLocalUnavailable) {
      try {
        result = await reverseGeocodeRegionWithKakao(latitude, longitude);
      } catch (error) {
        console.warn(`[카카오 행정구역 역지오코딩 실패] ${error.message}`);
      }
    }

    if (!result) {
      const url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.searchParams.set("lat", String(latitude));
      url.searchParams.set("lon", String(longitude));
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("zoom", "18");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("accept-language", "ko");
      url.searchParams.set("layer", "address");

      const elapsed = Date.now() - lastGeocodeRequestAt;
      if (elapsed < GEOCODE_MIN_INTERVAL_MS) {
        await new Promise((resolve) => setTimeout(resolve, GEOCODE_MIN_INTERVAL_MS - elapsed));
      }

      lastGeocodeRequestAt = Date.now();
      const externalResponse = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "FuelFinder/1.0 (address lookup)",
        },
        signal: AbortSignal.timeout(8000),
      });

      if (externalResponse.ok) {
        const data = await externalResponse.json();
        const address = data?.address || {};
        const road = String(address.road || "").trim();
        const house = String(address.house_number || "").trim();
        const localArea = String(
          address.suburb ||
          address.city_district ||
          address.neighbourhood ||
          address.village ||
          address.town ||
          address.municipality ||
          address.county ||
          address.city ||
          ""
        ).trim();
        const state = String(address.state || "").trim();
        const displayName = String(data?.display_name || "").trim();

        if (road || house || localArea || displayName) {
          result = {
            latitude,
            longitude,
            label: road
              ? `${road}${house ? ` ${house}` : ""}`
              : (localArea || displayName || "현재 위치"),
            detail: localArea && road
              ? localArea
              : (displayName || [state, localArea].filter(Boolean).join(" ")),
            source: "nominatim",
          };
        }
      } else {
        console.warn(`[Nominatim 역지오코딩 실패] HTTP ${externalResponse.status}`);
      }
    }

    if (result) {
      geocodeCache.set(cacheKey, { timestamp: Date.now(), result });
      if (geocodeCache.size > 300) {
        const oldestKey = geocodeCache.keys().next().value;
        if (oldestKey) geocodeCache.delete(oldestKey);
      }
    }

    return result;
  });

  geocodeRequestChain = runRequest.catch(() => undefined);

  try {
    const result = await runRequest;
    if (!result) {
      sendJson(response, 200, { success: true, result: null, cached: false });
      return;
    }
    sendJson(response, 200, { success: true, result, cached: false });
  } catch (error) {
    console.error(`[역지오코딩 실패] ${error.message}`);
    sendJson(response, 502, { success: false, error: "현재 위치의 주소를 확인하지 못했습니다." });
  }
}

async function handleGeocode(request, response) {
  const requestUrl = new URL(
    request.url,
    `http://${request.headers.host || "localhost"}`
  );

  const query = String(requestUrl.searchParams.get("q") || "").trim();

  if (!query) {
    sendJson(response, 400, {
      success: false,
      error: "검색할 주소나 장소명을 입력하세요.",
    });
    return;
  }

  if (query.length > 200) {
    sendJson(response, 400, {
      success: false,
      error: "주소 검색어가 너무 깁니다.",
    });
    return;
  }

  const normalizedQuery = query.replace(/\s+/g, " ").trim();
  const cacheKey = `forward:${normalizedQuery.toLowerCase()}`;
  const cached = geocodeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < GEOCODE_CACHE_TTL_MS) {
    sendJson(response, 200, {
      success: true,
      results: cached.results,
      cached: true,
      provider: cached.provider || "cache",
    });
    return;
  }

  const runRequest = geocodeRequestChain.then(async () => {
    let results = [];
    let provider = "";

    try {
      results = await geocodeWithKakao(normalizedQuery);
      if (results.length > 0) {
        provider = "kakao";
      }
    } catch (error) {
      console.warn(`[카카오 주소 검색 실패] ${error.message}`);
    }

    if (results.length === 0) {
      const elapsed = Date.now() - lastGeocodeRequestAt;
      if (elapsed < GEOCODE_MIN_INTERVAL_MS) {
        await new Promise((resolve) => setTimeout(resolve, GEOCODE_MIN_INTERVAL_MS - elapsed));
      }

      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", normalizedQuery);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "5");
      url.searchParams.set("countrycodes", "kr");
      url.searchParams.set("accept-language", "ko");
      url.searchParams.set("addressdetails", "1");
      lastGeocodeRequestAt = Date.now();

      const externalResponse = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "FuelFinder/1.0",
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!externalResponse.ok) {
        throw new Error(`주소 검색 서버 오류: HTTP ${externalResponse.status}`);
      }

      const data = await externalResponse.json();
      results = Array.isArray(data)
        ? data
            .map((item) => {
              const address = item?.address || {};
              const road = String(address.road || "").trim();
              const house = String(address.house_number || "").trim();
              const dong = String(address.suburb || address.city_district || address.neighbourhood || "").trim();
              return {
                latitude: Number(item.lat),
                longitude: Number(item.lon),
                label: road ? `${road}${house ? ` ${house}` : ""}` : (item.display_name || query),
                detail: dong ? dong : String(item.display_name || query),
              };
            })
            .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
        : [];
      provider = results.length > 0 ? "nominatim" : "";
    }

    geocodeCache.set(cacheKey, {
      timestamp: Date.now(),
      results,
      provider,
    });

    if (geocodeCache.size > 300) {
      const oldestKey = geocodeCache.keys().next().value;
      if (oldestKey) geocodeCache.delete(oldestKey);
    }

    return { results, provider };
  });

  geocodeRequestChain = runRequest.catch(() => undefined);

  try {
    const { results, provider } = await runRequest;
    sendJson(response, 200, {
      success: true,
      results,
      cached: false,
      provider: provider || null,
    });
  } catch (error) {
    console.error(`[주소 검색 실패] ${error.message}`);
    sendJson(response, 502, {
      success: false,
      error: "주소 검색 서비스를 잠시 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    });
  }
}

async function parseNearbyRequest(request) {
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

  const payOnly =
    body.payOnly === true;

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

  return {
    latitude,
    longitude,
    radius,
    productCode,
    liters,
    fuelEfficiency,
    paymentOption,
    discounts,
    payOnly,
  };
}

async function handleNearbyStations(
  request,
  response
) {
  /*
   * 요청 값 검증 실패는 서버 오류(500)가 아니라 잘못된 요청(400)입니다.
   */
  let latitude;
  let longitude;
  let radius;
  let productCode;
  let liters;
  let fuelEfficiency;
  let paymentOption;
  let discounts;
  let payOnly;

  try {
    ({
      latitude,
      longitude,
      radius,
      productCode,
      liters,
      fuelEfficiency,
      paymentOption,
      discounts,
      payOnly,
    } = await parseNearbyRequest(request));
  } catch (error) {
    sendJson(response, 400, {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "요청 값이 올바르지 않습니다.",
    });

    return;
  }

  const nearbyCacheKey = JSON.stringify({
    latitude: Number(latitude.toFixed(5)),
    longitude: Number(longitude.toFixed(5)),
    radius,
    productCode,
    liters,
    fuelEfficiency,
    paymentOption,
    discounts,
    payOnly,
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

  const opinetCacheKey = JSON.stringify({
    x: Math.round(katec.x / 25),
    y: Math.round(katec.y / 25),
    radius,
    productCode,
  });

  const cachedOpinet = opinetNearbyCache.get(opinetCacheKey);
  let data;
  let staleAgeMinutes = null;

  if (cachedOpinet && Date.now() - cachedOpinet.timestamp < OPINET_NEARBY_CACHE_TTL_MS) {
    data = cachedOpinet.data;
    console.log("[오피넷 주변검색 캐시 사용]");
  } else {
    try {
      data = await getNearbyStationsWithinRadius({
        x: katec.x,
        y: katec.y,
        radius,
        productCode,
        sort: 1,
      });
    } catch (error) {
      /*
       * 오피넷 장애·호출 한도 초과일 때 아무것도 못 보여주는 대신,
       * 같은 위치의 오래된 조회 결과가 있으면 그것을 표시하고 화면에 알립니다.
       */
      if (cachedOpinet && Date.now() - cachedOpinet.timestamp < OPINET_STALE_FALLBACK_MS) {
        data = cachedOpinet.data;
        staleAgeMinutes = Math.max(1, Math.round((Date.now() - cachedOpinet.timestamp) / 60000));
        console.warn(`[오피넷 조회 실패 → ${staleAgeMinutes}분 전 캐시 사용] ${error.message}`);
      } else {
        throw error;
      }
    }

    /* 일부 구역 조회가 실패한 결과는 캐시하지 않아, 다음 요청에서 다시 완전한 결과를 시도합니다. */
    if (staleAgeMinutes === null && !data.extendedSearch?.partial) {
      opinetNearbyCache.set(opinetCacheKey, {
        timestamp: Date.now(),
        data,
      });

      if (opinetNearbyCache.size > OPINET_NEARBY_CACHE_MAX) {
        const oldestKey = opinetNearbyCache.keys().next().value;
        if (oldestKey) opinetNearbyCache.delete(oldestKey);
      }
    }
  }

  const stations = mapOpinetStations(data).map((station) => {
    // Opinet raw/cached 결과의 DISTANCE는 이전 조회 중심점 기준일 수 있으므로
    // 현재 요청 위치에서 다시 계산합니다. 캐시를 사용해도 거리 표시가 실제 위치와 어긋나지 않습니다.
    if (
      Number.isFinite(Number(station.katecX)) &&
      Number.isFinite(Number(station.katecY))
    ) {
      const distanceMeters = katecDistanceMeters(
        katec.x,
        katec.y,
        Number(station.katecX),
        Number(station.katecY)
      );

      return {
        ...station,
        distanceMeters,
        distanceKm: distanceMeters / 1000,
      };
    }

    return station;
  });

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

  // 이름/주소만으로 강하게 확정된 가맹점은 추가 상세조회가 필요 없습니다.
  // 상세조회는 애매하거나 검토가 필요한 후보만 수행해 오피넷 쿼터를 아낍니다.
  const shouldVerifyLocalPay =
    payOnly ||
    discounts.some(
      (discount) =>
        discount.requiresLocalPayMatch === true
    ) ||
    paymentOption.requiresLocalPayMatch === true;

  const localPayDetailTargets = shouldVerifyLocalPay
    ? preliminary.filter(
        ({ result }) =>
          result.matchStatus === "ambiguous" ||
          result.reviewRequired === true
      )
    : [];

  // 가격 기준일 표시를 위해 현재 가격이 낮은 후보도 일부 상세조회합니다.
  // 오피넷 일반 API 호출 한도를 고려하여 무제한으로 상세조회하지 않습니다.
  const priceDateTargets = stations
    .slice()
    .sort(
      (a, b) =>
        Number(a.pricePerLiter) -
        Number(b.pricePerLiter)
    )
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
    `상세조회 대상: ${detailTargets.length}개 (강릉페이 상세확인 ${shouldVerifyLocalPay ? "사용" : "생략"})`
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

      searchCoverage: data.extendedSearch || null,

      staleDataAgeMinutes: staleAgeMinutes,

      stations:
        calculatedStations,
    };

  if (staleAgeMinutes === null && !data.extendedSearch?.partial) {
    nearbySearchCache.set(nearbyCacheKey, {
      timestamp: Date.now(),
      data: responseData,
    });

    if (nearbySearchCache.size > NEARBY_CACHE_MAX) {
      const oldestKey = nearbySearchCache.keys().next().value;
      if (oldestKey) nearbySearchCache.delete(oldestKey);
    }
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
    radius > APP_MAX_RADIUS_METERS
  ) {
    throw new Error(
      "검색 반경은 0보다 크고 10000m 이하여야 합니다."
    );
  }
}

/**
 * 오피넷 반경 검색 API는 단일 요청당 최대 5km까지만 지원합니다.
 * 10km 선택 시 기준점 + 7개 주변 기준점을 각각 5km로 조회한 뒤
 * 주유소 ID를 합치고, 원래 기준점과의 실제 거리가 10km 이내인 결과만 남깁니다.
 */
async function getNearbyStationsWithinRadius({
  x,
  y,
  radius,
  productCode,
  sort = 1,
}) {
  if (radius <= OPINET_MAX_RADIUS_METERS) {
    return getNearbyStations({
      x,
      y,
      radius,
      productCode,
      sort,
    });
  }

  const centerQueries = buildExtendedSearchCenters({
    x,
    y,
    offsetMeters: EXTENDED_SEARCH_CENTER_OFFSET_METERS,
    count: EXTENDED_SEARCH_CENTER_COUNT,
  });

  const settledResponses =
    await Promise.allSettled(
      centerQueries.map(
        ({ x: centerX, y: centerY }) =>
          getNearbyStations({
            x: centerX,
            y: centerY,
            radius: OPINET_MAX_RADIUS_METERS,
            productCode,
            sort,
          })
      )
    );

  const responses = settledResponses
    .filter((item) => item.status === "fulfilled")
    .map((item) => item.value);

  const failedCount =
    settledResponses.filter((item) => item.status === "rejected").length;

  if (responses.length === 0) {
    const firstFailure = settledResponses.find(
      (item) => item.status === "rejected"
    )?.reason;

    throw firstFailure instanceof Error
      ? firstFailure
      : new Error("오피넷 10km 확장 검색에 실패했습니다.");
  }

  const stationsById = new Map();

  for (const response of responses) {
    const oilList =
      Array.isArray(
        response?.RESULT?.OIL
      )
        ? response.RESULT.OIL
        : [];

    for (const oil of oilList) {
      const id =
        String(
          oil?.UNI_ID ??
          ""
        ).trim();

      if (!id) {
        continue;
      }

      const stationX = Number(
        oil?.GIS_X_COOR
      );
      const stationY = Number(
        oil?.GIS_Y_COOR
      );

      if (
        !Number.isFinite(stationX) ||
        !Number.isFinite(stationY)
      ) {
        continue;
      }

      const distanceMeters = katecDistanceMeters(
        x,
        y,
        stationX,
        stationY
      );

      if (distanceMeters > radius) {
        continue;
      }

      const normalizedOil = {
        ...oil,
        DISTANCE:
          distanceMeters,
      };

      const existing =
        stationsById.get(id);

      if (
        !existing ||
        Number(normalizedOil.PRICE) <
          Number(existing.PRICE)
      ) {
        stationsById.set(
          id,
          normalizedOil
        );
      }
    }
  }

  return {
    RESULT: {
      OIL: [
        ...stationsById.values(),
      ],
    },
    extendedSearch: {
      requestedCenterCount: centerQueries.length,
      successfulCenterCount: responses.length,
      failedCenterCount: failedCount,
      partial: failedCount > 0,
    },
  };
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

  let decodedPath;

  try {
    decodedPath =
      decodeURIComponent(
        requestPath
          .split("?")[0]
      );
  } catch {
    response.writeHead(400, {
      "Content-Type": "text/plain; charset=utf-8",
    });

    response.end("잘못된 주소입니다.");

    return;
  }

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
