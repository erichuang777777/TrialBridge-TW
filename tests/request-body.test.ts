import assert from "node:assert/strict";
import test from "node:test";
import { hasDeclaredRequestBody } from "../lib/security/requestBody.ts";

test("a body-free POST remains eligible for the fixed cloud probe", () => {
  assert.equal(hasDeclaredRequestBody(new Request("http://localhost/api/cloud/probe", { method: "POST" })), false);
  assert.equal(hasDeclaredRequestBody(new Request("http://localhost/api/cloud/probe", { method: "POST", headers: { "content-length": "0" } })), false);
});

test("declared request content is rejected before a cloud allowance is spent", () => {
  assert.equal(hasDeclaredRequestBody(new Request("http://localhost/api/cloud/probe", { method: "POST", body: "{}" })), true);
  assert.equal(hasDeclaredRequestBody(new Request("http://localhost/api/cloud/probe", { method: "POST", headers: { "content-type": "application/json" } })), true);
  assert.equal(hasDeclaredRequestBody(new Request("http://localhost/api/cloud/probe", { method: "POST", headers: { "transfer-encoding": "chunked" } })), true);
});
