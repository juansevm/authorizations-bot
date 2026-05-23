import { config, log } from "./config.js";
import { startWhatsApp, waitUntilReady, isReady as waReady } from "./whatsapp.js";
import { startTelegram, stopTelegram } from "./telegram.js";
import { verifySmtp } from "./email.js";
import { getAllRules } from "./sheets.js";
import http from "http";

function startHealthServer() {
  const port = Number(process.env.PORT || 8080);
  const server = http.createServer((req, res) => {
    if (req.url === "/health" || req.url === "/") {
      const status = {
        ok: true,
        whatsapp_ready: waReady(),
        uptime_seconds: Math.floor(process.uptime()),
        env: config.env,
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(status));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(port, () => log("info", `Health server on :${port}`));
}

async function main() {
  log("info", `Starting autorizaciones-bot (env=${config.env})`);

  // 0) Health server (so Railway can ping us)
  startHealthServer();

  // 1) Verify Sheet access early — fail fast if creds are wrong
  log("info", "Verifying Google Sheets access…");
  try {
    const rules = await getAllRules();
    log("info", `Sheet OK. ${rules.length} active rules loaded.`);
  } catch (e) {
    log("error", "Cannot read Sheet:", e.message);
    log("error", "Verifica: 1) GOOGLE_SHEET_ID, 2) que compartiste el Sheet con el service account, 3) que la pestaña se llama '" + config.sheet.tab + "'");
    process.exit(1);
  }

  // 2) Verify SMTP (non-fatal — bot can still work in WhatsApp-only mode)
  await verifySmtp();

  // 3) Start WhatsApp (this prints QR if first time)
  log("info", "Starting WhatsApp client…");
  startWhatsApp().catch((e) => log("error", "WhatsApp init error:", e));

  // 4) Start Telegram immediately so user can use commands even while WA is connecting
  startTelegram();

  // 5) Log when WhatsApp is ready
  waitUntilReady().then(() => log("info", "WhatsApp is fully ready — bot is operational"));

  process.once("SIGINT", () => {
    log("info", "SIGINT — shutting down");
    stopTelegram("SIGINT");
    process.exit(0);
  });
  process.once("SIGTERM", () => {
    log("info", "SIGTERM — shutting down");
    stopTelegram("SIGTERM");
    process.exit(0);
  });
}

main().catch((e) => {
  log("error", "Fatal:", e);
  process.exit(1);
});
