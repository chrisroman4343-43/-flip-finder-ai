import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAnalysisPrompt, DEFAULT_SETTINGS } from "../src/logic.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("manifest icons and core PWA files exist", async () => {
  const manifest = JSON.parse(await readFile(resolve(root, "manifest.webmanifest"), "utf8"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./#home");
  const expected = [
    "index.html",
    "styles.css",
    "sw.js",
    "src/app.js",
    "src/ai.js",
    "src/db.js",
    "src/logic.js",
    "netlify.toml",
    "netlify/functions/ai.mts",
    ...manifest.icons.map((icon) => icon.src.replace(/^\.\//, ""))
  ];
  await Promise.all(expected.map((path) => access(resolve(root, path))));
});

test("the app loads no third-party scripts or styles", async () => {
  const html = await readFile(resolve(root, "index.html"), "utf8");
  assert.doesNotMatch(html, /<(script|link)[^>]+https?:\/\//i);
});

test("the Evaluate mobile flow reserves safe space and exposes source scrolling", async () => {
  const [app, styles] = await Promise.all([
    readFile(resolve(root, "src/app.js"), "utf8"),
    readFile(resolve(root, "styles.css"), "utf8")
  ]);
  assert.match(app, /source-chip-scroller/);
  assert.match(app, /role="radiogroup" aria-label="Listing source"/);
  assert.match(app, /id="draft-photo-grid" role="status" aria-live="polite"/);
  assert.match(styles, /--bottom-nav-offset:/);
  assert.match(styles, /bottom: calc\(var\(--bottom-nav-offset\) \+ 12px\)/);
  assert.match(styles, /scroll-padding-bottom: var\(--bottom-nav-clearance\)/);
  assert.match(styles, /\.source-scroll-affordance/);
});

test("the public evaluation prompt uses PEI rules and no numbered street address", () => {
  const prompt = buildAnalysisPrompt({ source: "Kijiji", askingPrice: 10 }, DEFAULT_SETTINGS);
  assert.match(prompt, /Market: Prince Edward Island, Canada/);
  assert.match(prompt, /Search radius: 70 km from Charlottetown/);
  assert.doesNotMatch(prompt, /\b\d{1,5}\s+[A-Za-z]+\s+(Drive|Street|Road|Avenue)\b/i);
});

test("the free AI integration keeps credentials out of public code", async () => {
  const client = await readFile(resolve(root, "src/ai.js"), "utf8");
  const server = await readFile(resolve(root, "netlify/functions/ai.mts"), "utf8");
  const ignore = await readFile(resolve(root, ".gitignore"), "utf8");
  assert.match(client, /https:\/\/flip-finder-ai-api\.netlify\.app\/api\/ai/);
  assert.match(server, /Netlify\.env\.get\("GEMINI_API_KEY"\)/);
  assert.match(server, /gemini-3\.6-flash/);
  assert.doesNotMatch(`${client}\n${server}`, /(github_pat_|AIza)[A-Za-z0-9_-]{20,}/);
  assert.match(ignore, /^\.env$/m);
});

test("the static app shell is served with its required assets", async (context) => {
  const contentTypes = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".webmanifest": "application/manifest+json",
    ".png": "image/png"
  };
  const server = createServer(async (request, response) => {
    const relative = request.url === "/" ? "index.html" : request.url.replace(/^\//, "");
    try {
      const body = await readFile(resolve(root, relative));
      const extension = `.${relative.split(".").pop()}`;
      response.writeHead(200, { "content-type": contentTypes[extension] || "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  context.after(() => new Promise((resolveClose) => server.close(resolveClose)));
  const { port } = server.address();
  for (const path of ["/", "/manifest.webmanifest", "/src/app.js", "/assets/icon-192.png"]) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    assert.equal(response.status, 200, `${path} should be served`);
  }
});
