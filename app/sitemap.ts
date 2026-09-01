import type { MetadataRoute } from "next";
import { getSiteConfig, publicSiteRoutes } from "@/lib/site/metadata";

export default function sitemap(): MetadataRoute.Sitemap {
  const site = getSiteConfig();
  if (!site.indexingEnabled) return [];
  return publicSiteRoutes.map((path, index) => ({
    url: `${site.origin}${path === "/" ? "" : path}`,
    changeFrequency: path === "/trials" ? "daily" : "weekly",
    priority: index === 0 ? 1 : path === "/trials" || path === "/webmcp" ? 0.9 : 0.7,
  }));
}
