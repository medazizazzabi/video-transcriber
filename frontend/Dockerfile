# Stage 1: Build the Next.js application
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./ # Use package-lock.json for npm

RUN npm ci # Use npm ci for clean and fast install in CI/CD/Docker

COPY . .

ENV NEXT_TELEMETRY_DISABLED 1 # Optional: Disable Next.js telemetry during build

RUN npm run build # This is the critical step!

# Stage 2: Run the Next.js application
FROM node:20-alpine AS runner

WORKDIR /app

# Copy necessary files from the builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# If you have a public directory with static assets, copy it too
COPY public ./public

# Set the port for the Next.js server
ENV PORT 3000

# Expose the port
EXPOSE 3000

# Command to start the Next.js production server
CMD ["npm", "start"]