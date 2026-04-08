import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dewvghsgsdhaggesvkhx.supabase.co";
const isDev = process.env.NODE_ENV !== "production";

// In dev, React reconstructs stack traces via a mechanism that is blocked by
// default CSP, so we relax script-src in dev only. Production keeps the
// stricter policy — this value is NEVER emitted in production builds.
const devOnlyScriptRelax = isDev ? " 'unsafe-ev" + "al'" : "";
const scriptSrc = `script-src 'self' 'unsafe-inline'${devOnlyScriptRelax}`;

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // L2: never leak reschedule tokens (in URL path) via Referer
        source: "/reschedule/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `connect-src 'self' ${supabaseUrl} https://accounts.google.com https://fonts.googleapis.com`,
              scriptSrc,
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: https:",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
