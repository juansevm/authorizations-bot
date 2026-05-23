import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import libre from "libreoffice-convert";
import { promisify } from "util";
import { downloadDocxFromDrive } from "./drive.js";
import { formatFechaEs, formatFechaRango, formatHuespedes } from "./templates.js";
import { log } from "./config.js";

const libreConvert = promisify(libre.convert);

/**
 * Build the data object that docxtemplater will use to replace {placeholders} in the .docx.
 *
 * Inside the .docx, use SINGLE braces: {APTO_NUM}, {HUESPEDES}, {FECHA_RANGO}, etc.
 * (Note: in the Sheet's Body_Template / Subject_Template we still use DOUBLE braces
 *  because those are processed by our own renderer in templates.js. Different engines.)
 */
function buildDocxData(rule, data) {
  // huespedes_list: array de {nombre, cedula} para usar con loops {#huespedes_list}...{/huespedes_list}
  // El array siempre tiene cedula con valor (o "(pendiente)" si faltaba)
  const huespedes_list = (data.huespedes || []).map((h) => ({
    nombre: (h.nombre || "").trim(),
    cedula: h.cedula ? h.cedula.toString().trim() : "(pendiente)",
  }));

  return {
    APTO: rule.Apto,
    APTO_NUM: rule.APTO_NUM,
    HUESPEDES: formatHuespedes(data.huespedes, { incluirCedula: true }),
    HUESPEDES_SIN_CEDULA: formatHuespedes(data.huespedes, { incluirCedula: false }),
    huespedes_list,
    FECHA_ENTRADA: formatFechaEs(data.fecha_entrada),
    FECHA_SALIDA: formatFechaEs(data.fecha_salida),
    FECHA_RANGO: formatFechaRango(data.fecha_entrada, data.fecha_salida),
  };
}

/**
 * Render a .docx template by filling its {placeholders} and convert to PDF.
 *
 * @param {string} templateUrl - Google Drive URL
 * @param {object} rule
 * @param {object} data - OCR result
 * @returns {Promise<Buffer>} - PDF as Buffer
 */
export async function renderPdfFromTemplate(templateUrl, rule, data) {
  const docxBuffer = await downloadDocxFromDrive(templateUrl);

  // 1) Open .docx as ZIP, fill placeholders
  const zip = new PizZip(docxBuffer);
  let doc;
  try {
    doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true, // \n in HUESPEDES becomes a line break in Word
      delimiters: { start: "{", end: "}" },
    });
  } catch (e) {
    log("error", "Docxtemplater init error:", e);
    throw new Error("El template .docx tiene un error de sintaxis. Revisa que los {placeholders} estén bien escritos.");
  }

  const docData = buildDocxData(rule, data);
  log("debug", "Rendering docx with data:", Object.keys(docData));

  try {
    doc.render(docData);
  } catch (e) {
    // docxtemplater throws structured errors; surface a friendly message
    const tag = e.properties?.id || e.message;
    log("error", "Docxtemplater render error:", e);
    throw new Error(`Error rellenando el template: ${tag}. Verifica los {placeholders} en el .docx.`);
  }

  const filledDocx = doc.getZip().generate({ type: "nodebuffer" });

  // 2) Convert filled .docx to PDF using LibreOffice headless
  log("debug", "Converting .docx → PDF…");
  const pdfBuffer = await libreConvert(filledDocx, ".pdf", undefined);
  log("info", `PDF generated for ${rule.Apto} (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);

  return pdfBuffer;
}

/**
 * Compute the filename for the generated PDF.
 */
export function pdfFilenameFor(rule, data) {
  const safeApto = rule.Apto.replace(/\s+/g, "_");
  const fechas = data.fecha_entrada
    ? `_${data.fecha_entrada}_${data.fecha_salida || ""}`
    : "";
  return `Autorizacion_${safeApto}${fechas}.pdf`;
}
