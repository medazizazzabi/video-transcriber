# Stage 1: Build the Next.js application
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package.json and yarn.lock/package-lock.json to leverage Docker cache
COPY package.json yarn.lock* ./
# OR for npm: COPY package.json package-lock.json ./

# Install dependencies (using yarn as an example, adjust for npm if needed)
RUN yarn install --frozen-lockfile --production=false
# OR for npm: RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the Next.js application
RUN yarn build
# OR for npm: RUN npm run build

# Stage 2: Run the Next.js application
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy built application and production dependencies from the builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY package.json ./

# Expose the port Next.js will run on
EXPOSE 3000

# Command to run the Next.js production server
CMD ["yarn", "start"]
# OR for npm: CMD ["npm", "start"]