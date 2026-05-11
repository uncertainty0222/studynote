import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Railway는 PORT 환경변수를 자동으로 주입함
  serverExternalPackages: ["postgres", "web-push"],
};

export default nextConfig;
