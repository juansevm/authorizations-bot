# Autorizaciones Bot

Bot de Telegram que recibe screenshots de reservas, extrae datos con IA (Claude Vision), y despacha autorizaciones a grupos de WhatsApp o correos según reglas definidas en un Google Sheet.

## Estado actual: **Fase 3** (todos los formatos soportados)

Cubre los 3 formatos:
- `texto` — mensaje simple a WhatsApp/email
- `texto+pdf` — mensaje + PDF generado del template
- `pdf+fotos` — PDF + fotos de cédulas (Valen 517, Patricia 518)

📄 **Antes de usar PDFs:** lee `DOCX_GUIDE.md` y prepara los 5 `.docx` con los placeholders correctos.

---

## 1. Setup local (desarrollo)

```bash
git clone <tu-repo>
cd autorizaciones-bot
cp .env.example .env       # luego llena los valores
npm install
npm start                  # imprime QR la primera vez
```

La primera vez verás un QR de WhatsApp en la consola. Escanéalo desde tu celular: **WhatsApp → Ajustes → Dispositivos vinculados → Vincular dispositivo**.

---

## 2. Credenciales que tienes que generar

### 2.1 Bot de Telegram

1. Abre Telegram → habla con [@BotFather](https://t.me/BotFather)
2. `/newbot` → ponle nombre y username
3. Copia el token → va en `TELEGRAM_BOT_TOKEN`
4. Crea un grupo de Telegram (el que vas a usar para el bot)
5. Agrega tu bot al grupo
6. Manda cualquier mensaje en el grupo
7. Abre en tu browser: `https://api.telegram.org/bot<TU_TOKEN>/getUpdates`
8. Busca `"chat":{"id":-100xxxxxxxxxx` → ese número (con el `-`) va en `TELEGRAM_ALLOWED_GROUP_ID`
9. Habla con [@userinfobot](https://t.me/userinfobot) → te da tu user ID → va en `TELEGRAM_ALLOWED_USER_IDS` (separa con coma si hay varios usuarios)

### 2.2 Google Service Account (para leer el Sheet)

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un proyecto nuevo (o usa uno existente)
3. **APIs y servicios → Biblioteca**: habilita "Google Sheets API" y "Google Drive API"
4. **APIs y servicios → Credenciales → Crear credencial → Cuenta de servicio**
5. Dale un nombre (`autorizaciones-bot`), crea
6. En la lista de service accounts, click en el que creaste → pestaña "Claves" → "Agregar clave" → "Crear nueva clave" → tipo **JSON**
7. Se descarga un archivo `.json`. Abre y copia TODO su contenido en una sola línea
8. Pega en `GOOGLE_SERVICE_ACCOUNT_JSON`
9. En tu Google Sheet, dale al botón **Compartir** y pega el correo del service account (termina en `.iam.gserviceaccount.com`) con permiso de "Lector"
10. **TAMBIÉN comparte con ese mismo correo los 5 `.docx`** de plantilla en Drive (los de Rafael 404, Valen 517, etc.)

`GOOGLE_SHEET_ID` lo sacas de la URL del Sheet: `https://docs.google.com/spreadsheets/d/<ESTE_ES_EL_ID>/edit`

### 2.3 Anthropic API key

1. Ve a [console.anthropic.com](https://console.anthropic.com/)
2. **Settings → API Keys → Create Key**
3. Copia → va en `ANTHROPIC_API_KEY`
4. Pon créditos en la cuenta (US$5 te dan para muchísimas autorizaciones — cada OCR cuesta ~$0.01)

### 2.4 SMTP de Gmail

1. Activa **autenticación de 2 factores** en tu cuenta de Google si no la tienes
2. Ve a [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Crea una "App Password" (nombre: `autorizaciones-bot`)
4. Google te da 16 caracteres → van en `SMTP_PASSWORD`
5. `SMTP_USER` y `SMTP_FROM_EMAIL` son tu correo Gmail completo

---

## 3. Despliegue en Railway

### 3.1 Push a GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <tu-repo-en-github>
git push -u origin main
```

### 3.2 En Railway
1. **New Project → Deploy from GitHub repo** → selecciona tu repo
2. Railway detecta el `Dockerfile` automáticamente
3. **Variables** (tab): pega todas las del `.env`
4. **Volumes**: crea un volumen montado en `/data` (esto persiste la sesión de WhatsApp entre reinicios)
5. Deploy

### 3.3 Primera conexión de WhatsApp
- Abre los logs en Railway
- Verás el QR ASCII impreso
- Escanéalo con tu celular en máximo 60 segundos
- A partir de ese momento, la sesión queda guardada en el volumen y no tienes que volver a escanear

⚠️ **Si Railway hace redeploy sin volumen, pierdes la sesión.** Verifica que el volumen esté correctamente montado en `/data`.

---

## 4. Uso

En el grupo de Telegram autorizado:

**Comandos:**
- `/start` — ayuda
- `/aptos` — lista de aptos configurados
- `/reload` — fuerza recarga del Sheet
- `/grupos` — lista los grupos de WhatsApp que el bot ve (debug)
- `/cancel` — cancela la operación en curso

**Flujo normal:**
1. Mandas texto: `Claudia 201`
2. Bot responde: "✅ Apto identificado. Mándame el screenshot."
3. Mandas el screenshot de la reserva (Airbnb / chat / cédula)
4. Bot extrae datos. Si falta algo te pregunta.
5. Si el formato es `pdf+fotos` (Valen 517, Patricia 518), el bot ahora pide las fotos de las cédulas:
   - Mandas una o varias fotos
   - Cuando termines: `/listo`
6. Si `Auto_Send=TRUE` en el Sheet → envía directo. Si no → muestra borrador con botón Enviar/Cancelar.

**Atajo:** también puedes mandar la foto con caption = nombre del apto en un solo mensaje.

---

## 5. Cómo editar reglas

Edita directamente el Google Sheet "Autorizaciones Reglas". El bot relee cada 60 segundos (configurable con `SHEET_CACHE_TTL_SECONDS`). Para forzar: `/reload`.

---

## 6. Lo que viene en próximas fases

- **Fase 4** — casos especiales: Buitrago 419 (email + screenshot al grupo Oikos automático), Black (recordar capacidad máxima), reglas tipo "ARRIENDO" para Patricia 602 / Isabel 603
- **Fase 5** — observabilidad: alertas si WA se desconecta, métricas, logs persistentes

---

## 7. Troubleshooting

**"No encontré el grupo de WhatsApp..."**
→ El nombre en `Destino_WA` debe ser EXACTO. Usa `/grupos` para ver los nombres tal como el bot los ve.

**"Cannot read Sheet"**
→ ¿Compartiste el Sheet con el service account?

**WhatsApp se desconecta seguido**
→ Es normal con la librería no-oficial. Si pasa mucho, considera migrar a WhatsApp Business API (oficial) en el futuro.
