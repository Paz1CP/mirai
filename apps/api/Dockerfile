FROM node:26-bookworm-slim AS build
WORKDIR /workspace
RUN npm install --global pnpm@10.33.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
RUN pnpm install --no-frozen-lockfile
COPY apps/api ./apps/api
RUN pnpm --filter @mirai/api build

FROM node:26-bookworm-slim AS runtime
WORKDIR /workspace
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /workspace/apps/api/dist ./apps/api/dist
COPY --from=build /workspace/apps/api/package.json ./apps/api/package.json
USER node
EXPOSE 8080
CMD ["node", "apps/api/dist/bootstrap/server.js"]
