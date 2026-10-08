import type { MetadataRoute } from "next";

// Web App Manifest for the FER Onboarding PWA.
// Served by Next.js at /manifest.webmanifest. Editing this file is the
// supported App Router way to define PWA install metadata.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FER Onboarding",
    short_name: "FER",
    description:
      "FER employee onboarding, invoicing and HR management portal.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#111111",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
