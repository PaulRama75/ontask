import path from "node:path";
import fs from "node:fs";

// Load .env (only keys not already set) so the live email test can read
// RESEND_API_KEY / EMAIL_FROM without extra tooling.
if (fs.existsSync(".env")) {
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

export default {
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
};
