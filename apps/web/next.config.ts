import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mirai/contracts"],
};

export default nextConfig;
