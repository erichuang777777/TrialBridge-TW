export const webMcpCriticalJourney = {
  userGoal: "Find source-linked cancer trials and prepare a focused care-team discussion without giving an agent enrollment authority.",
  initialState: "The person starts with no confirmed health context. Public search is available; protected tools are absent.",
  boundary: "The visible page remains the source of truth. Raw notes never enter WebMCP, confirmation stays human-controlled, and no tool can enroll, send, book, consent, or change treatment.",
  steps: [
    {
      id: "discover", number: "01", title: "Discover public options", state: "Public · no health context",
      goal: "Search a broad cancer condition in English or Traditional Chinese.",
      tools: ["search_public_trial_form", "search_public_cancer_trials"],
      siteReaction: "The same visible form shows the bilingual registry query, source receipts, latency, and results.",
      recovery: "An unavailable registry returns a source code and retry guidance without hiding results from another source.",
    },
    {
      id: "confirm", number: "02", title: "Build confirmed context", state: "Protected intake · tools intentionally absent",
      goal: "Organize a masked note and correct every extracted fact.",
      tools: [],
      siteReaction: "Masking, cloud organization, and human confirmation stay in the visible workflow.",
      recovery: "The person can cancel, edit the note, retry extraction, or switch between Agent and Manual mode.",
    },
    {
      id: "clarify", number: "03", title: "Resolve missing criteria", state: "Confirmed profile · permission on · questions pending",
      goal: "Understand which registry requirements still need an answer.",
      tools: ["review_trial_followups"],
      siteReaction: "The tool points to the visible questions; answers and unknown choices remain human-entered.",
      recovery: "If matching is still running, the tool returns a wait-and-retry next action instead of a dead end.",
    },
    {
      id: "explain", number: "04", title: "Explain current results", state: "Source-traceable comparison visible",
      goal: "Review why trials are grouped and where evidence is missing or different.",
      tools: ["explain_confirmed_matches"],
      siteReaction: "Cards retain confirmed facts, five comparison blocks, exclusions, uncertainty, and source links.",
      recovery: "The output distinguishes current results, pending questions, and registry limitations rather than claiming eligibility.",
    },
    {
      id: "prepare", number: "05", title: "Prepare a human next step", state: "Two or three trials visibly shortlisted",
      goal: "Compare selected trials or prepare an editable discussion draft.",
      tools: ["compare_shortlisted_trials", "draft_trial_outreach", "draft_trial_discussion_brief"],
      siteReaction: "Only the person's visible shortlist is compared; drafts remain local or unsent.",
      recovery: "Removing a selection or permission removes the capability. No consequential write tool exists.",
    },
  ],
} as const;
