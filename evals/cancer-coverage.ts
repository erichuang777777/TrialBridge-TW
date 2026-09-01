export type ValidationMaturity = "unreviewed" | "rules-reviewed" | "clinically-reviewed";

export const cancerCoverage = [
  "breast", "lung", "colorectal", "liver", "gastric", "pancreatic", "prostate", "ovarian",
  "cervical", "endometrial", "head-and-neck", "brain-and-cns", "melanoma-and-skin",
  "sarcoma", "leukemia", "lymphoma", "myeloma", "pediatric", "rare-and-other-solid-tumors",
].map((cancerGroup) => ({ cancerGroup, searchable: true as const, maturity: "unreviewed" as ValidationMaturity }));
