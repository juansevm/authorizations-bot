# Autorizaciones Bot

Bot de Telegram que recibe screenshots de reservas, extrae datos con IA (Claude Vision), y despacha autorizaciones a grupos de WhatsApp o correos según reglas en Google Sheets.

**Estado:** Fase 3 — soporta los 3 formatos (`texto`, `texto+pdf`, `pdf+fotos`).

📄 Antes de usar templates PDF, lee `DOCX_GUIDE.md` para preparar los .docx con la sintaxis correcta.

---

## Quick start: Despliegue en Railway

### 1. Subir a GitHub
Sube todos los archivos de este repo a un repositorio privado en GitHub.

### 2. Crear servicio en Railway
1. Railway → **New Project → Deploy from GitHub repo**
2. Selecciona tu repo
3. Railway detecta el Dockerfile y arranca primer build (~7 min: Chromium + LibreOffice)

### 3. Variables de entorno
En pestaña **Variables**, pega todas las del `.env.example`:

| Variable | Valor |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token de @BotFather |
| `TELEGRAM_ALLOWED_GROUP_ID` | Group ID (negativo) |
| `TELEGRAM_ALLOWED_USER_IDS` | Tu user ID (varios separados por coma) |
| `GOOGLE_SHEET_ID` | ID del spreadsheet |
| `GOOGLE_SHEET_TAB` | `Autorizaciones` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Contenido completo del .json en una sola línea |
| `ANTHROPIC_API_KEY` | `sk-ant-...` |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | Tu Gmail |
| `SMTP_PASSWORD` | App Password 16 chars sin espacios |
| `SMTP_FROM_NAME` | `Autorizaciones Bot` |
| `SMTP_FROM_EMAIL` | Tu Gmail |
| `SHEET_CACHE_TTL_SECONDS` | `60` |
| `WHATSAPP_SESSION_PATH` | `/data/.wwebjs_auth` |
| `NODE_ENV` | `production` |
| `LOG_LEVEL` | `info` |

Para `GOOGLE_SERVICE_ACCOUNT_JSON`: usa el Raw Editor de Railway o minifica el JSON en https://jsonformatter.org/json-minify y pégalo en una línea.

### 4. ⚠️ Crear Volume (CRÍTICO)
Sin esto pierdes la sesión de WhatsApp en cada redeploy.

1. Pestaña **Settings → Volumes**
2. Click **+ Volume**
3. **Mount path:** `/data`
4. Size: 1 GB

### 5. Primer deploy y QR
- Después del build, abre **Deployments → último deploy → View logs**
- Verás un QR ASCII en los logs
- WhatsApp en celular → Ajustes → Dispositivos vinculados → Vincular dispositivo → escanea
- Verifica en logs: `WhatsApp client ready`

### 6. Primera prueba
En el grupo de Telegram autorizado:
- `/start` → menú de ayuda
- `/aptos` → lista los aptos del Sheet
- `/grupos` → lista los grupos WhatsApp visibles (verifica que los nombres del Sheet coincidan exactamente con los reales)
- `claudia 201` + screenshot → primera autorización real

---

## Generación de credenciales

### Bot de Telegram
1. @BotFather → `/newbot` → guarda el token
2. `/setprivacy` → tu bot → **Disable** (crítico: sin esto el bot solo ve mensajes que lo mencionan con @)
3. Crea grupo, agrega el bot, manda mensaje
4. `https://api.telegram.org/bot<TOKEN>/getUpdates` → copia `chat.id` (negativo)
5. Tu user ID: @userinfobot → `/start`

### Google Service Account
1. [console.cloud.google.com](https://console.cloud.google.com/) → Nuevo proyecto
2. Habilita **Google Sheets API** y **Google Drive API**
3. Credenciales → Crear → Cuenta de servicio → descargar JSON
4. En Drive, comparte la carpeta `Autorizaciones Bot` con el email del service account (Lector)

### Anthropic
1. [console.anthropic.com](https://console.anthropic.com/) → Settings → API Keys → Create
2. Settings → Billing → Add credits (mínimo US$5, alcanza para ~500-1000 OCRs)

### Gmail SMTP
1. Activa 2FA en https://myaccount.google.com/security
2. https://myaccount.google.com/apppasswords → Nombre `autorizaciones-bot` → Create
3. Guarda los 16 chars

---

## Uso

**Flujo normal:**
1. `claudia 201` (o el apto)
2. Bot: "✅ Apto identificado. Mándame el screenshot."
3. Mandas screenshot del itinerario / chat / cédula
4. Bot extrae datos. Si falta algo, pregunta.
5. Para `pdf+fotos`: bot pide fotos de cédulas. Cuando termines: `/listo`
6. Auto-envía o pide confirmación según `Auto_Send` en el Sheet

**Comandos:**
- `/aptos` — lista aptos configurados
- `/reload` — fuerza recarga del Sheet
- `/grupos` — lista grupos WhatsApp visibles (debug)
- `/listo` — terminé de mandar fotos (modo pdf+fotos)
- `/cancel` — cancela operación en curso

---

## Healthcheck

El bot expone `GET /health` que retorna:
```json
{
  "ok": true,
  "whatsapp_ready": true,
  "uptime_seconds": 3600,
  "env": "production"
}
```
Útil para configurar healthcheck en Railway (Settings → Health Check Path: `/health`).

---

## Editar reglas

Edita el Google Sheet "Autorizaciones Reglas" directamente. El bot relee cada 60s (configurable). Para forzar: `/reload`.

---

## Troubleshooting

**"No encontré el grupo de WhatsApp..."**
→ Usa `/grupos` para ver los nombres exactos que el bot ve y compara con el Sheet.

**"Cannot read Sheet"**
→ ¿Compartiste el Sheet (o la carpeta) con el service account?

**"GOOGLE_SERVICE_ACCOUNT_JSON no es JSON válido"**
→ El JSON debe ir en una sola línea. Usa un minifier antes de pegar en Railway.

**WhatsApp se desconecta seguido**
→ Normal con la librería no-oficial. Si pasa mucho, considera WhatsApp Business API.

**Build tarda mucho en Railway**
→ El primer build dura ~7 min (Chromium 300MB + LibreOffice 400MB). Los redeploys son más rápidos por caching.

**Necesito desarrollar local**
→ El bot puede correr local también. Necesitas Node v20+ y LibreOffice instalado en tu OS. Copia `.env.example` a `.env`, llena valores, `npm install && npm start`. Cuando vayas a usar local, pausa el servicio de Railway primero (WhatsApp solo permite una sesión activa).

---

## Próximas fases

- **Fase 4** — casos especiales: Buitrago 419, Black, reglas "ARRIENDO" 602/603
- **Fase 5** — observabilidad y alertas
