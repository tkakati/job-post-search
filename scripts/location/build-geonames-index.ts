import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

type GeoCityRecord = {
  city: string;
  state: string | null;
  stateCode: string | null;
  country: string | null;
  countryCode: string;
  lat: number;
  lon: number;
  population: number;
};

type GeoNamesIndex = {
  version: number;
  generatedAt: string;
  source: {
    dataset: string;
    cityDumpUrl: string;
    adminDumpUrl: string;
    countryDumpUrl: string;
  };
  aliases: Record<string, string>;
  byCity: Record<string, GeoCityRecord[]>;
};

const CITY_DUMP_URL = "https://download.geonames.org/export/dump/cities1000.zip";
const ADMIN_DUMP_URL = "https://download.geonames.org/export/dump/admin1CodesASCII.txt";
const COUNTRY_DUMP_URL = "https://download.geonames.org/export/dump/countryInfo.txt";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const OUTPUT_DIR = path.join(ROOT, "src", "lib", "location", "data");
const OUTPUT_INDEX_PATH = path.join(OUTPUT_DIR, "geonames-cities1000-index.json");
const OUTPUT_META_PATH = path.join(OUTPUT_DIR, "geonames-index-meta.json");
const CACHE_DIR = path.join(ROOT, ".cache", "location");
const CITIES_ZIP_PATH = path.join(CACHE_DIR, "cities1000.zip");
const ADMIN_PATH = path.join(CACHE_DIR, "admin1CodesASCII.txt");
const COUNTRY_PATH = path.join(CACHE_DIR, "countryInfo.txt");
const MAX_CANDIDATES_PER_CITY = 75;

const CITY_ALIASES: Record<string, string> = {
  nyc: "new york",
  "new york city": "new york",
  sf: "san francisco",
  sfo: "san francisco",
  la: "los angeles",
  dc: "washington",
  "d c": "washington",
  blr: "bengaluru",
  bangalore: "bengaluru",
  bombay: "mumbai",
  calcutta: "kolkata",
};

function normalizeToken(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

async function ensureDir(targetPath: string) {
  await fs.mkdir(targetPath, { recursive: true });
}

function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? -1}`));
    });
  });
}

async function downloadFile(url: string, outputPath: string) {
  await runCommand("curl", ["-L", "--fail", "--silent", "--show-error", "-o", outputPath, url]);
}

async function parseAdmin1Map(filePath: string) {
  const map = new Map<string, { stateName: string | null; stateCode: string | null }>();
  const lines = (await fs.readFile(filePath, "utf8")).split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const [compound, name] = line.split("\t");
    if (!compound) continue;
    const [countryCode, stateCode] = compound.split(".");
    if (!countryCode || !stateCode) continue;
    map.set(compound, { stateName: name?.trim() || null, stateCode: stateCode.trim() });
  }
  return map;
}

async function parseCountryMap(filePath: string) {
  const map = new Map<string, string>();
  const lines = (await fs.readFile(filePath, "utf8")).split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim() || line.startsWith("#")) continue;
    const fields = line.split("\t");
    const code = fields[0]?.trim();
    const name = fields[4]?.trim();
    if (!code || !name) continue;
    map.set(code, name);
  }
  return map;
}

async function parseCitiesFromZip({
  zipPath,
  admin1Map,
  countryMap,
}: {
  zipPath: string;
  admin1Map: Map<string, { stateName: string | null; stateCode: string | null }>;
  countryMap: Map<string, string>;
}) {
  const byCity = new Map<string, GeoCityRecord[]>();
  let parsedCount = 0;

  const unzip = spawn("unzip", ["-p", zipPath], {
    stdio: ["ignore", "pipe", "inherit"],
  });

  if (!unzip.stdout) {
    throw new Error("unzip stdout is unavailable");
  }

  const rl = readline.createInterface({
    input: unzip.stdout,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line || !line.trim()) continue;
    const fields = line.split("\t");
    if (fields.length < 15) continue;
    const cityName = fields[2]?.trim() || fields[1]?.trim();
    const lat = Number(fields[4]);
    const lon = Number(fields[5]);
    const countryCode = (fields[8] ?? "").trim().toUpperCase();
    const admin1Code = (fields[10] ?? "").trim().toUpperCase() || null;
    const population = Number.parseInt(fields[14] ?? "0", 10);
    if (!cityName || !countryCode || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      continue;
    }

    const cityKey = normalizeToken(cityName);
    if (!cityKey) continue;

    const adminKey = admin1Code ? `${countryCode}.${admin1Code}` : "";
    const admin = adminKey ? admin1Map.get(adminKey) : undefined;

    const record: GeoCityRecord = {
      city: cityName,
      state: admin?.stateName ?? null,
      stateCode: admin?.stateCode ?? admin1Code,
      country: countryMap.get(countryCode) ?? countryCode,
      countryCode,
      lat,
      lon,
      population: Number.isFinite(population) ? Math.max(population, 0) : 0,
    };

    const existing = byCity.get(cityKey) ?? [];
    existing.push(record);
    byCity.set(cityKey, existing);
    parsedCount += 1;
  }

  const unzipExitCode = await new Promise<number>((resolve, reject) => {
    unzip.once("error", reject);
    unzip.once("close", (code) => resolve(code ?? -1));
  });
  if (unzipExitCode !== 0) {
    throw new Error(`unzip exited with code ${unzipExitCode}`);
  }

  const compactByCity: Record<string, GeoCityRecord[]> = {};
  for (const [cityKey, values] of byCity.entries()) {
    const sorted = [...values]
      .sort((a, b) => {
        if (b.population !== a.population) return b.population - a.population;
        return a.countryCode.localeCompare(b.countryCode);
      })
      .slice(0, MAX_CANDIDATES_PER_CITY);
    compactByCity[cityKey] = sorted;
  }

  return {
    byCity: Object.fromEntries(Object.entries(compactByCity).sort(([a], [b]) => a.localeCompare(b))),
    parsedCount,
    distinctCityKeys: Object.keys(compactByCity).length,
  };
}

async function main() {
  await ensureDir(CACHE_DIR);
  await ensureDir(OUTPUT_DIR);

  await downloadFile(CITY_DUMP_URL, CITIES_ZIP_PATH);
  await downloadFile(ADMIN_DUMP_URL, ADMIN_PATH);
  await downloadFile(COUNTRY_DUMP_URL, COUNTRY_PATH);

  const admin1Map = await parseAdmin1Map(ADMIN_PATH);
  const countryMap = await parseCountryMap(COUNTRY_PATH);

  const { byCity, parsedCount, distinctCityKeys } = await parseCitiesFromZip({
    zipPath: CITIES_ZIP_PATH,
    admin1Map,
    countryMap,
  });

  const payload: GeoNamesIndex = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: {
      dataset: "cities1000",
      cityDumpUrl: CITY_DUMP_URL,
      adminDumpUrl: ADMIN_DUMP_URL,
      countryDumpUrl: COUNTRY_DUMP_URL,
    },
    aliases: CITY_ALIASES,
    byCity,
  };

  const meta = {
    generatedAt: payload.generatedAt,
    cityKeys: distinctCityKeys,
    totalRecords: parsedCount,
    hostname: os.hostname(),
    nodeVersion: process.version,
  };

  await fs.writeFile(OUTPUT_INDEX_PATH, JSON.stringify(payload));
  await fs.writeFile(OUTPUT_META_PATH, JSON.stringify(meta, null, 2));

  if (!fsSync.existsSync(OUTPUT_INDEX_PATH)) {
    throw new Error(`Failed to create index at ${OUTPUT_INDEX_PATH}`);
  }

  console.log(
    `GeoNames index generated: ${distinctCityKeys} city keys, ${parsedCount} records -> ${OUTPUT_INDEX_PATH}`,
  );
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
