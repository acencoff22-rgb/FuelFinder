import { katecToWgs84 } from "./coordinate.js";

function toFiniteNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizePhone(value) {
  const text = cleanText(value);

  if (!text) {
    return "";
  }

  return text.replace(/\D/g, "");
}

export function mapOpinetStations(data) {
  const oilList = data?.RESULT?.OIL;

  if (!Array.isArray(oilList)) {
    return [];
  }

  return oilList
    .map((oil) => {
      const katecX =
        toFiniteNumber(
          oil.GIS_X_COOR
        );

      const katecY =
        toFiniteNumber(
          oil.GIS_Y_COOR
        );

      const distanceMeters =
        toFiniteNumber(
          oil.DISTANCE
        );

      let wgs84 = null;

      if (
        Number.isFinite(katecX) &&
        Number.isFinite(katecY)
      ) {
        try {
          wgs84 =
            katecToWgs84({
              x: katecX,
              y: katecY,
            });
        } catch {
          wgs84 = null;
        }
      }

      const name =
        cleanText(
          oil.OS_NM
        );

      const newAddress =
        cleanText(
          oil.NEW_ADR
        );

      const oldAddress =
        cleanText(
          oil.VAN_ADR
        );

      const phone =
        normalizePhone(
          oil.TEL
        );

      return {
        id:
          cleanText(
            oil.UNI_ID
          ),

        name,

        pricePerLiter:
          toFiniteNumber(
            oil.PRICE
          ),

        address:
          newAddress,

        oldAddress,

        phone,

        brandCode:
          cleanText(
            oil.POLL_DIV_CD ||
            oil.POLL_DIV_CO ||
            ""
          ),

        katecX,

        katecY,

        latitude:
          wgs84?.latitude ??
          null,

        longitude:
          wgs84?.longitude ??
          null,

        distanceMeters,

        distanceKm:
          Number.isFinite(
            distanceMeters
          )
            ? distanceMeters / 1000
            : null,
      };
    })
    .filter(
      (station) =>
        station.id &&
        Number.isFinite(
          station.pricePerLiter
        )
    );
}