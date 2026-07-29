FROM oven/bun:1.3.14

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

ENV NODE_ENV=development
EXPOSE 5175

CMD ["sh", "-c", "bun install --frozen-lockfile && exec bun run dev"]
