export const webMcpLocalTestingFlag = "chrome://flags/#enable-webmcp-testing";

export const webMcpBrowserSetupContract = {
  schemaVersion: "1.0",
  artifactClass: "browser_setup_guidance_not_runtime_evidence",
  visitorInstallRequired: false,
  browserFeature: "Native experimental WebMCP implementation",
  localTesting: {
    minimumChromeMajor: 146,
    flagAddress: webMcpLocalTestingFlag,
    relaunchRequired: true,
    secureContextRequired: true,
    preferredLocalOrigin: "http://localhost:3001",
  },
  layers: [
    {
      id: "specification",
      number: "01",
      label: "Specification",
      title: "Read the contract",
      detail: "The upstream draft defines the browser API. Nothing is installed from the specification website.",
      actionLabel: "Open WebMCP draft",
      href: "https://webmachinelearning.github.io/webmcp/",
    },
    {
      id: "browser",
      number: "02",
      label: "Chrome local testing",
      title: "Enable the native preview",
      detail: "In Chrome 146 or newer, enable built-in WebMCP in chrome://flags, choose Enabled, and relaunch. This is not a Web Store extension.",
      actionLabel: "Copy flag address",
    },
    {
      id: "trialbridge",
      number: "03",
      label: "TrialBridge TW",
      title: "Open the site and verify",
      detail: "Reopen TrialBridge on localhost. The page registers its origin-scoped tools automatically and the live diagnostic verifies discovery.",
      actionLabel: "Check this browser",
      href: "#live-diagnostic-title",
    },
  ],
  inspector: {
    separateFromWebMcp: true,
    optionalForVisitors: true,
    purpose: "Developer and judge inspection of tool discovery, schemas, calls, and state transitions",
    documentation: "https://developer.chrome.com/docs/ai/webmcp",
  },
  privacyBoundary: {
    containsHealthInformation: false,
    readsBrowserState: false,
    executesTools: false,
  },
  evidenceBoundary: "Static setup guidance only. The live diagnostic and Model Context Tool Inspector remain separate evidence gates.",
} as const;
