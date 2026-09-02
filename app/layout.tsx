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
  robots: {
    index: siteConfig.indexingEnabled,
    follow: siteConfig.indexingEnabled,
    googleBot: { index: siteConfig.indexingEnabled, follow: siteConfig.indexingEnabled },
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const originTrialToken = getWebMcpOriginTrialMetaToken();
  return (
    <html lang="en">
      <head>{originTrialToken ? <meta httpEquiv="origin-trial" content={originTrialToken} /> : null}</head>
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        {children}
      </body>
    </html>
  );
}
