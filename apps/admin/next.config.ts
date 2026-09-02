import type { NextConfig } from "next";

/**
 * The API origin this console talks to, and therefore the only origin citizen
 * photos can come from while ADR 0008 keeps them on the API's own local disk.
 *
 * Read from the same env var the browser bundle reads via `src/lib/env.ts`, so
 * the `next/image` allow-list below and the console's own URL resolver
 * (`src/lib/upload-url.ts`) cannot drift apart — which is exactly what happened
 * when both hardcoded `localhost`: point the console at a LAN address and every
 * photo a real device had uploaded was rejected, with no error anyone could act
 * on. Changing `NEXT_PUBLIC_API_URL` now moves both.
 */
const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001");

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
      {
        protocol: apiOrigin.protocol === "https:" ? "https" : "http",
        hostname: apiOrigin.hostname,
        // "" matches the protocol's default port, which is what a real
        // https://api.example.com deployment will parse to.
        port: apiOrigin.port,
        pathname: "/uploads/**",
      },
    ],
    /**
     * Next 16 refuses to optimise any image whose host resolves to a private IP
     * — `fetchExternalImage` in `next/dist/server/image-optimizer.js` rejects it
     * with `400 "url" parameter is not allowed` before `remotePatterns` are even
     * consulted. It is an SSRF guard, and it assumes the optimiser can be aimed
     * at arbitrary hosts.
     *
     * Outside production the API is *always* on a private address — `localhost`
     * (→ 127.0.0.1) on a laptop, `192.168.x.x` when a phone on the LAN is the
     * one uploading. So the guard rejected every single citizen photo, and a
     * moderator saw the "photo unavailable" tile on every report: the product
     * owner's own acceptance criterion ("if upload image, that wants to reflect
     * in web") failed on this one default.
     *
     * Why turning it off here is not a hole:
     *   - It is not "allow local IPs" in general. The optimiser only ever
     *     fetches a URL that matched `remotePatterns` above, which pins it to
     *     one origin and one path prefix — the API we are already configured to
     *     send authenticated admin requests to. It cannot be pointed at an
     *     arbitrary internal host.
     *   - It is statically OFF in production. `NODE_ENV` is `production` for
     *     `next build` / `next start`, where the API is a public HTTPS origin
     *     and the guard is doing real work. **Never make this unconditional.**
     *
     * A production build aimed at a private API would go back to showing
     * "photo unavailable" — correctly, and visibly, rather than silently
     * fetching from an address the guard exists to protect.
     */
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== "production",
  },
};

export default nextConfig;
