export const webMcpCapabilityInventory = [
  { name: "search_public_trial_form", kind: "Declarative", availability: "Visible on /trials", boundary: "Public condition only" },
  { name: "trialbridge_method", kind: "Imperative", availability: "Always public", boundary: "No patient context" },
  { name: "search_public_cancer_trials", kind: "Imperative", availability: "Always public", boundary: "Bilingual query plan · untrusted registry output" },
  { name: "review_trial_followups", kind: "Imperative", availability: "Permission-gated", boundary: "Questions only · never records answers" },
  { name: "explain_confirmed_matches", kind: "Imperative", availability: "Permission-gated", boundary: "Confirmed, de-identified context only" },
  { name: "draft_trial_outreach", kind: "Imperative", availability: "Permission-gated", boundary: "Creates an unsent draft" },
  { name: "draft_trial_discussion_brief", kind: "Imperative", availability: "Permission-gated", boundary: "Local care-team brief · never sent" },
  { name: "compare_shortlisted_trials", kind: "Imperative", availability: "2–3 visible selections", boundary: "Reads only the user-controlled shortlist" },
] as const;
