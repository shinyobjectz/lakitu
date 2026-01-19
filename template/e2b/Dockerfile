# Lakitu E2B Sandbox Template
# Self-hosted Convex agent with browser automation

FROM e2bdev/code-interpreter:latest

# System dependencies including Playwright requirements
RUN apt-get update && apt-get install -y \
    git curl sqlite3 libsqlite3-dev \
    build-essential python3-pip \
    unzip \
    # Playwright dependencies
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# Bun runtime
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:/home/user/.bun/bin:$PATH"

# Convex local backend
RUN curl -L https://github.com/get-convex/convex-backend/releases/latest/download/convex-local-backend-linux-x64.zip -o /tmp/convex.zip && \
    unzip /tmp/convex.zip -d /tmp && \
    mv /tmp/convex-local-backend /usr/local/bin/convex-backend && \
    chmod +x /usr/local/bin/convex-backend && \
    rm /tmp/convex.zip

# Node.js for npx convex
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# LSP servers
RUN npm install -g typescript typescript-language-server && \
    pip3 install python-lsp-server

# Directory structure
RUN mkdir -p /home/user/workspace /home/user/.convex /home/user/artifacts && \
    chown -R user:user /home/user

# Copy lakitu agent code
COPY --chown=user:user ../../ /home/user/lakitu/

# Copy scripts
COPY --chown=user:user ./start.sh /home/user/start.sh
COPY --chown=user:user ./prebuild.sh /home/user/prebuild.sh
RUN chmod +x /home/user/start.sh /home/user/prebuild.sh

# Install dependencies
WORKDIR /home/user/lakitu
RUN /root/.bun/bin/bun install || true

# Install Playwright browsers
RUN /root/.bun/bin/bunx playwright install chromium

# Pre-deploy Convex functions during build
RUN /home/user/prebuild.sh

# Fix ownership
RUN chown -R user:user /home/user/.convex

# Environment
ENV HOME=/home/user
ENV PATH="/home/user/.bun/bin:/usr/local/bin:/usr/bin:/bin"
ENV CONVEX_URL="http://localhost:3210"
ENV LOCAL_CONVEX_URL="http://localhost:3210"
ENV CONVEX_LOCAL_STORAGE="/home/user/.convex/convex-backend-state/lakitu"

USER user
WORKDIR /home/user/workspace
