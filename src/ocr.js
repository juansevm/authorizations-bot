import Anthropic from "@anthropic-ai/sdk";
import { config, log } from "./config.js";

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

const SYSTEM_PROMPT = `Eres un asistente especializado en extraer datos estructurados de screenshots de reservas de Airbnb, chats con huéspedes, y fotos de documentos de identidad.

Tu tarea: extraer los siguientes campos del screenshot que recibas. Si un campo no aparece o no estás seguro, devuelve null para ese campo.

Devuelve EXCLUSIVAMENTE un objeto JSON válido (sin texto adicional, sin markdown) con esta forma exacta:

{
  "fecha_entrada": "YYYY-MM-DD" o null,
  "fecha_salida": "YYYY-MM-DD" o null,
  "huespedes": [
    { "nombre": "Nombre completo", "cedula": "1019060822" o null }
  ],
  "notas": "cualquier observación útil que veas en la imagen, en español, max 200 caracteres" o null
}

Reglas:
- Las fechas pueden venir como "May 17 – 23", "17 al 23 de mayo", "17/05/2026", etc. Si no hay año, asume el año actual o el próximo (lo que sea más cercano y futuro). 
- Las cédulas colombianas tienen entre 6 y 10 dígitos sin puntos ni guiones. Pasaportes son alfanuméricos.
- Si el screenshot es un chat de Airbnb donde el huésped pegó "Juan Pérez 1019060822", separar nombre y cédula.
- Si solo aparece nombre sin documento, cedula = null.
- Si solo aparece documento sin nombre asociable, omitir esa entrada de huespedes (no inventar nombres).
- Si la imagen no contiene información de reserva o huéspedes, devuelve todos los campos en null y huespedes: [].`;

/**
 * @param {Buffer|string} imageData - Buffer of the image, or base64 string
 * @param {string} mediaType - "image/jpeg" | "image/png" | "image/webp"
 * @returns {Promise<{fecha_entrada:string|null, fecha_salida:string|null, huespedes:Array, notas:string|null}>}
 */
export async function extractFromImage(imageData, mediaType = "image/jpeg") {
  const base64 =
    Buffer.isBuffer(imageData) ? imageData.toString("base64") : imageData;

  log("debug", "Calling Claude Vision for OCR…");

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          {
            type: "text",
            text: "Extrae los datos de este screenshot según las reglas. Devuelve solo el JSON.",
          },
        ],
      },
    ],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  // Strip possible ```json fences
  const clean = text.replace(/```json|```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (e) {
    log("error", "OCR returned non-JSON:", text);
    throw new Error("La IA no devolvió JSON válido. Revisar logs.");
  }
  return parsed;
}
