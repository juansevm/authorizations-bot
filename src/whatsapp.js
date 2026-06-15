import wwebjs from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import fs from "fs";
import path from "path";
import { config, log } from "./config.js";

const { Client, LocalAuth } = wwebjs;

let client;
let ready = false;
const readyPromise = new Promise((resolve) => {
  globalThis.__waReadyResolve = resolve;
});

/**
 * Remove any Chromium lock files from the session folder.
 * Chromium creates these to prevent two processes from using the same profile.
 * If a process crashes ungracefully (e.g., container restart), the lock stays
 * and blocks future starts. We clean it on every boot to be safe.
 */
function cleanStaleChromiumLocks(sessionPath) {
  try {
    if (!fs.existsSync(sessionPath)) return;
    const filesToRemove = [
      "SingletonLock",
      "SingletonCookie",
      "SingletonSocket",
      "lockfile",
      "LOCK",
    ];
    function walk(dir) {
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (e) {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (filesToRemove.includes(entry.name)) {
          try {
            fs.unlinkSync(full);
            log("info", `Removed stale lock: ${full}`);
          } catch (e) {
            log("warn", `Could not remove lock ${full}:`, e.message);
          }
        }
      }
    }
    walk(sessionPath);
  } catch (e) {
    log("warn", "Lock cleanup error (non-fatal):", e.message);
  }
}

export async function startWhatsApp() {
  cleanStaleChromiumLocks(config.whatsapp.sessionPath);

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: config.whatsapp.sessionPath }),
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
      ],
    },
  });

  client.on("qr", (qr) => {
    log("warn", "==================================================");
    log("warn", "WhatsApp QR — escanea con tu teléfono (WhatsApp → Dispositivos vinculados):");
    log("warn", "==================================================");
    qrcode.generate(qr, { small: true });

    const encoded = encodeURIComponent(qr);
    const imgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encoded}`;
    log("warn", "==================================================");
    log("warn", "Si el QR ASCII no es escaneable, abre este link en tu navegador:");
    log("warn", imgUrl);
    log("warn", "==================================================");
  });

  client.on("ready", () => {
    ready = true;
    log("info", "WhatsApp client ready");
    globalThis.__waReadyResolve(true);
  });

  client.on("authenticated", () => log("info", "WhatsApp authenticated"));
  client.on("auth_failure", (m) => log("error", "WhatsApp auth failure:", m));
  client.on("disconnected", (reason) => {
    ready = false;
    log("warn", "WhatsApp disconnected:", reason);
  });

  await client.initialize();
}

export function isReady() {
  return ready;
}

export function waitUntilReady() {
  return readyPromise;
}

async function resolveChatId(destination) {
  const trimmed = destination.trim();
  const isPhone = /^\+?\d[\d\s\-()]{6,}$/.test(trimmed);
  if (isPhone) {
    const digits = trimmed.replace(/\D/g, "");
    const numId = await client.getNumberId(digits);
    if (!numId) throw new Error(`El número ${trimmed} no tiene WhatsApp`);
    return numId._serialized;
  }
  const chats = await client.getChats();
  const group = chats.find(
    (c) => c.isGroup && c.name && c.name.trim() === trimmed
  );
  if (!group) {
    throw new Error(
      `No encontré el grupo de WhatsApp "${trimmed}". Verifica que el nombre coincida EXACTO con el grupo en tu WhatsApp.`
    );
  }
  return group.id._serialized;
}

export async function sendText(destination, text) {
  if (!ready) throw new Error("WhatsApp client no está listo todavía");
  const chatId = await resolveChatId(destination);
  await client.sendMessage(chatId, text);
  log("info", `WA → "${destination}": ${text.slice(0, 80).replace(/\n/g, " ⏎ ")}…`);
}

export async function sendMedia(destination, text, mediaBuffer, mimetype, filename) {
  if (!ready) throw new Error("WhatsApp client no está listo todavía");
  const chatId = await resolveChatId(destination);
  const { MessageMedia } = wwebjs;
  const media = new MessageMedia(mimetype, mediaBuffer.toString("base64"), filename);
  await client.sendMessage(chatId, media, { caption: text });
  log("info", `WA + media → "${destination}"`);
}

export async function listGroups() {
  if (!ready) throw new Error("WhatsApp client no está listo todavía");
  const chats = await client.getChats();
  return chats.filter((c) => c.isGroup).map((c) => c.name);
}
