export const bilingualCancerQueryLexiconVersion = "2026-09-02";

export type BilingualCancerQueryEntry = {
  cancerGroup: string;
  en: string;
  zhHant: string;
  aliases: string[];
};

export const bilingualCancerQueryLexicon: BilingualCancerQueryEntry[] = [
  { cancerGroup: "breast", en: "breast cancer", zhHant: "乳癌", aliases: ["乳腺癌"] },
  { cancerGroup: "lung", en: "lung cancer", zhHant: "肺癌", aliases: [] },
  { cancerGroup: "colorectal", en: "colorectal cancer", zhHant: "大腸直腸癌", aliases: ["大腸癌", "結直腸癌"] },
  { cancerGroup: "liver", en: "liver cancer", zhHant: "肝癌", aliases: [] },
  { cancerGroup: "gastric", en: "gastric cancer", zhHant: "胃癌", aliases: ["stomach cancer"] },
  { cancerGroup: "pancreatic", en: "pancreatic cancer", zhHant: "胰臟癌", aliases: ["胰腺癌"] },
  { cancerGroup: "prostate", en: "prostate cancer", zhHant: "攝護腺癌", aliases: ["前列腺癌"] },
  { cancerGroup: "ovarian", en: "ovarian cancer", zhHant: "卵巢癌", aliases: [] },
  { cancerGroup: "cervical", en: "cervical cancer", zhHant: "子宮頸癌", aliases: ["宮頸癌"] },
  { cancerGroup: "endometrial", en: "endometrial cancer", zhHant: "子宮內膜癌", aliases: [] },
  { cancerGroup: "head-and-neck", en: "head and neck cancer", zhHant: "頭頸癌", aliases: ["head-and-neck cancer", "頭頸部癌"] },
  { cancerGroup: "brain-and-cns", en: "brain and central nervous system cancer", zhHant: "腦與中樞神經系統腫瘤", aliases: ["central nervous system cancer", "cns cancer", "中樞神經系統腫瘤"] },
  { cancerGroup: "melanoma-and-skin", en: "melanoma and skin cancer", zhHant: "黑色素瘤與皮膚癌", aliases: [] },
  { cancerGroup: "sarcoma", en: "sarcoma", zhHant: "肉瘤", aliases: [] },
  { cancerGroup: "leukemia", en: "leukemia", zhHant: "白血病", aliases: ["leukaemia"] },
  { cancerGroup: "lymphoma", en: "lymphoma", zhHant: "淋巴瘤", aliases: ["淋巴癌"] },
  { cancerGroup: "myeloma", en: "multiple myeloma", zhHant: "多發性骨髓瘤", aliases: [] },
  { cancerGroup: "pediatric", en: "pediatric cancer", zhHant: "兒童癌症", aliases: ["childhood cancer", "paediatric cancer", "兒童癌症", "小兒癌症"] },
  { cancerGroup: "rare-and-other-solid-tumors", en: "rare cancer and solid tumor", zhHant: "罕見癌症與實體腫瘤", aliases: ["rare cancer and solid tumour"] },
];

export type RegistryQueryPlan = {
  inputCondition: string;
  strategy: "curated_bilingual_cancer_lexicon" | "pass_through";
  dictionaryVersion: string;
  canonicalGroup?: string;
  registryConditions: {
    TFDA: string;
    "ClinicalTrials.gov": string;
  };
  limitation: string;
};

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("en").replace(/[‐‑‒–—-]/g, " ").replace(/\s+/g, " ");
}

export function createRegistryQueryPlan(condition: string): RegistryQueryPlan {
  const inputCondition = condition.trim();
  const normalizedInput = normalize(inputCondition);
  const entry = bilingualCancerQueryLexicon.find((candidate) =>
    [candidate.en, candidate.zhHant, ...candidate.aliases].some((alias) => normalize(alias) === normalizedInput),
  );
  if (!entry) return {
    inputCondition,
    strategy: "pass_through",
    dictionaryVersion: bilingualCancerQueryLexiconVersion,
    registryConditions: { TFDA: inputCondition, "ClinicalTrials.gov": inputCondition },
    limitation: "No exact curated cancer-term match was found, so the original general condition was sent to both registries without inferring a histology, subtype, stage, or biomarker.",
  };
  return {
    inputCondition,
    strategy: "curated_bilingual_cancer_lexicon",
    dictionaryVersion: bilingualCancerQueryLexiconVersion,
    canonicalGroup: entry.cancerGroup,
    registryConditions: { TFDA: entry.zhHant, "ClinicalTrials.gov": entry.en },
    limitation: "This is a search-term bridge, not a clinical translation or eligibility interpretation. Histology, subtype, stage, and biomarker terms are not inferred.",
  };
}
