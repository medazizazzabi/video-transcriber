# Stage 1: Build the Next.js application
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json yarn.lock ./
# If you use npm, use package-lock.json instead of yarn.lock
# COPY package.json package-lock.json ./

RUN yarn install --frozen-lockfile

COPY . .

ENV NEXT_TELEMETRY_DISABLED 1

RUN yarn build

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
CMD ["yarn", "start"] # Or ["npm", "start"]