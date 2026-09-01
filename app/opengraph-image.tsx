import { ImageResponse } from "next/og";

export const alt = "TrialBridge TW — Taiwan-first bilingual cancer clinical-trial navigation with WebMCP";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const proofPoints = ["TFDA + ClinicalTrials.gov", "19 bilingual cancer groups", "0 enrollment tools"];

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 80px", background: "#F6FBFA", color: "#14343B", fontFamily: "Arial, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 58, height: 58, display: "flex", alignItems: "center", justifyContent: "center", border: "4px solid #086F78", borderRadius: 18, color: "#086F78", fontSize: 30, fontWeight: 800 }}>T</div>
          <div style={{ display: "flex", flexDirection: "column" }}><strong style={{ fontSize: 30 }}>TrialBridge TW</strong><span style={{ fontSize: 20, color: "#47636A" }}>Taiwan-first trial navigation</span></div>
        </div>
        <div style={{ display: "flex", padding: "12px 20px", borderRadius: 999, background: "#D9F1EB", color: "#075B63", fontSize: 20, fontWeight: 700 }}>WebMCP-native</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 930 }}>
        <div style={{ display: "flex", color: "#086F78", fontSize: 23, fontWeight: 700, letterSpacing: 2 }}>TAIWAN FIRST · ASIA · WORLDWIDE</div>
        <div style={{ display: "flex", marginTop: 20, fontSize: 66, lineHeight: 1.08, fontWeight: 800, letterSpacing: -2 }}>Clinical-trial navigation with visible evidence boundaries.</div>
      </div>
      <div style={{ display: "flex", gap: 16 }}>{proofPoints.map((point) => <div key={point} style={{ display: "flex", padding: "14px 18px", border: "2px solid #C8DEDB", borderRadius: 14, background: "#FFFFFF", fontSize: 19, fontWeight: 700 }}>{point}</div>)}</div>
    </div>,
    size,
  );
}
