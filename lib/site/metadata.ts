import type { Metadata } from "next";

export const siteName = "TrialBridge TW 試驗橋";
export const siteDescription = "Taiwan-first bilingual cancer clinical-trial navigation with patient-confirmed matching and browser-native WebMCP tools.";
export const publicSiteRoutes = ["/", "/trials", "/webmcp", "/method", "/privacy"] as const;

type SiteEnvironment = Partial<Record<"SITE_URL" | "SITE_INDEXING_ENABLED", string>>;

function parseSiteOrigin(rawValue: string | undefined): URL {
  const value = rawValue?.trim();
  if (!value) return new URL("http://localhost:3000");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("SITE_URL must be an absolute http(s) origin.");
  }
  if (!(["http:", "https:"] as string[]).includes(parsed.protocol) || parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw new Error("SITE_URL must contain only an absolute http(s) origin without a path, query, credentials, or fragment.");
  }
  return parsed;
}

function isLoopback(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "[::1]" || normalized.endsWith(".localhost");
}

export function getSiteConfig(environment: SiteEnvironment = process.env as SiteEnvironment): {
  origin: string;
  indexingEnabled: boolean;
} {
  const origin = parseSiteOrigin(environment.SITE_URL);
  const indexingRequested = environment.SITE_INDEXING_ENABLED === "true";
  if (indexingRequested && (origin.protocol !== "https:" || isLoopback(origin.hostname))) {
    throw new Error("SITE_INDEXING_ENABLED=true requires a non-loopback HTTPS SITE_URL.");
  }
  return { origin: origin.origin, indexingEnabled: indexingRequested };
}

export function createPageMetadata({ title, description, path }: {
  title: string;
  description: string;
  path: typeof publicSiteRoutes[number];
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      url: path,
      title,
      description,
      siteName,
      locale: "en_US",
      alternateLocale: ["zh_TW"],
    },
    twitter: { card: "summary_large_image", title, description },
  };
}
