import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Day1: local file store + multipart upload — keep cacheComponents off
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
