import type { MetadataRoute } from "next";
import { getSiteConfig } from "@/lib/site/metadata";

export default function robots(): MetadataRoute.Robots {
  const site = getSiteConfig();
  if (!site.indexingEnabled) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${site.origin}/sitemap.xml`,
    host: site.origin,
  };
}
