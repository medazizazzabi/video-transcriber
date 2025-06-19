# Stage 1: Build the Next.js application
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy the rest of your application code
COPY . .

# Build the Next.js application
# Use 'next build' directly as it's the standard command
RUN npm run build

# Stage 2: Serve the Next.js application
FROM node:20-alpine AS runner

# Set working directory
WORKDIR /app

# Install only production dependencies
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
RUN npm ci --omit=dev

# Copy the built application from the builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
# Important: Copy node_modules from the builder stage as Next.js needs these at runtime
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Expose the port Next.js runs on
EXPOSE 3000

# Command to run the Next.js application
# Use 'next start' directly, or 'npm start' if 'start' script is defined in package.json
CMD ["npm", "run","dev"]
# Alternatively, if your package.json does NOT have a "start" script:
# CMD ["node_modules/.bin/next", "start"]