import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mirai/contracts"],
  output: "standalone",
  // Native TypeScript 7 checks run before next build in the web package script.
  typescript: { ignoreBuildErrors: true },
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
};

export default nextConfig;
