import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiBase = env.VITE_API_BASE_URL || env.VITE_API_URL || (mode === "development" ? "http://localhost:5000/api/v1" : "");
  let apiOrigin = "";
  try { apiOrigin = new URL(apiBase).origin; } catch { /* missing or invalid production configuration */ }
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://res.cloudinary.com",
    "font-src 'self' data:",
    `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ""}`,
  ].join("; ");
  return {
  plugins: [react(), {
    name: "milestone-csp",
    transformIndexHtml: { order: "pre", handler(html) {
      return html.replace("</head>", `<meta http-equiv="Content-Security-Policy" content="${csp}">\n</head>`);
    } },
  }],
  server: { port: 5173 },
  build: {
    sourcemap: false, // never ship source maps of a production app
    chunkSizeWarningLimit: 700,
  },
};
});
