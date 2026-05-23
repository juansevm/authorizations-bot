FROM node:20-slim

# Install Chromium (for whatsapp-web.js) + LibreOffice (for .docx → PDF) + deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-freefont-ttf \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libgbm1 \
    libasound2 \
    libxshmfence1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libxkbcommon0 \
    libxfixes3 \
    libpango-1.0-0 \
    libcairo2 \
    libreoffice \
    libreoffice-writer \
    fonts-liberation \
    fonts-dejavu \
    ca-certificates \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Tell puppeteer to use the system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

# Default path inside the container where the WA session lives.
# In Railway, mount a Volume to this path so the session survives restarts.
ENV WHATSAPP_SESSION_PATH=/data/.wwebjs_auth
RUN mkdir -p /data/.wwebjs_auth

CMD ["node", "src/index.js"]
