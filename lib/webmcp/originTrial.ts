import { getSiteConfig, isNonLoopbackHttpsOrigin } from "../site/metadata.ts";

export const webMcpOriginTrialEnvironmentKey = "WEBMCP_ORIGIN_TRIAL_TOKEN" as const;
export const webMcpOriginTrialDelivery = "server-rendered-meta" as const;

type OriginTrialEnvironment = Partial<Record<
  typeof webMcpOriginTrialEnvironmentKey | "SITE_URL" | "SITE_INDEXING_ENABLED",
  string
>>;

export type WebMcpOriginTrialDeploymentState = {
  status: "local_testing_only" | "configured_unverified" | "misconfigured";
  tokenConfigured: boolean;
  tokenShape: "absent" | "valid" | "invalid";
  siteOrigin: string;
  originEligible: boolean;
  delivery: typeof webMcpOriginTrialDelivery;
  browserValidation: "required";
  containsToken: false;
  issues: string[];
};

function tokenShapeIsValid(value: string): boolean {
  return value.length >= 32
    && value.length <= 4_096
    && /^[A-Za-z0-9+/_=-]+$/.test(value);
}

export function getWebMcpOriginTrialDeploymentState(
  environment: OriginTrialEnvironment = process.env as OriginTrialEnvironment,
): WebMcpOriginTrialDeploymentState {
  const rawToken = environment[webMcpOriginTrialEnvironmentKey];
  const trimmedToken = rawToken?.trim() ?? "";
  const tokenConfigured = trimmedToken.length > 0;
  const tokenShape = !tokenConfigured
    ? "absent" as const
    : rawToken === trimmedToken && tokenShapeIsValid(trimmedToken)
      ? "valid" as const
      : "invalid" as const;
  const issues: string[] = [];

  let siteOrigin = "http://localhost:3000";
  try {
    siteOrigin = getSiteConfig(environment).origin;
  } catch {
    siteOrigin = "invalid";
    issues.push("SITE_URL must be one absolute origin without a path, query, credentials, or fragment.");
  }

  const originEligible = siteOrigin !== "invalid" && isNonLoopbackHttpsOrigin(siteOrigin);
  if (tokenShape === "invalid") {
    issues.push("WEBMCP_ORIGIN_TRIAL_TOKEN must be one unmodified 32–4096 character token.");
  }
  if (tokenConfigured && !originEligible) {
    issues.push("A WebMCP origin-trial token requires a non-loopback HTTPS SITE_URL for the exact registered origin.");
  }

  return {
    status: issues.length > 0
      ? "misconfigured"
      : tokenConfigured
        ? "configured_unverified"
        : "local_testing_only",
    tokenConfigured,
    tokenShape,
    siteOrigin,
    originEligible,
    delivery: webMcpOriginTrialDelivery,
    browserValidation: "required",
    containsToken: false,
    issues,
  };
}

export function getWebMcpOriginTrialMetaToken(
  environment: OriginTrialEnvironment = process.env as OriginTrialEnvironment,
): string | undefined {
  const state = getWebMcpOriginTrialDeploymentState(environment);
  if (state.status === "misconfigured") {
    throw new Error(`Invalid WebMCP Origin Trial deployment: ${state.issues.join(" ")}`);
  }
  return state.tokenConfigured
    ? environment[webMcpOriginTrialEnvironmentKey]!.trim()
    : undefined;
}
