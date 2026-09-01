import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrialBridge TW 試驗橋",
  description: "從台灣出發，以對話協助癌症病人與家屬理解臨床試驗資訊。",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-Hant-TW">
      <body>
        <a className="skip-link" href="#main-content">跳到主要內容</a>
        {children}
      </body>
    </html>
  );
}
