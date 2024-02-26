FROM oven/bun:1

WORKDIR /app

COPY package.json .
COPY bun.lockb .
COPY src ./src
COPY tsconfig.json .

RUN bun install


CMD ["bun", "run", "start"]

EXPOSE 3000



