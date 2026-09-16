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
  suggestedName: "Wrought-iron and wood coffee table",
  identificationConfidence: "Medium",
  category: "Furniture",
  likelyUse: "Coffee table with a recessed glass insert",
  visibleFacts: ["A dark wrought-iron frame and wood surround are visible", "The recessed centre has no glass insert"],
  likelyPossibilities: ["The centre likely originally held a glass panel"],
  verifyInPerson: ["Measure the depth and dimensions of the top recess", "Check the welds for cracks", "Verify dimensions for loading into a Nissan Rogue"],
  condition: "Used with missing glass insert",
  valueFeatures: ["Decorative wrought-iron base"],
  safetyConcerns: ["None visible"],
  openingOffer: 0,
  maxPurchasePrice: 0,
  asIsLow: 10,
  asIsHigh: 25,
  improvedLow: 45,
  improvedHigh: 75,
  cleaningCost: 5,
  repairCost: 10,
  transportCost: 0,
  platformFees: 0,
  estimatedHours: 2,
  effortLevel: "Light",
  workItems: ["Source a correctly sized replacement glass panel", "Clean the wood finish", "Touch up visible scratches"],
  timeToSell: "2 to 6 weeks",
  confidence: "Medium",
  mainReason: "Free acquisition limits cash risk, but replacement glass may erase the margin",
  biggestRisk: "Replacement glass cost and fit are unknown",
  bestStrategy: "Confirm whether the glass is included before pickup",
  nextStep: "Message seller to ask if the glass insert is included and request exact dimensions",
  summary: "A free table may be usable, but missing custom glass limits the conservative resale value."
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
await page.getByLabel("Asking price (CAD)").fill("0");
await page.getByText("Add details for a stronger answer").click();
await page.getByLabel("Your temporary item name").fill("Wrought-iron and wood coffee table");
await page.getByLabel("Seller description").fill("Free coffee table. Glass insert appears to be missing.");
await page.getByRole("button", { name: "Evaluate with AI" }).click();
await page.getByText("Take Only If Free", { exact: true }).waitFor();
await page.getByText("Evaluation confidence: Medium", { exact: true }).waitFor();
await page.getByText("Identification confidence:", { exact: false }).waitFor();
await page.getByText("Free / $0", { exact: true }).waitFor();
await page.getByText("About 2 hrs · Light", { exact: true }).waitFor();
await page.getByText("Clearly visible facts", { exact: true }).waitFor();
await page.getByText("Likely possibilities", { exact: true }).waitFor();
await page.getByText("Must verify in person", { exact: true }).waitFor();
await page.getByRole("button", { name: "What Should I Check?" }).click();
await page.getByRole("heading", { name: "What Should I Check?" }).waitFor();
await page.getByRole("button", { name: "Save and Close" }).click();
await page.getByText(/Check the structure, odour/).waitFor();
await page.screenshot({ path: "tests/item-mobile.png", fullPage: true });

assert.deepEqual(errors, []);
await browser.close();
