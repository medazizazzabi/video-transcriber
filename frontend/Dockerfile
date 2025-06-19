# Stage 1: Build the Next.js application
FROM node:20-alpine AS builder

WORKDIR /app

# Corrected line: Move the comment to its own line or remove it
COPY package.json package-lock.json ./
# Use package-lock.json for npm (optional comment, can be on its own line)

RUN npm ci

COPY . .

ENV NEXT_TELEMETRY_DISABLED 1

RUN npm run build

# Stage 2: Run the Next.js application
FROM node:20-alpine AS runner

WORKDIR /app

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

COPY public ./public

ENV PORT 3000

EXPOSE 3000

CMD ["npm", "start"]