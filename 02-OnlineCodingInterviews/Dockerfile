FROM node:20-slim AS builder

WORKDIR /app

# Install backend dependencies
COPY backend/package*.json backend/
RUN npm --prefix backend install --omit=dev

# Install frontend dependencies
COPY frontend/package*.json frontend/
RUN npm --prefix frontend install

# Copy source
COPY backend ./backend
COPY frontend ./frontend

# Build frontend and copy static assets into backend/public
RUN npm --prefix frontend run build \
  && rm -rf backend/public \
  && mkdir -p backend/public \
  && cp -R frontend/dist/* backend/public/

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000

COPY --from=builder /app/backend ./backend

EXPOSE 4000

CMD ["npm", "--prefix", "backend", "run", "start"]
