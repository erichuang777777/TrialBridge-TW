import type { MaskResult } from "../privacy/mask.ts";
import type { ConfirmedProfile, ProfileDraft } from "../profile/schema.ts";

export type ChatStage = "mode" | "privacy" | "capture" | "mask_review" | "extracting" | "confirmation" | "ready";

export interface ChatState {
  stage: ChatStage;
  language: "zh-Hant" | "en";
  subjectRole?: "patient" | "caregiver";
  rawText: string;
  maskResult?: MaskResult;
  draft?: ProfileDraft;
  confirmedProfile?: ConfirmedProfile;
  error?: string;
}

export type ChatEvent =
  | { type: "SET_LANGUAGE"; language: ChatState["language"] }
  | { type: "START_INTAKE" }
  | { type: "START_SYNTHETIC_DEMO" }
  | { type: "ACCEPT_PRIVACY" }
  | { type: "SET_RAW_TEXT"; value: string }
  | { type: "MASK_COMPLETE"; result: MaskResult }
  | { type: "BACK_TO_CAPTURE" }
  | { type: "EXTRACTION_START" }
  | { type: "EXTRACTION_CANCEL" }
  | { type: "EXTRACTION_SUCCESS"; draft: ProfileDraft }
  | { type: "EXTRACTION_FAILURE"; message: string }
  | { type: "CONFIRM_SUCCESS"; profile: ConfirmedProfile }
  | { type: "UPDATE_CONFIRMED_PROFILE"; profile: ConfirmedProfile }
  | { type: "DEV_SET_STATE"; state: ChatState }
  | { type: "RESET" };

export const initialChatState: ChatState = { stage: "mode", language: "en", subjectRole: "patient", rawText: "" };
export const syntheticCompetitionNote = "Synthetic competition case — no real patient data. A 62-year-old person with stage IV gastric adenocarcinoma, HER2-negative, PD-L1 CPS 10, previously received FOLFOX; last treatment 8 weeks ago. ECOG 1. Can travel within Taiwan and Asia.";

export function isSyntheticDemoValue(value: unknown): boolean {
  return value === "synthetic";
}

export function removeSyntheticDemoSearch(search: string): string {
  const params = new URLSearchParams(search);
  if (params.get("demo") === "synthetic") params.delete("demo");
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export function chatReducer(state: ChatState, event: ChatEvent): ChatState {
  switch (event.type) {
    case "SET_LANGUAGE":
      return { ...state, language: event.language };
    case "START_INTAKE":
      return state.stage === "mode" ? { ...state, stage: "privacy" } : state;
    case "START_SYNTHETIC_DEMO":
      return state.stage === "mode" ? { ...state, stage: "privacy", rawText: syntheticCompetitionNote } : state;
    case "ACCEPT_PRIVACY":
      return state.stage === "privacy" ? { ...state, stage: "capture" } : state;
    case "SET_RAW_TEXT":
      return state.stage === "capture" ? { ...state, rawText: event.value, error: undefined } : state;
    case "MASK_COMPLETE":
      return state.stage === "capture" ? { ...state, maskResult: event.result, stage: "mask_review" } : state;
    case "BACK_TO_CAPTURE":
      // From review, confirmation, or an empty result set, return to an editable note.
      // rawText is cleared when extraction starts, so fall back to the masked text
      // instead of dropping the person into an empty textarea.
      return state.stage === "mask_review" || state.stage === "confirmation" || state.stage === "ready"
        ? { ...state, stage: "capture", rawText: state.rawText.trim() ? state.rawText : state.maskResult?.maskedText ?? "", maskResult: undefined, draft: undefined, confirmedProfile: undefined, error: undefined }
        : state;
    case "EXTRACTION_START":
      return state.stage === "mask_review" && state.maskResult
        ? { ...state, stage: "extracting", rawText: "", error: undefined }
        : state;
    case "EXTRACTION_CANCEL":
      return state.stage === "extracting"
        ? { ...state, stage: "mask_review", error: undefined }
        : state;
    case "EXTRACTION_SUCCESS":
      return state.stage === "extracting" ? { ...state, stage: "confirmation", draft: event.draft } : state;
    case "EXTRACTION_FAILURE":
      return state.stage === "extracting" ? { ...state, stage: "mask_review", error: event.message } : state;
    case "CONFIRM_SUCCESS":
      return state.stage === "confirmation" ? { ...state, stage: "ready", confirmedProfile: event.profile } : state;
    case "UPDATE_CONFIRMED_PROFILE":
      return state.stage === "ready" ? { ...state, confirmedProfile: event.profile } : state;
    case "DEV_SET_STATE":
      return process.env.NODE_ENV === "development" ? event.state : state;
    case "RESET":
      return { ...initialChatState, language: state.language };
  }
}
