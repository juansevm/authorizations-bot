import { google } from "googleapis";
import NodeCache from "node-cache";
import { config, log } from "./config.js";

// Cache de .docx descargados (10 min). Si actualizas el template en Drive,
// se refresca solo en 10 min, o reinicia el bot.
const docCache = new NodeCache({ stdTTL: 600 });

let driveClient;

async function getDrive() {
  if (driveClient) return driveClient;
  const auth = new google.auth.GoogleAuth({
    credentials: config.sheet.serviceAccount,
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });
  driveClient = google.drive({ version: "v3", auth });
  return driveClient;
}

/**
 * Extract file ID from a Google Drive URL.
 * Supports formats like:
 *   https://docs.google.com/document/d/FILEID/edit
 *   https://drive.google.com/file/d/FILEID/view
 *   https://docs.google.com/spreadsheets/d/FILEID/edit
 */
export function extractFileId(url) {
  if (!url) return null;
  const patterns = [
    /\/document\/d\/([a-zA-Z0-9_-]+)/,
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

/**
 * Download a file from Drive. Auto-detects whether it's a native Google Doc
 * (needs export to .docx) or an uploaded .docx (download as-is).
 *
 * Returns a Buffer of the .docx content.
 */
export async function downloadDocxFromDrive(url) {
  const fileId = extractFileId(url);
  if (!fileId) throw new Error(`URL de Drive inválida: ${url}`);

  const cached = docCache.get(fileId);
  if (cached) return cached;

  log("info", `Descargando .docx de Drive: ${fileId}`);
  const drive = await getDrive();

  // Find out the mime type to decide download method
  const meta = await drive.files.get({ fileId, fields: "id, name, mimeType" });
  const mimeType = meta.data.mimeType;
  log("debug", `File "${meta.data.name}" mimeType=${mimeType}`);

  let buffer;
  if (mimeType === "application/vnd.google-apps.document") {
    // Native Google Doc → export as .docx
    const res = await drive.files.export(
      {
        fileId,
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
      { responseType: "arraybuffer" }
    );
    buffer = Buffer.from(res.data);
  } else if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    // Uploaded .docx → download as-is
    const res = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );
    buffer = Buffer.from(res.data);
  } else {
    throw new Error(
      `Tipo de archivo no soportado: ${mimeType}. El template debe ser un Google Doc o un .docx subido a Drive.`
    );
  }

  docCache.set(fileId, buffer);
  return buffer;
}

export function invalidateDocCache(url) {
  const fileId = extractFileId(url);
  if (fileId) docCache.del(fileId);
}
