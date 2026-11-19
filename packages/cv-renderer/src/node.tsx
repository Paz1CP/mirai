import { fileURLToPath } from "node:url";
import { renderToBuffer } from "@react-pdf/renderer";
import type { ProfessionalProfile } from "@mirai/contracts";
import { registerStandardCvFonts, StandardCv } from "./StandardCv.js";

registerStandardCvFonts((name) =>
  fileURLToPath(new URL(`../../../apps/web/public/fonts/${name}`, import.meta.url)),
);

export function renderCvAttachment(profile: ProfessionalProfile, locale: "es" | "en") {
  return renderToBuffer(<StandardCv profile={profile} locale={locale} />);
}
