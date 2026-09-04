import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function filesUnder(relativeDirectory: string): Promise<string[]> {
  const absolute = path.join(root, relativeDirectory);
  let entries;
  try {
    entries = await readdir(absolute, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const relative = path.join(relativeDirectory, entry.name);
      return entry.isDirectory() ? filesUnder(relative) : [relative];
    }),
  );
  return nested.flat();
}

test("public product surfaces contain no retired brand", async () => {
  const retiredBrand = ["Trial", "ign"].join("");
  assert.deepEqual(await filesUnder("directory-that-does-not-exist"), []);
  const files = [
    "README.md",
    ...(await filesUnder("app")),
    ...(await filesUnder("public")),
  ];

  for (const file of files) {
    const content = await readFile(path.join(root, file), "utf8");
    assert.equal(content.toLowerCase().includes(retiredBrand.toLowerCase()), false, file);
  }
});

test("foundation specifications lock the approved trust boundaries", async () => {
  const product = await readFile(path.join(root, "docs", "PRODUCT_SPEC.md"), "utf8");
  const dataFlow = await readFile(path.join(root, "docs", "DATA_FLOW.md"), "utf8");
  const webmcp = await readFile(path.join(root, "docs", "WEBMCP_CONTRACT.md"), "utf8");

  assert.match(product, /Taiwan, then expands to Asia and worldwide/);
  assert.match(product, /patient-confirmed/);
  assert.match(dataFlow, /localhost.*Ollama/i);
  assert.match(dataFlow, /does not use `localStorage`/);
  assert.match(webmcp, /No tool returns raw medical-record text/);
  assert.match(webmcp, /the page never hands its note to an agent/);
  assert.match(webmcp, /rejects direct identifiers before anything enters the page/);
});
