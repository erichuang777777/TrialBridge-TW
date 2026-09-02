import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createPageMetadata, getSiteConfig, isNonLoopbackHttpsOrigin, publicSiteRoutes } from "../lib/site/metadata.ts";

test("public discovery is fail-closed by default", () => {
  assert.deepEqual(getSiteConfig({}), { origin: "http://localhost:3000", indexingEnabled: false });
  assert.deepEqual(getSiteConfig({ SITE_URL: "http://localhost:3001", SITE_INDEXING_ENABLED: "false" }), { origin: "http://localhost:3001", indexingEnabled: false });
});

test("indexing requires an explicit non-loopback HTTPS deployment origin", () => {
  assert.deepEqual(getSiteConfig({ SITE_URL: "https://trialbridge.example", SITE_INDEXING_ENABLED: "true" }), { origin: "https://trialbridge.example", indexingEnabled: true });
  assert.throws(() => getSiteConfig({ SITE_INDEXING_ENABLED: "true" }), /non-loopback HTTPS SITE_URL/);
  assert.throws(() => getSiteConfig({ SITE_URL: "http://trialbridge.example", SITE_INDEXING_ENABLED: "true" }), /non-loopback HTTPS SITE_URL/);
  assert.throws(() => getSiteConfig({ SITE_URL: "https://trialbridge.example/path" }), /without a path/);
  assert.throws(() => getSiteConfig({ SITE_URL: "not a URL" }), /absolute http\(s\) origin/);
  assert.equal(isNonLoopbackHttpsOrigin("https://trialbridge.example"), true);
  assert.equal(isNonLoopbackHttpsOrigin("http://trialbridge.example"), false);
  assert.equal(isNonLoopbackHttpsOrigin("https://localhost"), false);
  assert.equal(isNonLoopbackHttpsOrigin("https://trialbridge.example/path"), false);
});

test("every public route can declare a canonical and shareable page identity", () => {
  assert.deepEqual(publicSiteRoutes, ["/", "/trials", "/webmcp", "/method", "/privacy"]);
  const metadata = createPageMetadata({ title: "WebMCP Competition Evidence", description: "Synthetic metadata test.", path: "/webmcp" });
  assert.equal(metadata.alternates?.canonical, "/webmcp");
  assert.equal(metadata.openGraph?.url, "/webmcp");
  assert.match(JSON.stringify(metadata.twitter), /summary_large_image/);
});

test("Next metadata routes replace the unconditional public robots file", async () => {
  const root = process.cwd();
  const files = ["app/robots.ts", "app/sitemap.ts", "app/manifest.ts", "app/opengraph-image.tsx", "app/twitter-image.tsx"];
  const source = (await Promise.all(files.map((file) => readFile(path.join(root, file), "utf8")))).join("\n");
  assert.match(source, /SITE_INDEXING_ENABLED|indexingEnabled/);
  assert.match(source, /MetadataRoute\.Sitemap/);
  assert.match(source, /summary_large_image|ImageResponse|opengraph-image/);
  await assert.rejects(access(path.join(root, "public", "robots.txt")));
});
