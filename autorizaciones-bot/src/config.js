import "dotenv/config";

function required(name) {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function optional(name, def = "") {
  return process.env[name] ?? def;
}

function parseUserIds(s) {
  return s.split(",").map((x) => x.trim()).filter(Boolean).map(Number);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(required("GOOGLE_SERVICE_ACCOUNT_JSON"));
} catch (e) {
  throw new Error(
    "GOOGLE_SERVICE_ACCOUNT_JSON no es JSON válido. Pega el contenido completo del .json del service account."
  );
}

export const config = {
  telegram: {
    token: required("TELEGRAM_BOT_TOKEN"),
    allowedGroupId: Number(required("TELEGRAM_ALLOWED_GROUP_ID")),
    allowedUserIds: parseUserIds(required("TELEGRAM_ALLOWED_USER_IDS")),
  },
  sheet: {
    id: required("GOOGLE_SHEET_ID"),
    tab: optional("GOOGLE_SHEET_TAB", "Autorizaciones"),
    serviceAccount,
    cacheTtlSeconds: Number(optional("SHEET_CACHE_TTL_SECONDS", "60")),
  },
  anthropic: {
    apiKey: required("ANTHROPIC_API_KEY"),
  },
  smtp: {
    host: optional("SMTP_HOST", "smtp.gmail.com"),
    port: Number(optional("SMTP_PORT", "587")),
    user: required("SMTP_USER"),
    pass: required("SMTP_PASSWORD"),
    fromName: optional("SMTP_FROM_NAME", "Autorizaciones Bot"),
    fromEmail: required("SMTP_FROM_EMAIL"),
  },
  whatsapp: {
    sessionPath: optional("WHATSAPP_SESSION_PATH", "./.wwebjs_auth"),
  },
  env: optional("NODE_ENV", "development"),
  logLevel: optional("LOG_LEVEL", "info"),
};

export function log(level, ...args) {
  const levels = { error: 0, warn: 1, info: 2, debug: 3 };
  if (levels[level] <= levels[config.logLevel]) {
    const ts = new Date().toISOString();
    console.log(`[${ts}] [${level.toUpperCase()}]`, ...args);
  }
}
