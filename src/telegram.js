import { Telegraf, Markup } from "telegraf";
import { config, log } from "./config.js";
import { findRule, listAptos, invalidateCache } from "./sheets.js";
import { extractFromImage } from "./ocr.js";
import { renderMessage, detectMissingData, huespedesSinCedula } from "./templates.js";
import { dispatch } from "./dispatcher.js";
import { getSession, setSession, clearSession } from "./session.js";
import { isReady as waReady, listGroups } from "./whatsapp.js";

const bot = new Telegraf(config.telegram.token);

// ============================================================
// Authorization middleware
// ============================================================
bot.use(async (ctx, next) => {
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  if (chatId !== config.telegram.allowedGroupId) {
    log("warn", `Mensaje en chat no autorizado ${chatId} (user ${userId})`);
    return;
  }
  if (!config.telegram.allowedUserIds.includes(userId)) {
    log("warn", `Usuario no autorizado: ${userId}`);
    await ctx.reply("⛔ No estás autorizado para usar este bot.");
    return;
  }
  return next();
});

// ============================================================
// Commands
// ============================================================
bot.command("start", async (ctx) => {
  await ctx.reply(
    [
      "🏠 Bot de Autorizaciones listo.",
      "",
      "Mándame el *apto* + *screenshot* y yo me encargo.",
      "Ej: `Claudia 201` + foto del itinerario.",
      "",
      "Para aptos con `pdf+fotos` (Valen 517, Patricia 518): primero el screenshot del itinerario, luego las fotos de las cédulas (una por una o juntas).",
      "",
      "Comandos:",
      "/aptos — listar apartamentos configurados",
      "/reload — recargar el spreadsheet ya",
      "/grupos — listar grupos de WhatsApp visibles (debug)",
      "/listo — terminé de mandar fotos de cédulas, procesar ahora",
      "/cancel — cancelar la operación en curso",
    ].join("\n"),
    { parse_mode: "Markdown" }
  );
});

bot.command("aptos", async (ctx) => {
  try {
    const aptos = await listAptos();
    await ctx.reply(`📋 Aptos configurados (${aptos.length}):\n\n${aptos.join("\n")}`);
  } catch (e) {
    await ctx.reply(`❌ Error leyendo Sheet: ${e.message}`);
  }
});

bot.command("reload", async (ctx) => {
  invalidateCache();
  await ctx.reply("♻️ Cache invalidada. La próxima orden re-lee el Sheet.");
});

bot.command("grupos", async (ctx) => {
  if (!waReady()) {
    await ctx.reply("⏳ WhatsApp aún no está listo");
    return;
  }
  try {
    const groups = await listGroups();
    const msg = groups.length
      ? `📱 Grupos WhatsApp visibles (${groups.length}):\n\n${groups.join("\n")}`
      : "No se ven grupos todavía";
    await ctx.reply(msg.slice(0, 4000));
  } catch (e) {
    await ctx.reply(`❌ ${e.message}`);
  }
});

bot.command("cancel", async (ctx) => {
  clearSession(ctx.from.id);
  await ctx.reply("✅ Operación cancelada.");
});

bot.command("listo", async (ctx) => {
  const session = getSession(ctx.from.id);
  if (session.collectingIdPhotos) {
    session.collectingIdPhotos = false;
    if (!session.idPhotos || session.idPhotos.length === 0) {
      await ctx.reply("⚠️ No recibí ninguna foto de cédula. Operación cancelada.");
      clearSession(ctx.from.id);
      return;
    }
    await ctx.reply(`✓ Recibí ${session.idPhotos.length} foto(s) de ID. Generando preview…`);
    await offerPreview(ctx, session);
  } else {
    await ctx.reply("No estaba esperando fotos de cédulas en este momento.");
  }
});

// ============================================================
// Text handler
// ============================================================
bot.on("text", async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text.trim();
  if (text.startsWith("/")) return;

  const session = getSession(userId);

  // Are we waiting for missing fechas?
  if (session.awaitingMissingField === "fechas" && session.pendingRule) {
    const parsed = parseFechaInput(text);
    if (!parsed) {
      await ctx.reply(
        "No entendí las fechas. Mándalas así: `17/05/2026 - 23/05/2026` o `del 17 al 23 de mayo`",
        { parse_mode: "Markdown" }
      );
      return;
    }
    session.pendingData.fecha_entrada = parsed.entrada;
    session.pendingData.fecha_salida = parsed.salida;
    session.awaitingMissingField = null;
    await handlePostOcr(ctx, session);
    return;
  }

  // Otherwise, treat as apto lookup
  try {
    const { match, candidates } = await findRule(text);
    if (match) {
      setSession(userId, {
        pendingRule: match,
        pendingData: null,
        pendingScreenshot: null,
        idPhotos: [],
        collectingIdPhotos: false,
      });
      await ctx.reply(
        `✅ Apto identificado: *${match.Apto}*\nMándame ahora el screenshot.`,
        { parse_mode: "Markdown" }
      );
      return;
    }
    if (candidates.length > 1) {
      const buttons = candidates.slice(0, 8).map((c) =>
        Markup.button.callback(c.Apto, `apto:${c.Apto}`)
      );
      await ctx.reply(
        `🤔 Varios coinciden con "${text}". ¿Cuál?`,
        Markup.inlineKeyboard(buttons, { columns: 2 })
      );
      return;
    }
    await ctx.reply(
      `❌ No encontré un apto que coincida con "${text}". Usa /aptos para ver la lista.`
    );
  } catch (e) {
    log("error", "Text handler error:", e);
    await ctx.reply(`❌ Error: ${e.message}`);
  }
});

bot.action(/^apto:(.+)$/, async (ctx) => {
  const aptoName = ctx.match[1];
  const userId = ctx.from.id;
  const { match } = await findRule(aptoName);
  if (match) {
    const existing = getSession(userId);
    setSession(userId, { pendingRule: match, idPhotos: existing.idPhotos || [] });
    await ctx.editMessageText(`✅ Apto seleccionado: *${match.Apto}*\nMándame el screenshot.`, {
      parse_mode: "Markdown",
    });
  } else {
    await ctx.editMessageText("❌ No pude resolver el apto.");
  }
  await ctx.answerCbQuery();
});

// ============================================================
// Photo handler
// ============================================================
bot.on("photo", async (ctx) => {
  const userId = ctx.from.id;
  const session = getSession(userId);

  // Download highest-res photo
  const photo = ctx.message.photo[ctx.message.photo.length - 1];
  const link = await ctx.telegram.getFileLink(photo.file_id);
  const res = await fetch(link.href);
  const buffer = Buffer.from(await res.arrayBuffer());

  // Mode: we're already collecting ID photos for pdf+fotos
  if (session.collectingIdPhotos) {
    session.idPhotos = session.idPhotos || [];
    session.idPhotos.push(buffer);
    await ctx.reply(
      `📎 Foto ${session.idPhotos.length} recibida. ` +
      `Manda más, o /listo cuando termines (también puedes /cancel).`
    );
    return;
  }

  // Caption may include the apto name
  const caption = ctx.message.caption?.trim();
  if (caption && !session.pendingRule) {
    const { match, candidates } = await findRule(caption);
    if (match) {
      session.pendingRule = match;
      session.idPhotos = [];
    } else if (candidates.length > 1) {
      session.pendingScreenshot = buffer;
      const buttons = candidates.slice(0, 8).map((c) =>
        Markup.button.callback(c.Apto, `apto:${c.Apto}`)
      );
      await ctx.reply(
        `🤔 La caption "${caption}" coincide con varios. ¿Cuál?`,
        Markup.inlineKeyboard(buttons, { columns: 2 })
      );
      return;
    }
  }

  if (!session.pendingRule) {
    await ctx.reply(
      "📸 Recibí la foto, pero primero dime de qué apto es.\nEj: escribe `Claudia 201` y vuelve a mandar la foto, o agrégalo como caption."
    );
    session.pendingScreenshot = buffer;
    return;
  }

  await ctx.reply("🔍 Leyendo el screenshot…");

  try {
    session.pendingScreenshot = buffer;
    const data = await extractFromImage(buffer, "image/jpeg");
    session.pendingData = data;
    await handlePostOcr(ctx, session);
  } catch (e) {
    log("error", "Photo handler error:", e);
    await ctx.reply(`❌ Error procesando imagen: ${e.message}`);
  }
});

// ============================================================
// Post-OCR flow
// ============================================================
async function handlePostOcr(ctx, session) {
  const { pendingRule: rule, pendingData: data } = session;
  const missing = detectMissingData(rule, data);

  if (missing.includes("fecha de entrada") || missing.includes("fecha de salida")) {
    session.awaitingMissingField = "fechas";
    await ctx.reply(
      `⚠️ No pude leer las fechas en el screenshot. Mándamelas así:\n*17/05/2026 - 23/05/2026*\no\n*del 17 al 23 de mayo*`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  if (missing.includes("nombres de huéspedes")) {
    await ctx.reply(
      `⚠️ No encontré huéspedes en el screenshot. Cancelando. Mándame el screenshot correcto o usa /cancel.`
    );
    return;
  }

  // Cédulas pendientes
  const sinCedula = huespedesSinCedula(data);
  if (sinCedula.length > 0) {
    const lista = sinCedula.map((n) => `• ${n}`).join("\n");
    await ctx.reply(
      `⚠️ Estos huéspedes no traen cédula:\n${lista}\n\n¿Cómo procedo?`,
      Markup.inlineKeyboard([
        [Markup.button.callback("Mandar con (pendiente)", "ced:pendiente")],
        [Markup.button.callback("Cancelar", "ced:cancel")],
      ])
    );
    return;
  }

  // ¿El formato pide fotos de IDs? Pedirlas antes del preview
  if (rule.Formato === "pdf+fotos" && (!session.idPhotos || session.idPhotos.length === 0)) {
    session.collectingIdPhotos = true;
    await ctx.reply(
      `📷 *${rule.Apto}* requiere fotos de cédulas/IDs (Formato pdf+fotos).\n\n` +
      `Mándame las fotos (una por una o varias juntas). Cuando termines: /listo`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  await offerPreview(ctx, session);
}

bot.action("ced:pendiente", async (ctx) => {
  const session = getSession(ctx.from.id);
  await ctx.editMessageText("✓ Continuando con (pendiente) donde falte cédula.");
  await ctx.answerCbQuery();

  // Continuar el flujo: si el formato pide fotos, pedirlas; si no, ir directo a preview
  const rule = session.pendingRule;
  if (rule.Formato === "pdf+fotos" && (!session.idPhotos || session.idPhotos.length === 0)) {
    session.collectingIdPhotos = true;
    await ctx.reply(
      `📷 *${rule.Apto}* requiere fotos de cédulas/IDs. Mándalas y luego /listo.`,
      { parse_mode: "Markdown" }
    );
    return;
  }
  await offerPreview(ctx, session);
});

bot.action("ced:cancel", async (ctx) => {
  clearSession(ctx.from.id);
  await ctx.editMessageText("❌ Cancelado.");
  await ctx.answerCbQuery();
});

// ============================================================
// Preview + send
// ============================================================
async function offerPreview(ctx, session) {
  const { pendingRule: rule, pendingData: data } = session;
  const { subject, body } = renderMessage(rule, data);

  const reglas = rule.Reglas_Especiales
    ? `\n\n📝 _Reglas especiales:_ ${rule.Reglas_Especiales}`
    : "";

  const subjectLine = subject ? `*Subject:* ${subject}\n\n` : "";
  const destinoWA = rule.Destino_WA ? `📱 WhatsApp: \`${rule.Destino_WA}\`\n` : "";
  const destinoEmail = rule.Destino_Email ? `📧 Email: \`${rule.Destino_Email}\`\n` : "";
  const cc = rule.CC_Email ? `   CC: \`${rule.CC_Email}\`\n` : "";

  let adjuntos = "";
  if (rule.Formato === "texto+pdf") adjuntos = "📎 Se adjuntará: PDF generado del template\n";
  if (rule.Formato === "pdf+fotos") {
    const n = session.idPhotos?.length || 0;
    adjuntos = `📎 Se adjuntará: PDF generado + ${n} foto(s) de cédulas\n`;
  }

  const preview =
    `📨 *Borrador para ${rule.Apto}*\n\n` +
    destinoWA + destinoEmail + cc + adjuntos +
    `\n${subjectLine}` +
    "```\n" + body + "\n```" +
    reglas;

  if (rule.Auto_Send) {
    await ctx.reply(`${preview}\n\n⚡ Auto-send activo. Enviando…`, { parse_mode: "Markdown" });
    await doSend(ctx, session);
    return;
  }

  await ctx.reply(
    preview,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("✅ Enviar", "send:yes")],
        [Markup.button.callback("❌ Cancelar", "send:no")],
      ]),
    }
  );
}

async function doSend(ctx, session) {
  try {
    const { channels } = await dispatch(session.pendingRule, session.pendingData, {
      screenshotBuffer: session.pendingScreenshot,
      idPhotos: session.idPhotos,
    });
    await ctx.reply(`✅ Enviado a: ${channels.join(" + ")}`);
  } catch (e) {
    log("error", "Dispatch failed:", e);
    await ctx.reply(`❌ Error enviando: ${e.message}`);
  }
  clearSession(ctx.from.id);
}

bot.action("send:yes", async (ctx) => {
  const session = getSession(ctx.from.id);
  if (!session.pendingRule || !session.pendingData) {
    await ctx.answerCbQuery("Nada pendiente");
    return;
  }
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  await ctx.reply("📤 Enviando…");
  await doSend(ctx, session);
  await ctx.answerCbQuery();
});

bot.action("send:no", async (ctx) => {
  clearSession(ctx.from.id);
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  await ctx.reply("❌ Cancelado.");
  await ctx.answerCbQuery();
});

// ============================================================
// Helpers
// ============================================================
function parseFechaInput(text) {
  const m1 = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[-–a]\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m1) {
    const [, d1, mo1, y1, d2, mo2, y2] = m1;
    return {
      entrada: `${y1}-${mo1.padStart(2, "0")}-${d1.padStart(2, "0")}`,
      salida: `${y2}-${mo2.padStart(2, "0")}-${d2.padStart(2, "0")}`,
    };
  }
  const meses = {
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
    julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  };
  const m2 = text.toLowerCase().match(/del?\s+(\d{1,2})\s+al\s+(\d{1,2})\s+de\s+(\w+)/);
  if (m2) {
    const [, d1, d2, mesNombre] = m2;
    const mo = meses[mesNombre];
    if (!mo) return null;
    const year = new Date().getFullYear();
    return {
      entrada: `${year}-${String(mo).padStart(2, "0")}-${d1.padStart(2, "0")}`,
      salida: `${year}-${String(mo).padStart(2, "0")}-${d2.padStart(2, "0")}`,
    };
  }
  return null;
}

bot.catch((err, ctx) => {
  log("error", `Telegraf error for ${ctx.updateType}:`, err);
});

export function startTelegram() {
  bot.launch();
  log("info", "Telegram bot started");
}

export function stopTelegram(signal) {
  bot.stop(signal);
}
