# Changelog

## v0.3.0 — Mejoras para Railway (mayo 2026)
- Agregado endpoint HTTP `/health` que retorna estado del bot (uptime, whatsapp_ready)
  - Railway puede usarlo como healthcheck, escucha en `process.env.PORT` (o 8080 local)
- Documentación específica de despliegue en Railway en el README
- Pequeñas mejoras de log

## v0.2.0 — Fase 3 completa (PDFs)
- Soporte para `Formato=texto+pdf` (Santa Clara, 3 aptos)
- Soporte para `Formato=pdf+fotos` (Area 97, 2 aptos)
- Integración con docxtemplater + LibreOffice para conversión .docx → PDF
- Loop `{#huespedes_list}...{/huespedes_list}` en templates Word
- Recolección de fotos de IDs con comando `/listo`

## v0.1.0 — Fase 1 (texto plano)
- Estructura base del bot: Telegram + WhatsApp + Sheets + OCR + SMTP
- Soporte para `Formato=texto` (mayoría de aptos)
- Manejo de datos faltantes (fechas, cédulas)
- Cache del Sheet con TTL configurable
