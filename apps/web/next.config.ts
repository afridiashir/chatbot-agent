import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages are published as raw TypeScript.
  transpilePackages: ["@repo/types"],
};

export default nextConfig;
