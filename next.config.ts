import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  poweredByHeader: false,
  reactCompiler: true,
  typedRoutes: true,
};

export default nextConfig;
