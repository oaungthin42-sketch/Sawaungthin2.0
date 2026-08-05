# Use an official lightweight Node.js 20 Debian image
FROM node:20-bookworm-slim

# Set production environment variables
ENV NODE_ENV=production
ENV PATH="/opt/venv/bin:$PATH"

# Install system dependencies: Python 3, venv, development tools, and ffmpeg
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
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

# Set up the working directory inside the container
WORKDIR /app

# Copy python package requirements first for efficient layer caching
COPY requirements.txt ./

# Create a virtual environment and install faster-whisper and python dependencies
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt \
    && /opt/venv/bin/pip install --no-cache-dir --no-deps git+https://github.com/myshell-ai/OpenVoice.git

# Copy package configurations
COPY package*.json ./

# Install npm dependencies (including devDependencies required to build the Vite client)
RUN npm install

# Copy the rest of the application files
COPY . .

# Pre-download and cache the faster-whisper model during the build stage
# This ensures zero runtime downloads and complete offline execution
RUN /opt/venv/bin/python3 src/ai/download_model.py

# Pre-download and cache the OpenVoice V2 checkpoints during the build stage
RUN /opt/venv/bin/python3 src/ai/download_openvoice.py

# Build the client-side React code with Vite
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN echo ">>> BUILD-TIME CLIENT ID VALUE: [$VITE_GOOGLE_CLIENT_ID]"

RUN npm run build


# Start the full-stack server
CMD ["node", "server.js"]
