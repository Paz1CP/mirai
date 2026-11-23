import { workspaceSocketPath } from "@mirai/contracts";

const productionOrigin = "https://mirai-web-4nag7kzycq-uk.a.run.app";
const configuredOrigin = new URL(import.meta.env.WXT_WEB_ORIGIN ?? "http://localhost:3000").origin;

export const miraiWebOrigins = [...new Set([productionOrigin, configuredOrigin])];

export const miraiWebMatches = miraiWebOrigins.map((origin) => {
  const { protocol, hostname } = new URL(origin);
  return `${protocol}//${hostname}/*`;
});

export function workspaceUrl(origin: string) {
  const api =
    origin === productionOrigin
      ? "https://mirai-api-4nag7kzycq-uk.a.run.app"
      : (import.meta.env.WXT_API_ORIGIN ?? "http://localhost:4000");
  const url = new URL(workspaceSocketPath, api);
  if (url.protocol === "https:") url.protocol = "wss:";
  else if (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
    url.protocol = "ws:";
  else throw new Error("Invalid Mirai API origin.");
  return url.href;
}
