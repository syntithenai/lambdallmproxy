# Lambda LLM Proxy - Production Docker Image
FROM node:20-alpine

# Install required system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY puppeteer-package.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create cache directory
RUN mkdir -p /tmp/cache

# Expose port
EXPOSE 3000

# Set environment variable for local Lambda mode
ENV LOCAL_LAMBDA=true

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# Start the local Lambda server
CMD ["node", "scripts/run-local-lambda.js"]
