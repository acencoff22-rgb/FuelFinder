import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename =
  fileURLToPath(
    import.meta.url
  );

const __dirname =
  path.dirname(
    __filename
  );

const DATA_DIR =
  path.join(
    __dirname,
    "..",
    "data"
  );

const CACHE_FILE =
  path.join(
    DATA_DIR,
    "opinet-station-details.json"
  );

function ensureDataDirectory() {
  if (
    !fs.existsSync(
      DATA_DIR
    )
  ) {
    fs.mkdirSync(
      DATA_DIR,
      {
        recursive: true,
      }
    );
  }
}

function readCache() {
  ensureDataDirectory();

  if (
    !fs.existsSync(
      CACHE_FILE
    )
  ) {
    return {};
  }

  try {
    const text =
      fs.readFileSync(
        CACHE_FILE,
        "utf8"
      );

    if (
      !text.trim()
    ) {
      return {};
    }

    const parsed =
      JSON.parse(
        text
      );

    if (
      !parsed ||
      typeof parsed !==
        "object" ||
      Array.isArray(parsed)
    ) {
      return {};
    }

    return parsed;
  } catch (
    error
  ) {
    console.warn(
      `[오피넷 캐시 읽기 실패] ${error.message}`
    );

    return {};
  }
}

function writeCache(
  cache
) {
  ensureDataDirectory();

  const tempFile =
    `${CACHE_FILE}.tmp`;

  fs.writeFileSync(
    tempFile,
    JSON.stringify(
      cache,
      null,
      2
    ),
    "utf8"
  );

  fs.renameSync(
    tempFile,
    CACHE_FILE
  );
}

export function getCachedStationDetail(
  stationId
) {
  if (!stationId) {
    return null;
  }

  const cache = readCache();
  const entry = cache[stationId];

  if (!entry) {
    return null;
  }

  const cachedAt = Date.parse(entry.cachedAt || "");
  const maxAgeMs = 24 * 60 * 60 * 1000;

  if (
    !Number.isFinite(cachedAt) ||
    Date.now() - cachedAt > maxAgeMs
  ) {
    return null;
  }

  return entry;
}

export function setCachedStationDetail(
  stationId,
  detail
) {
  if (
    !stationId ||
    !detail ||
    typeof detail !==
      "object"
  ) {
    return;
  }

  const cache =
    readCache();

  cache[
    stationId
  ] = {
    ...detail,
    cachedAt:
      new Date().toISOString(),
  };

  writeCache(
    cache
  );
}

export function hasCachedStationDetail(
  stationId
) {
  if (
    !stationId
  ) {
    return false;
  }

  const cache =
    readCache();

  return Boolean(
    cache[
      stationId
    ]
  );
}

export function clearOpinetStationCache() {
  if (
    fs.existsSync(
      CACHE_FILE
    )
  ) {
    fs.unlinkSync(
      CACHE_FILE
    );
  }
}

export function getOpinetCacheFilePath() {
  return CACHE_FILE;
}