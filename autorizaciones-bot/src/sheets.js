import { google } from "googleapis";
import NodeCache from "node-cache";
import { config, log } from "./config.js";

const cache = new NodeCache({ stdTTL: config.sheet.cacheTtlSeconds });
const CACHE_KEY = "rules";

const COLUMNS = [
  "Apto",
  "Activo",
  "Canal",
  "Formato",
  "Destino_WA",
  "Destino_Email",
  "CC_Email",
  "Subject_Template",
  "Body_Template",
  "Doc_Template_URL",
  "Auto_Send",
  "Reglas_Especiales",
];

let sheetsClient;

async function getClient() {
  if (sheetsClient) return sheetsClient;
  const auth = new google.auth.GoogleAuth({
    credentials: config.sheet.serviceAccount,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });
  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

function parseBool(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.trim().toUpperCase() === "TRUE";
  return false;
}

function rowToRule(row) {
  const r = {};
  COLUMNS.forEach((col, i) => {
    r[col] = (row[i] ?? "").toString().trim();
  });
  // Normalize types
  r.Activo = parseBool(r.Activo);
  r.Auto_Send = parseBool(r.Auto_Send);
  // Derived field
  const m = r.Apto.match(/(\d+)\s*$/);
  r.APTO_NUM = m ? m[1] : "";
  return r;
}

/**
 * Returns all rules from the sheet, cached.
 */
export async function getAllRules() {
  const cached = cache.get(CACHE_KEY);
  if (cached) return cached;

  log("info", "Fetching rules from Google Sheet…");
  const sheets = await getClient();
  const range = `${config.sheet.tab}!A2:L200`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheet.id,
    range,
  });
  const rows = res.data.values || [];
  const rules = rows
    .map(rowToRule)
    .filter((r) => r.Apto && r.Activo);
  cache.set(CACHE_KEY, rules);
  log("info", `Loaded ${rules.length} active rules`);
  return rules;
}

/**
 * Find a rule by apto name. Matching is fuzzy: case-insensitive, ignores spaces.
 * Returns the rule or null. If multiple match, returns null and the caller should disambiguate.
 */
export async function findRule(aptoQuery) {
  const rules = await getAllRules();
  const norm = (s) => s.toLowerCase().replace(/\s+/g, "").trim();
  const q = norm(aptoQuery);

  // 1) Exact match (normalized)
  const exact = rules.filter((r) => norm(r.Apto) === q);
  if (exact.length === 1) return { match: exact[0], candidates: [] };
  if (exact.length > 1) return { match: null, candidates: exact };

  // 2) Substring match
  const partial = rules.filter((r) => norm(r.Apto).includes(q));
  if (partial.length === 1) return { match: partial[0], candidates: [] };
  if (partial.length > 1) return { match: null, candidates: partial };

  return { match: null, candidates: [] };
}

export async function listAptos() {
  const rules = await getAllRules();
  return rules.map((r) => r.Apto);
}

/**
 * Force cache refresh — useful for /reload command.
 */
export function invalidateCache() {
  cache.del(CACHE_KEY);
  log("info", "Sheet cache invalidated");
}
