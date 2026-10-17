// Tells search engines that use IndexNow (Bing, which also feeds ChatGPT search and Copilot, plus Yandex, Naver,
// Seznam) which pages are new or changed. Google does not use IndexNow; it reads sitemap.xml (see README).
//
//   node scripts/indexnow.mjs                 # every URL in dist/sitemap.xml (a first submission)
//   node scripts/indexnow.mjs --since HEAD~1  # only pages of entries changed since that commit, plus the lists
//
// The key is the file site/<key>.txt, published at the root of the site so the engines can check it is ours.
import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const keyFile = (await readdir(path.join(root, "site"))).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) { console.error("no IndexNow key in site/<32 hex>.txt"); process.exit(1); }
const key = keyFile.slice(0, -4);
const sitemap = await readFile(path.join(root, "dist", "sitemap.xml"), "utf8");
const all = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const site = new URL(all[0]);

let urls = all;
const since = process.argv.indexOf("--since");
if (since > -1) {
  const ref = process.argv[since + 1];
  const changed = execFileSync("git", ["diff", "--name-only", ref, "HEAD", "--", "content/entries"], { cwd: root, encoding: "utf8" })
    .split("\n").filter(Boolean).map((f) => path.basename(f, ".json").slice(11));
  if (!changed.length) { console.log("indexnow: no entry changed, nothing to send"); process.exit(0); }
  const lists = ["/", "/a-z/", "/topics/"].flatMap((p) => [p, `/es${p}`]);
  urls = all.filter((u) => {
    const p = new URL(u).pathname;
    return lists.includes(p) || changed.some((s) => p === `/${s}/` || p === `/es/${s}/`);
  });
}

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: site.host, key, keyLocation: `${site.origin}/${keyFile}`, urlList: urls }),
});
// 200 and 202 both mean accepted; 202 means the key is still being verified.
console.log(`indexnow: sent ${urls.length} URL(s), answer ${res.status} ${res.statusText}`);
if (![200, 202].includes(res.status)) { console.error(await res.text()); process.exit(1); }
