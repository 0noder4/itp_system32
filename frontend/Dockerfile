FROM node:22-alpine AS base
RUN apk update && apk upgrade && apk add --no-cache g++ make py3-pip libc6-compat

WORKDIR /app
COPY package*.json ./
EXPOSE 3000

# Dependencies stage
FROM base AS deps
WORKDIR /app
RUN npm ci --only=production

# Builder stage
FROM base AS builder
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build

# Production stage
FROM node:22-alpine AS production
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

RUN chown -R nextjs:nodejs /app
USER nextjs

CMD ["npm", "start"]

# Development stage
FROM base AS development
ENV NODE_ENV=development
WORKDIR /app
COPY . .
RUN npm install
CMD ["npm", "run", "dev"]