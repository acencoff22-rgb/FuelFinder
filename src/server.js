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

const __filename =
  fileURLToPath(import.meta.url);

const __dirname =
  path.dirname(__filename);

const publicDirectory =
  path.join(
    __dirname,
    "../public"
  );

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";

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
];

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
          request.url === "/health"
        ) {
          sendJson(response, 200, {
            success: true,
            service: "FuelFinder",
          });

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
  );

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
  }

  if (
    paymentOption.type ===
    "fixed"
  ) {
    console.log(
      `정액 할인: ${paymentOption.amount}원`
    );
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
   * 1차 매칭은 aroundAll의 상호명으로 수행합니다.
   * 이름이 맞는 주유소만 상세조회하여 API 호출을 줄입니다.
   */
  const preliminary = stations.map((station) => ({
    station,
    result: matchStationToLocalPay(
      station,
      gangneungPayStations
    ),
  }));

  const detailTargets = preliminary.filter(
    ({ result }) =>
      result.matchStatus === "matched" ||
      result.matchStatus === "ambiguous" ||
      result.reviewRequired === true
  );

  const detailedStations = new Map();

  for (const { station } of detailTargets) {
    if (!station.id) {
      continue;
    }

    try {
      const detailData = await getStationDetail(station.id);
      const detail = extractStationDetail(detailData);

      if (detail) {
        detailedStations.set(station.id, {
          ...station,
          name: detail.OS_NM || station.name,
          address: detail.NEW_ADR || station.address || "",
          oldAddress: detail.VAN_ADR || station.oldAddress || "",
          phone: detail.TEL || station.phone || "",
        });
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

  const enrichedStations = stations.map((station) => {
    const finalStation =
      detailedStations.get(station.id) || station;

    const matchResult = matchStationToLocalPay(
      finalStation,
      gangneungPayStations
    );

    return {
      ...finalStation,
      localPayMatch: matchResult,
      gangneungPay: createGangneungPayInfo(matchResult),
    };
  });

  const calculatedStations =
    compareStations(
      enrichedStations,
      {
        liters,

        fuelEfficiency,

        paymentOption,
      }
    );

  sendJson(
    response,
    200,
    {
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

      gangneungPay: {
        officialGasStationCount:
          gangneungPayStations.length,

        discountApplied:
          false,

        discountPolicyStatus:
          "not-configured",
      },

      stationCount:
        calculatedStations.length,

      stations:
        calculatedStations,
    }
  );
}

function createGangneungPayInfo(
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
      "possible"
  ) {
    return {
      status:
        "needs_confirmation",

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
    };
  }

  throw new Error(
    "할인 옵션을 확인할 수 없습니다."
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

  if (
    !filePath.startsWith(
      publicDirectory
    )
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
    filePath,
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
          filePath
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
      `브라우저에서 http://localhost:${port} 로 접속하세요.`
    );

    console.log("");

    console.log(
      "오피넷 주변 주유소 + 실질 주유비 + 강릉페이 가맹 여부가 연결되어 있습니다."
    );

    console.log("");

    console.log(
      "홍길동주유소 매칭 진단 로그가 활성화되어 있습니다."
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