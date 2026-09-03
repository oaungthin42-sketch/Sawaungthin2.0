FROM node:20-bookworm-slim

ENV NODE_ENV=production
ENV PATH="/opt/venv/bin:$PATH"

RUN DEBIAN_FRONTEND=noninteractive apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    gcc \
    g++ \
    make \
    fonts-noto-core \
    fonts-noto-unhinted \
    fonts-sil-padauk \
    chromium \
    fontconfig \
    git \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

COPY package*.json ./
RUN npm install

COPY . .

ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

RUN /opt/venv/bin/python3 src/ai/download_model.py

RUN npm run build

CMD ["node", "server.js"]
