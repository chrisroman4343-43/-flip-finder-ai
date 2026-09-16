import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 428, height: 926 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});

const result = {
  suggestedName: "Printed wooden storage box",
  category: "Vintage storage",
  likelyUse: "Storage or display",
  visibleFacts: ["Wooden boards and printed lettering are visible"],
  likelyPossibilities: ["It may have decorative resale appeal"],
  verifyInPerson: ["Check for mould, pests and loose joints"],
  condition: "Used condition",
  valueFeatures: ["Original printed lettering"],
  safetyConcerns: ["None visible"],
  openingOffer: 5,
  maxPurchasePrice: 20,
  asIsLow: 80,
  asIsHigh: 110,
  improvedLow: 100,
  improvedHigh: 130,
  cleaningCost: 5,
  repairCost: 0,
  transportCost: 0,
  platformFees: 0,
  estimatedHours: 2,
  timeToSell: "1 to 3 weeks",
  confidence: "Medium",
  mainReason: "Low acquisition cost and useful decor appeal",
  biggestRisk: "Local demand may be limited",
  bestStrategy: "Careful cleaning and honest resale",
  nextStep: "Inspect the interior",
  summary: "Promising low-cost flip if the box is dry, solid and free of pests."
};

await page.route("**/api/ai", async (route) => {
  const request = route.request();
  const body = request.postDataJSON();
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      output: body.mode === "analysis" ? JSON.stringify(result) : "Check the structure, odour, moisture, pests and original markings before buying.",
      model: "gemini-3.6-flash",
      remaining: 149
    })
  });
});

await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
await page.getByRole("heading", { name: /Know the margin/ }).waitFor();
assert.equal(await page.locator(".project-card").count(), 2);
await page.screenshot({ path: "tests/home-mobile.png", fullPage: true });

await page.getByRole("link", { name: "Evaluate a new find" }).click();
assert.equal(await page.locator(".source-chip-row").evaluate((row) => row.scrollWidth > row.clientWidth), true);
assert.equal(await page.locator(".source-scroll-affordance").isVisible(), true);
await page.getByLabel("Add Listing").setInputFiles("assets/icon-512.png");
await page.locator("#draft-photo-grid img").waitFor();
assert.equal(await page.locator("#draft-photo-grid").getAttribute("aria-live"), "polite");
await page.getByLabel("Asking price (CAD)").fill("10");
await page.getByText("Add details for a stronger answer").click();
await page.getByLabel("Your temporary item name").fill("Test wooden box");
await page.getByLabel("Seller description").fill("Small used wooden storage box with visible printing.");
await page.getByRole("button", { name: "Evaluate with AI" }).click();
await page.getByText("Buy", { exact: true }).waitFor();
await page.getByText("$85", { exact: true }).waitFor();
await page.getByRole("button", { name: "What Should I Check?" }).click();
await page.getByRole("heading", { name: "What Should I Check?" }).waitFor();
await page.getByRole("button", { name: "Save and Close" }).click();
await page.getByText(/Check the structure, odour/).waitFor();
await page.screenshot({ path: "tests/item-mobile.png", fullPage: true });

assert.deepEqual(errors, []);
await browser.close();
