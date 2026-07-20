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

await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "Spot it. Check it. Flip it." }).waitFor();
assert.equal(await page.locator(".project-card").count(), 2);
await page.screenshot({ path: "tests/home-mobile.png", fullPage: true });

await page.getByRole("link", { name: /Evaluate a Find/ }).first().click();
await page.getByLabel("Upload screenshots").setInputFiles("assets/icon-512.png");
await page.getByLabel("Asking price (CAD)").fill("10");
await page.getByLabel("Your temporary item name").fill("Test wooden box");
await page.getByLabel("Seller description").fill("Small used wooden storage box with visible printing.");
await page.getByRole("button", { name: "Create AI Prompt" }).click();
await page.getByRole("heading", { name: "Evaluate this find" }).waitFor();
await page.getByRole("button", { name: "Close" }).click();

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

await page.getByLabel("2. Paste ChatGPT’s complete answer").fill(JSON.stringify(result));
await page.getByRole("button", { name: "Import Evaluation" }).click();
await page.getByText("Buy", { exact: true }).waitFor();
await page.getByText("$85", { exact: true }).waitFor();
await page.screenshot({ path: "tests/item-mobile.png", fullPage: true });

assert.deepEqual(errors, []);
await browser.close();
