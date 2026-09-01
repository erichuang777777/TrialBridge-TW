import assert from "node:assert/strict";
import test from "node:test";
import { waitForPromiseWithSignal } from "../lib/security/abort.ts";

test("abortable waiting rejects immediately with the caller's reason", async () => {
  const controller = new AbortController();
  const reason = new DOMException("Synthetic caller cancellation", "AbortError");
  const pending = waitForPromiseWithSignal(new Promise<string>(() => undefined), controller.signal);
  controller.abort(reason);
  await assert.rejects(pending, (error: unknown) => error === reason);
});

test("abortable waiting preserves normal resolution and already-aborted signals", async () => {
  assert.equal(await waitForPromiseWithSignal(Promise.resolve("ready"), new AbortController().signal), "ready");
  const controller = new AbortController();
  const reason = new DOMException("Already cancelled", "AbortError");
  controller.abort(reason);
  await assert.rejects(waitForPromiseWithSignal(Promise.resolve("too late"), controller.signal), (error: unknown) => error === reason);
});
