FROM node:20-slim AS base

WORKDIR /app

# Install root orchestrator deps (concurrently, etc.)
COPY package*.json ./
COPY backend/package*.json backend/
COPY frontend/package*.json frontend/

RUN npm install \
  && npm --prefix backend install \
  && npm --prefix frontend install

# Copy source after dependencies to leverage Docker layer caching
COPY . .

EXPOSE 4000
EXPOSE 5173

CMD ["npm", "run", "dev"]
