FROM node:26-bookworm-slim AS build
WORKDIR /workspace
RUN npm install --global pnpm@10.33.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
RUN pnpm install --no-frozen-lockfile
COPY apps/web ./apps/web
COPY packages/contracts ./packages/contracts
RUN pnpm --filter @mirai/web build

FROM node:26-bookworm-slim AS runtime
WORKDIR /workspace
ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
COPY --from=build /workspace/apps/web/.next/standalone ./
COPY --from=build /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /workspace/apps/web/public ./apps/web/public
USER node
EXPOSE 8080
CMD ["node", "apps/web/server.js"]
