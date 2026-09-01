export const tfdaFixture = {
  臨床試驗申請者: "測試申請者",
  臨床試驗計畫書編號: "TB-TW-001",
  臨床試驗計畫中文名稱: "晚期胃癌標靶治療第三期試驗",
  臨床試驗期別: "Phase III",
  本臨床試驗規模: "多國多中心",
  試驗目的: "評估研究治療的安全性與療效指標。",
  適應症中文: "晚期胃癌",
  納入條件: "成年且診斷為晚期胃癌。",
  排除條件: "研究團隊判定不適合者。",
  執行狀態: "執行中",
  TFDA收文號: "TFDA-TEST-001",
  資料更新時間: "2026/08/01",
};

export const ctgovFixture = {
  protocolSection: {
    identificationModule: {
      nctId: "NCT00000001",
      briefTitle: "A Study for Advanced Gastric Cancer",
      officialTitle: "An International Study for Advanced Gastric Cancer",
      orgStudyIdInfo: { id: "TB-TW-001" },
      secondaryIdInfos: [{ id: "SPONSOR-22" }],
    },
    statusModule: {
      overallStatus: "RECRUITING",
      lastUpdatePostDateStruct: { date: "2026-08-20" },
    },
    descriptionModule: { briefSummary: "This registry entry describes a research plan." },
    conditionsModule: { conditions: ["Gastric Cancer"] },
    designModule: { studyType: "INTERVENTIONAL", phases: ["PHASE3"] },
    armsInterventionsModule: { interventions: [{ type: "DRUG", name: "Study medicine" }] },
    eligibilityModule: {
      eligibilityCriteria: "Adults with confirmed advanced gastric cancer.",
      minimumAge: "18 Years",
      maximumAge: "80 Years",
      sex: "ALL",
    },
    contactsLocationsModule: {
      centralContacts: [{ name: "Study information", email: "study@example.test" }],
      locations: [
        { facility: "Taiwan research site", city: "Taipei", country: "Taiwan", status: "RECRUITING" },
        { facility: "Japan research site", city: "Tokyo", country: "Japan", status: "RECRUITING" },
      ],
    },
  },
};
