import type { NextConfig } from "next";

// Dev-only origins that may reach the dev server. Machine-specific LAN IPs
// change with DHCP and must not be tracked in git: set them per machine in
// .env.local (loaded before this file is evaluated), e.g.
//   NEXT_DEV_ALLOWED_ORIGINS=10.13.19.11,192.168.6.115
// Stable hostnames stay here. See:
// node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/allowedDevOrigins.md
const envDevOrigins = (process.env.NEXT_DEV_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: [...envDevOrigins, "semblante.local"],
};

export default nextConfig;
