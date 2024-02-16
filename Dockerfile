FROM oven/bun:1

WORKDIR /app

COPY package.json .
COPY bun.lockb .
COPY src .
COPY tsconfig.json .

RUN bun install

CMD ["bun", "src/index.ts"]

EXPOSE 3000



