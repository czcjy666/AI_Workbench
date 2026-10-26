# AI协同工作台 —— 单容器：opencode(4096 内部) + 网关(7777 同源托管前端)
FROM mirror.ccs.tencentyun.com/library/node:20-bookworm-slim

WORKDIR /app

# 国内镜像加速（包体与平台二进制都能命中 npmmirror）
RUN npm config set registry https://registry.npmmirror.com

# 先拷清单装依赖，命中层缓存
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
RUN npm install --no-audit --no-fund --include=dev

# 拷源码并构建前端 → apps/web/dist
COPY . .
RUN npm run build --workspace web

ENV NODE_ENV=production \
    GATEWAY_PORT=7777 \
    GATEWAY_HOST=0.0.0.0 \
    OPENCODE_BASE=http://127.0.0.1:4096

EXPOSE 7777

# opencode 后台拉起，等其就绪后网关前台运行（exec 让网关接管 PID1）
CMD ["sh","-c","npx opencode serve --port 4096 --hostname 127.0.0.1 --cors '*' >/tmp/oc.log 2>&1 & sleep 6 && exec node apps/gateway/server.mjs"]
