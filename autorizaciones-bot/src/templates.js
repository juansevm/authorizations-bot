const MESES_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * "2026-05-17" → "17 de mayo"
 */
export function formatFechaEs(iso) {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const dia = parseInt(m[3], 10);
  const mes = MESES_ES[parseInt(m[2], 10) - 1];
  return `${dia} de ${mes}`;
}

/**
 * "Del 17 al 23 de Mayo" si comparten mes, "Del 30 de mayo al 2 de junio" si no.
 */
export function formatFechaRango(entradaIso, salidaIso) {
  if (!entradaIso || !salidaIso) return "";
  const me = entradaIso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const ms = salidaIso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!me || !ms) return "";
  const diaE = parseInt(me[3], 10);
  const mesE = parseInt(me[2], 10);
  const diaS = parseInt(ms[3], 10);
  const mesS = parseInt(ms[2], 10);
  const nombreMesE = MESES_ES[mesE - 1];
  const nombreMesS = MESES_ES[mesS - 1];
  if (mesE === mesS) {
    return `Del ${diaE} al ${diaS} de ${capitalize(nombreMesE)}`;
  }
  return `Del ${diaE} de ${nombreMesE} al ${diaS} de ${nombreMesS}`;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Build the {{HUESPEDES}} block: "Nombre Apellido <cedula or (pendiente)>" per line.
 */
export function formatHuespedes(huespedes, { incluirCedula = true } = {}) {
  if (!huespedes || huespedes.length === 0) return "";
  return huespedes
    .map((h) => {
      const nombre = (h.nombre || "").trim();
      if (!incluirCedula) return nombre;
      const ced = h.cedula ? h.cedula.toString().trim() : "(pendiente)";
      return `${nombre} ${ced}`.trim();
    })
    .join("\n");
}

/**
 * Replace all {{PLACEHOLDERS}} in `template` using the extracted data + rule context.
 */
export function renderTemplate(template, { rule, data }) {
  if (!template) return "";
  const huespedes = formatHuespedes(data.huespedes, { incluirCedula: true });
  const huespedesSinCedula = formatHuespedes(data.huespedes, { incluirCedula: false });

  const replacements = {
    "{{APTO}}": rule.Apto,
    "{{APTO_NUM}}": rule.APTO_NUM,
    "{{HUESPEDES}}": huespedes,
    "{{HUESPEDES_SIN_CEDULA}}": huespedesSinCedula,
    "{{FECHA_ENTRADA}}": formatFechaEs(data.fecha_entrada),
    "{{FECHA_SALIDA}}": formatFechaEs(data.fecha_salida),
    "{{FECHA_RANGO}}": formatFechaRango(data.fecha_entrada, data.fecha_salida),
  };

  let out = template;
  for (const [k, v] of Object.entries(replacements)) {
    out = out.split(k).join(v);
  }
  return out;
}

/**
 * Build subject + body for a given rule + extracted data.
 */
export function renderMessage(rule, data) {
  return {
    subject: renderTemplate(rule.Subject_Template, { rule, data }),
    body: renderTemplate(rule.Body_Template, { rule, data }),
  };
}

/**
 * Check what data is missing for a rule. Returns an array of missing fields (human readable, in Spanish).
 */
export function detectMissingData(rule, data) {
  const missing = [];
  const tpl = (rule.Body_Template || "") + " " + (rule.Subject_Template || "");
  if (/\{\{FECHA_(ENTRADA|SALIDA|RANGO)\}\}/.test(tpl)) {
    if (!data.fecha_entrada) missing.push("fecha de entrada");
    if (!data.fecha_salida) missing.push("fecha de salida");
  }
  if (/\{\{HUESPEDES(_SIN_CEDULA)?\}\}/.test(tpl)) {
    if (!data.huespedes || data.huespedes.length === 0) {
      missing.push("nombres de huéspedes");
    }
  }
  return missing;
}

/**
 * Check whether any huésped is missing cedula. Returns array of names.
 */
export function huespedesSinCedula(data) {
  return (data.huespedes || []).filter((h) => !h.cedula).map((h) => h.nombre);
}
