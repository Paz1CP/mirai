import { cookies, headers } from "next/headers";
import { resolveLocale } from "./catalog";
export async function getLocale() {
  const saved = (await cookies()).get("mirai-locale")?.value;
  if (saved === "es" || saved === "en") return saved;
  const languages = ((await headers()).get("accept-language") ?? "")
    .split(",")
    .map((entry) => {
      const [language, ...parameters] = entry.trim().split(";");
      const quality = parameters.find((parameter) => parameter.trim().startsWith("q="));
      return {
        language: (language ?? "").toLowerCase().split("-")[0],
        quality: quality ? Number(quality.trim().slice(2)) : 1,
      };
    })
    .filter(({ language, quality }) => (language === "es" || language === "en") && quality > 0)
    .sort((a, b) => b.quality - a.quality);
  return resolveLocale(languages[0]?.language);
}
