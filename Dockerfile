FROM oven/bun:1.1.43-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Zeabur must run the Bun HTTP server, because /api/* is served by server.js.
# Static hosting only can serve dist assets and will return 405 for POST /api/*.
RUN bun run build

EXPOSE 8080

CMD ["bun", "run", "server"]
