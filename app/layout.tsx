import type { Metadata } from "next";
import type { ReactNode } from "react";
import { createPageMetadata, getSiteConfig, siteDescription, siteName } from "@/lib/site/metadata";
import { getWebMcpOriginTrialMetaToken } from "@/lib/webmcp/originTrial";
import "./globals.css";

const siteConfig = getSiteConfig();
const homeMetadata = createPageMetadata({ title: siteName, description: siteDescription, path: "/" });

export const metadata: Metadata = {
  ...homeMetadata,
  metadataBase: new URL(siteConfig.origin),
  title: { default: siteName, template: "%s | TrialBridge TW" },
  applicationName: "TrialBridge TW",
  category: "health",
  manifest: "/manifest.webmanifest",
};

const semanticSiteGraph = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${siteConfig.origin}/#website`,
      url: siteConfig.origin,
      name: siteName,
      description: siteDescription,
      inLanguage: ["en", "zh-Hant"],
      potentialAction: {
        "@type": "SearchAction",
        target: `${siteConfig.origin}/trials?condition={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${siteConfig.origin}/#application`,
      name: "TrialBridge TW",
      applicationCategory: "HealthApplication",
      operatingSystem: "Web",
      isAccessibleForFree: true,
      featureList: ["Public clinical-trial search", "Browser-native WebMCP tools"],
    },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const originTrialToken = getWebMcpOriginTrialMetaToken();
  return (
    <html lang="en">
      <head>
        {originTrialToken ? <meta httpEquiv="origin-trial" content={originTrialToken} /> : null}
        <link rel="describedby" href="/llms.txt" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(semanticSiteGraph) }} />
      </head>
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        {children}
      </body>
    </html>
  );
}
