import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The admin console is an internal ops tool: it must never be indexed, and it
  // must not leak its framework version in response headers.
  poweredByHeader: false,
  typedRoutes: true,
  images: {
    // Citizen-uploaded photos are served by the API (local disk today — see
    // docs/decisions/0008-local-disk-photo-storage.md). Add the real bucket
    // host here when storage moves off disk.
    remotePatterns: [
      { protocol: "http", hostname: "localhost", port: "3001", pathname: "/uploads/**" },
    ],
  },
};

export default nextConfig;
