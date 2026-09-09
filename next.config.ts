import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Note: a harmless "inferred workspace root" warning appears because the parent
  // Downloads folder has its own package-lock.json. It does not affect this app.
  experimental: {
    serverActions: {
      // Default is 1MB, far too small for the onboarding/document upload forms
      // (multiple required files, e.g. license + SSN card, in one submission).
      // The app's own MAX_FILE_BYTES already caps each individual file at 15MB.
      bodySizeLimit: "30mb",
    },
  },
};

export default nextConfig;
