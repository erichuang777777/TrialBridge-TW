import assert from "node:assert/strict";
import test from "node:test";
import {
  getWebMcpOriginTrialDeploymentState,
  getWebMcpOriginTrialMetaToken,
  webMcpOriginTrialEnvironmentKey,
} from "../lib/webmcp/originTrial.ts";

const syntheticToken = "A".repeat(128);

test("Origin Trial deployment defaults to explicit local testing only", () => {
  assert.deepEqual(getWebMcpOriginTrialDeploymentState({}), {
    status: "local_testing_only",
    tokenConfigured: false,
    tokenShape: "absent",
    siteOrigin: "http://localhost:3000",
    originEligible: false,
    delivery: "server-rendered-meta",
    browserValidation: "required",
    containsToken: false,
    issues: [],
  });
  assert.equal(getWebMcpOriginTrialMetaToken({}), undefined);
});

test("a production-shaped deployment exposes readiness without exposing its token", () => {
  const environment = {
    SITE_URL: "https://trialbridge.example",
    [webMcpOriginTrialEnvironmentKey]: syntheticToken,
  };
  const state = getWebMcpOriginTrialDeploymentState(environment);
  assert.equal(state.status, "configured_unverified");
  assert.equal(state.originEligible, true);
  assert.equal(state.tokenShape, "valid");
  assert.equal(state.browserValidation, "required");
  assert.equal(JSON.stringify(state).includes(syntheticToken), false);
  assert.equal(getWebMcpOriginTrialMetaToken(environment), syntheticToken);
});

test("tokens fail closed for invalid shape or a non-production origin", () => {
  for (const environment of [
    { SITE_URL: "https://trialbridge.example", [webMcpOriginTrialEnvironmentKey]: "too short" },
    { SITE_URL: "http://localhost:3001", [webMcpOriginTrialEnvironmentKey]: syntheticToken },
    { SITE_URL: "https://trialbridge.example/path", [webMcpOriginTrialEnvironmentKey]: syntheticToken },
  ]) {
    const state = getWebMcpOriginTrialDeploymentState(environment);
    assert.equal(state.status, "misconfigured");
    assert.equal(state.containsToken, false);
    assert.throws(() => getWebMcpOriginTrialMetaToken(environment), /Invalid WebMCP Origin Trial deployment/);
  }
});
