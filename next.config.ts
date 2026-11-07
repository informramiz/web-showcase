import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page here is per-user and reads the session cookie, so there is nothing to prerender.
  // cacheComponents/partial prefetching are left off: they add no value for a fully dynamic app
  // and are not yet supported by the OpenNext Cloudflare adapter.
  serverExternalPackages: ["better-sqlite3"],
  turbopack: {
    root: import.meta.dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
