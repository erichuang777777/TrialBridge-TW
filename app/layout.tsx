import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrialBridge TW 試驗橋",
  description: "A Taiwan-first bilingual guide that helps people with cancer and caregivers understand clinical-trial information.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const originTrialToken = process.env.NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN;
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
