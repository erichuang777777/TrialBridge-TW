import type { MetadataRoute } from "next";
import { siteDescription, siteName } from "@/lib/site/metadata";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteName,
    short_name: "TrialBridge TW",
    description: siteDescription,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F6FBFA",
    theme_color: "#086F78",
    lang: "en",
    dir: "ltr",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
