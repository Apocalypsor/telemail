# Build context = monorepo root（apps/worker/wrangler.jsonc 的 image_build_context: "../.."）。
# Middleware 是 bun workspace 的子包，install 时需要 root package.json + bun.lock
# 才能解析依赖；产物是 `bun build --compile` 产生的单文件 binary，runtime stage
# 只 copy binary，不带 node_modules。

FROM oven/bun AS build

WORKDIR /app

# 复制 root workspace manifest + 子包 manifest（缓存依赖层，src 改动不会触发重装）
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/middleware/package.json apps/middleware/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/page/package.json apps/page/package.json

RUN bun install --frozen-lockfile --filter telemail-middleware

# 再 copy middleware 自身的源码 + tsconfig（tsconfig.json extends ../../tsconfig.base.json
# 拿 path alias，所以根 base 必须在 build context 里）
COPY apps/middleware/src apps/middleware/src
COPY apps/middleware/tsconfig.json apps/middleware/tsconfig.json

WORKDIR /app/apps/middleware

ENV NODE_ENV=production

RUN bun build \
	--compile \
	--minify-whitespace \
	--minify-syntax \
	--outfile server \
	src/index.ts

FROM gcr.io/distroless/base

WORKDIR /app

COPY --from=build /app/apps/middleware/server server

ENV NODE_ENV=production

CMD ["./server"]

EXPOSE 3000
