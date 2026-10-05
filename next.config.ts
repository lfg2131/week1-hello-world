import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // Week 3 profile pages were retired; send old links to the app.
    return ["/protected", "/profile", "/profile/complete"].map((source) => ({ source, destination: "/rate", permanent: false }));
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};

export default nextConfig;
