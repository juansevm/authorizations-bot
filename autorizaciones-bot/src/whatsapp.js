import wwebjs from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import { config, log } from "./config.js";

const { Client, LocalAuth } = wwebjs;

let client;
let ready = false;
const readyPromise = new Promise((resolve) => {
  globalThis.__waReadyResolve = resolve;
});

export async function startWhatsApp() {
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

/**
 * Find a WhatsApp chat by exact name (group or individual).
 * If `destination` looks like a phone number (starts with + or contains only digits/spaces),
 * resolve to a private chat by phone. Otherwise treat as group name.
 */
async function resolveChatId(destination) {
  const trimmed = destination.trim();
  const isPhone = /^\+?\d[\d\s\-()]{6,}$/.test(trimmed);
  if (isPhone) {
    const digits = trimmed.replace(/\D/g, "");
    const wid = `${digits}@c.us`;
    const numId = await client.getNumberId(digits);
    if (!numId) throw new Error(`El número ${trimmed} no tiene WhatsApp`);
    return numId._serialized;
  }
  // Group: search by exact name
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

/**
 * Send a text message to a WhatsApp destination (group name or phone).
 */
export async function sendText(destination, text) {
  if (!ready) throw new Error("WhatsApp client no está listo todavía");
  const chatId = await resolveChatId(destination);
  await client.sendMessage(chatId, text);
  log("info", `WA → "${destination}": ${text.slice(0, 80).replace(/\n/g, " ⏎ ")}…`);
}

/**
 * Send a text message + media (PDF, image) attachment.
 */
export async function sendMedia(destination, text, mediaBuffer, mimetype, filename) {
  if (!ready) throw new Error("WhatsApp client no está listo todavía");
  const chatId = await resolveChatId(destination);
  const { MessageMedia } = wwebjs;
  const media = new MessageMedia(mimetype, mediaBuffer.toString("base64"), filename);
  await client.sendMessage(chatId, media, { caption: text });
  log("info", `WA + media → "${destination}"`);
}

/**
 * For debugging: list all group chats the account is in.
 */
export async function listGroups() {
  if (!ready) throw new Error("WhatsApp client no está listo todavía");
  const chats = await client.getChats();
  return chats.filter((c) => c.isGroup).map((c) => c.name);
}
