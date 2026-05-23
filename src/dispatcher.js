import { sendText, sendMedia } from "./whatsapp.js";
import { sendEmail } from "./email.js";
import { renderMessage } from "./templates.js";
import { renderPdfFromTemplate, pdfFilenameFor } from "./pdf.js";
import { log } from "./config.js";

/**
 * Dispatch an authorization to all configured channels per the rule.
 *
 * Supported formats:
 *   - "texto"       → plain message (WhatsApp and/or Email)
 *   - "texto+pdf"   → message + generated PDF (WhatsApp and/or Email)
 *   - "pdf+fotos"   → PDF + photos of IDs (typically Email only)
 *
 * @param {object} rule
 * @param {object} data - OCR result
 * @param {object} [opts]
 * @param {Buffer[]} [opts.idPhotos] - Buffers de cédulas/pasaportes (para Valen 517, Patricia 518)
 * @param {Buffer} [opts.screenshotBuffer] - screenshot original (se adjunta al email si no hay PDF)
 * @returns {Promise<{channels:string[]}>}
 */
export async function dispatch(rule, data, opts = {}) {
  const { subject, body } = renderMessage(rule, data);
  const channels = [];

  const canal = rule.Canal;
  const sendsWA = canal === "whatsapp" || canal === "whatsapp+email";
  const sendsEmail = canal === "email" || canal === "whatsapp+email";

  const formato = rule.Formato;
  const needsPdf = formato === "texto+pdf" || formato === "pdf+fotos";
  const needsPhotos = formato === "pdf+fotos";

  if (needsPdf && !rule.Doc_Template_URL) {
    throw new Error(
      `Apto ${rule.Apto} tiene Formato=${formato} pero Doc_Template_URL está vacío`
    );
  }
  if (needsPhotos && (!opts.idPhotos || opts.idPhotos.length === 0)) {
    throw new Error(
      `Apto ${rule.Apto} requiere fotos de cédulas (Formato=pdf+fotos). Mándalas antes de enviar.`
    );
  }

  let pdfBuffer = null;
  let pdfFilename = null;
  if (needsPdf) {
    log("info", `Generando PDF para ${rule.Apto}…`);
    pdfBuffer = await renderPdfFromTemplate(rule.Doc_Template_URL, rule, data);
    pdfFilename = pdfFilenameFor(rule, data);
  }

  if (sendsWA) {
    if (!rule.Destino_WA) {
      throw new Error(`Apto ${rule.Apto} tiene Canal=${canal} pero Destino_WA está vacío`);
    }
    if (pdfBuffer) {
      await sendMedia(rule.Destino_WA, body, pdfBuffer, "application/pdf", pdfFilename);
    } else {
      await sendText(rule.Destino_WA, body);
    }
    channels.push(`WhatsApp: ${rule.Destino_WA}`);
  }

  if (sendsEmail) {
    if (!rule.Destino_Email) {
      throw new Error(`Apto ${rule.Apto} tiene Canal=${canal} pero Destino_Email está vacío`);
    }
    const attachments = [];
    if (pdfBuffer) {
      attachments.push({
        filename: pdfFilename,
        content: pdfBuffer,
        contentType: "application/pdf",
      });
    }
    if (needsPhotos && opts.idPhotos) {
      opts.idPhotos.forEach((buf, i) => {
        attachments.push({
          filename: `ID_${i + 1}.jpg`,
          content: buf,
          contentType: "image/jpeg",
        });
      });
    }
    if (!pdfBuffer && opts.screenshotBuffer) {
      attachments.push({
        filename: "screenshot.jpg",
        content: opts.screenshotBuffer,
        contentType: "image/jpeg",
      });
    }
    await sendEmail({
      to: rule.Destino_Email,
      cc: rule.CC_Email || undefined,
      subject: subject || `Autorización Apto ${rule.APTO_NUM}`,
      body: body || `Adjunto autorización del Apto ${rule.APTO_NUM}.`,
      attachments,
    });
    channels.push(`Email: ${rule.Destino_Email}`);
  }

  log("info", `Dispatch OK · ${rule.Apto} · ${formato} · ${channels.join(" + ")}`);
  return { channels };
}
