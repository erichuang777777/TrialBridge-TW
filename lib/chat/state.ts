import type { MaskResult } from "../privacy/mask.ts";
import type { ConfirmedProfile, ProfileDraft } from "../profile/schema.ts";

export type ChatStage = "role" | "privacy" | "capture" | "mask_review" | "extracting" | "confirmation" | "ready";

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
  | { type: "SELECT_ROLE"; role: "patient" | "caregiver" }
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
  | { type: "RESET" };

export const initialChatState: ChatState = { stage: "role", language: "en", rawText: "" };

export function chatReducer(state: ChatState, event: ChatEvent): ChatState {
  switch (event.type) {
    case "SET_LANGUAGE":
      return state.stage === "role" ? { ...state, language: event.language } : state;
    case "SELECT_ROLE":
      return state.stage === "role" ? { ...state, subjectRole: event.role, stage: "privacy" } : state;
    case "ACCEPT_PRIVACY":
      return state.stage === "privacy" ? { ...state, stage: "capture" } : state;
    case "SET_RAW_TEXT":
      return state.stage === "capture" ? { ...state, rawText: event.value, error: undefined } : state;
    case "MASK_COMPLETE":
      return state.stage === "capture" ? { ...state, maskResult: event.result, stage: "mask_review" } : state;
    case "BACK_TO_CAPTURE":
      return state.stage === "mask_review" ? { ...state, stage: "capture", maskResult: undefined } : state;
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
      return state.stage === "confirmation" ? { ...state, stage: "ready", draft: undefined, maskResult: undefined, confirmedProfile: event.profile } : state;
    case "UPDATE_CONFIRMED_PROFILE":
      return state.stage === "ready" ? { ...state, confirmedProfile: event.profile } : state;
    case "RESET":
      return { ...initialChatState, language: state.language };
  }
}
