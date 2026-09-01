import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const retiredBrand = ["Trial", "ign"].join("").toLocaleLowerCase("en");
const forbiddenNames = ["trial-video.mp4", "trial-hero-poster.jpg", "trial-logo.png"];
const forbiddenEffects = [/name\s*:\s*["'](?:send|submit|enroll|book)[a-z0-9_.-]*["']/i];
const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const findings: string[] = [];

for (const file of tracked) {
  if (!existsSync(file)) continue;
  const normalized = file.replaceAll("\\", "/").toLocaleLowerCase("en");
  if (forbiddenNames.some((name) => normalized.endsWith(name))) findings.push(`${file}: retired asset`);
  if (normalized.includes("/api/") && /raw(?:_|-)?(?:note|record)/i.test(normalized)) findings.push(`${file}: forbidden raw-data route`);
  if (/\.(png|jpe?g|mp4|zip|ico|woff2?)$/i.test(file) || file === "package-lock.json") continue;
  const content = readFileSync(file, "utf8");
  if (content.toLocaleLowerCase("en").includes(retiredBrand)) findings.push(`${file}: retired brand`);
  for (const pattern of forbiddenEffects) if (pattern.test(content)) findings.push(`${file}: forbidden pattern ${pattern}`);
}

if (findings.length) {
  console.error(findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ trackedFiles: tracked.length, retiredBrandMatches: 0, retiredAssets: 0, forbiddenSideEffects: 0 }));
}
