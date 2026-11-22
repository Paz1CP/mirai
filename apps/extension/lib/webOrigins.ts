const productionOrigin = "https://mirai-web-4nag7kzycq-uk.a.run.app";
const configuredOrigin = new URL(import.meta.env.WXT_WEB_ORIGIN ?? "http://localhost:3000").origin;

export const miraiWebOrigins = [...new Set([productionOrigin, configuredOrigin])];

export const miraiWebMatches = miraiWebOrigins.map((origin) => {
  const { protocol, hostname } = new URL(origin);
  return `${protocol}//${hostname}/*`;
});
