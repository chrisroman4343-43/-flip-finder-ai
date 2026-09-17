import test from "node:test";
import assert from "node:assert/strict";
import {
  buildListingPrompt,
  extractListingJson,
  extractMarketEvidence,
  personalizedDecision
} from "../src/logic.js";
import {
  calculatorCostDefaults,
  calculatePlatformQuote,
  recommendedPlatforms
} from "../src/market.js";


test("market evidence keeps only cited direct claims and permits labelled inference", () => {
  const evidence = extractMarketEvidence(JSON.stringify({
    product: { name: "Test camera" },
    summary: "One active listing was found.",
    trend: "Insufficient Trend Data",
    evidence: [
      { kind: "active_asking", market: "Canada", description: "Active $80 listing", price: 80, sourceUrl: "https://example.com/active" },
      { kind: "verified_sold", market: "Canada", description: "Uncited sale", price: 70, sourceUrl: "https://made-up.example/sold" },
      { kind: "inference", market: "PEI", description: "Local demand still needs confirmation", price: null, sourceUrl: "" }
    ]
  }), [{ title: "Active listing", url: "https://example.com/active" }]);

  assert.equal(evidence.evidence.length, 2);
  assert.equal(evidence.evidence[0].kind, "active_asking");
  assert.equal(evidence.evidence[1].kind, "inference");
  assert.equal(evidence.trend, "Insufficient Trend Data");
});

test("profit quotes keep local cash fees at zero and require a real online fee", () => {
  const local = calculatePlatformQuote({ platformId: "facebook-local", salePrice: 100, purchasePrice: 0, shipping: 0, otherCosts: 10 });
  assert.equal(local.fees, 0);
  assert.equal(local.netProfit, 90);
  const shipped = calculatePlatformQuote({ platformId: "ebay-ca", salePrice: 100, purchasePrice: 20, shipping: 15 });
  assert.equal(shipped.fees, null);
  assert.equal(shipped.netProfit, null);
  const confirmedFee = calculatePlatformQuote({ platformId: "ebay-ca", salePrice: 100, purchasePrice: 20, shipping: 15, manualFee: 13 });
  assert.equal(confirmedFee.netProfit, 52);
});

test("calculator defaults include AI-estimated direct costs", () => {
  const defaults = calculatorCostDefaults({
    askingPrice: 0,
    purchasePrice: "",
    expenses: [],
    analysis: { cleaningCost: 5, repairCost: 15, transportCost: 5, platformFees: 0 }
  });
  assert.deepEqual(defaults, { otherCosts: 25, manualFee: "" });
});

test("platform recommendations preserve bulky-local and small-shippable distinctions", () => {
  assert.deepEqual(recommendedPlatforms({ name: "Solid wood coffee table", category: "Furniture" }).map((row) => row.platform.id), ["facebook-local", "kijiji-local"]);
  assert.ok(recommendedPlatforms({ name: "Vintage camera", category: "Electronics" }).some((row) => row.platform.id === "ebay-ca"));
});

test("listing generation prompt exposes known defects and tells the model not to invent checks", () => {
  const prompt = buildListingPrompt({
    name: "Wrought-iron coffee table",
    source: "Facebook Marketplace",
    analysis: { biggestRisk: "Missing glass insert", verifyInPerson: ["Confirm exact dimensions"] },
    listing: { askingPrice: 40 }
  });
  assert.match(prompt, /Missing glass insert/);
  assert.match(prompt, /Do not invent material, dimensions, age, provenance, model, compatibility, working condition or included parts/);
  const listing = extractListingJson('{"title":"Wrought-Iron Coffee Table — Glass Insert Missing","description":"Coffee table with glass insert missing. Please see photos.","photoGuidance":["Add a close-up of the insert recess."]}');
  assert.match(listing.title, /Glass Insert Missing/);
  assert.equal(listing.photoGuidance.length, 1);
});

test("the personal decision calls out every failed locked profit rule", () => {
  const item = {
    askingPrice: 0,
    purchasePrice: "",
    expenses: [],
    analysis: {
      improvedLow: 45, improvedHigh: 75, cleaningCost: 5, repairCost: 5,
      transportCost: 0, platformFees: 0, estimatedHours: 2, confidence: "Medium"
    }
  };
  const decision = personalizedDecision(item);
  assert.equal(decision.verdict, "Take Only If Free");
  assert.match(decision.reason, /\$40 minimum/);
  assert.match(decision.reason, /\$25\/hour minimum/);
});
