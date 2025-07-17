# Use Node.js 18 LTS as base image
FROM node:18

# Install system dependencies for PostgreSQL
RUN apt-get update && apt-get install -y \
    postgresql-client \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy TypeScript source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Environment variables for PostgreSQL connection
ENV POSTGRES_HOST=postgres
ENV POSTGRES_PORT=5432
ENV POSTGRES_DB=ugi_rankings
ENV POSTGRES_USER=postgres

# Health check (check if app can connect to database)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node dist/index.js test-db || exit 1

# Default command (can be overridden)
CMD ["node", "dist/index.js", "--help"]
