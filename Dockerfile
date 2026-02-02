# Multi-stage Dockerfile for ZENGA
# Builder stage: install deps and build TypeScript
FROM node:18-alpine AS builder
WORKDIR /usr/src/app

# Install dependencies (uses package-lock.json)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Runner stage: only production deps + built dist
FROM node:18-alpine AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --only=production

# Copy built files from builder
COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 5500

# Run the compiled server
CMD ["node", "dist/server.js"]
