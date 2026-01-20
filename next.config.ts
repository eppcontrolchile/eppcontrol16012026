import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "www.eppcontrol.cl",
          },
        ],
        destination: "https://eppcontrol.cl/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
