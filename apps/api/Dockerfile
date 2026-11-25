FROM node:26-bookworm-slim@sha256:0042e17d232a87a2cd485be1da7900fca4d10a4ad11b29e9285da1d2e54798c9 AS dependencies
WORKDIR /workspace
RUN npm install --global pnpm@10.33.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json ./
COPY patches ./patches
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/extension/package.json ./apps/extension/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/cv-renderer/package.json ./packages/cv-renderer/package.json

FROM dependencies AS build
RUN pnpm install --frozen-lockfile
COPY apps/api ./apps/api
COPY packages/contracts ./packages/contracts
COPY packages/cv-renderer ./packages/cv-renderer
RUN pnpm --filter @mirai/contracts build
RUN pnpm --filter @mirai/cv-renderer build
RUN pnpm --filter @mirai/api build

FROM dependencies AS production-dependencies
RUN pnpm --filter @mirai/api... install --prod --frozen-lockfile

FROM node:26-bookworm-slim@sha256:0042e17d232a87a2cd485be1da7900fca4d10a4ad11b29e9285da1d2e54798c9 AS runtime
WORKDIR /workspace
ENV NODE_ENV=production
ENV PORT=8080
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=production-dependencies /workspace/node_modules ./node_modules
COPY --from=production-dependencies /workspace/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /workspace/apps/api/dist ./apps/api/dist
COPY --from=build /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=production-dependencies /workspace/packages/contracts ./packages/contracts
COPY --from=production-dependencies /workspace/packages/cv-renderer ./packages/cv-renderer
COPY --from=build /workspace/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /workspace/packages/cv-renderer/dist ./packages/cv-renderer/dist
COPY apps/web/public/fonts ./apps/web/public/fonts
USER node
EXPOSE 8080
CMD ["node", "apps/api/dist/bootstrap/server.js"]
