# Use Node.js 20 as the base for the orchestration layer
FROM node:20-slim

# Install system dependencies for Python, Chrome, and Browsing Agent
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    wget \
    gnupg \
    ca-certificates \
    libnss3 \
    libatk-bridge2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install Google Chrome (Headless) for Nova Act execution
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update && apt-get install -y google-chrome-stable

WORKDIR /app

# Copy unified platform source
COPY . .

# Execute unified deployment script
# 1. Install Backend/Extension deps
# 2. Build production-grade extension distribution
RUN npm install && \
    npm install --prefix backend && \
    npm install --prefix extension && \
    npm run build --prefix extension

# Expose the Unified Gateway port
EXPOSE 5004

# Launch the coordinate Sonic + Act gateway
CMD ["npm", "run", "deploy"]
