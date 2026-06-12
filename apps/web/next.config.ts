import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // keep server-only packages out of the client bundle
  serverExternalPackages: ["pg", "pg-boss"],
};

export default nextConfig;
