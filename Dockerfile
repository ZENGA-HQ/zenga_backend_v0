# Multi-stage Dockerfile for ZENGA
FROM node:22-alpine AS builder
WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm install  # Changed from npm ci

# Copy source and build
COPY . .
RUN npm run build

# Runner stage: only production deps + built dist
FROM node:22-alpine AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev  # Changed from npm ci --omit=dev

# Copy built files from builder
COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 5500

CMD ["node", "dist/server.js"]