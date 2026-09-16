import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS,
  calculateFinancials,
  extractAnalysisJson,
  personalizedDecision
} from "../src/logic.js";

function analyzedItem(overrides = {}) {
  return {
    askingPrice: 20,
    purchasePrice: "",
    expenses: [],
    hoursSpent: 0,
    analysis: {
      asIsLow: 90,
      asIsHigh: 120,
      improvedLow: 110,
      improvedHigh: 140,
      cleaningCost: 5,
      repairCost: 0,
      transportCost: 5,
      platformFees: 0,
      estimatedHours: 2,
      confidence: "Medium",
      biggestRisk: "Condition must be checked"
    },
    ...overrides
  };
}

test("financial calculations use the conservative resale value", () => {
  const result = calculateFinancials(analyzedItem());
  assert.equal(result.expectedInvestment, 30);
  assert.equal(result.expectedNetLow, 80);
  assert.equal(result.expectedProfitPerHour, 40);
});

test("a strong free find receives the immediate pickup verdict", () => {
  const item = analyzedItem({ askingPrice: 0 });
  item.analysis.improvedLow = 100;
  item.analysis.estimatedHours = 2;
  assert.equal(personalizedDecision(item, DEFAULT_SETTINGS).verdict, "Pick Up Immediately");
});

test("an investment above the personal cap is not approved", () => {
  const item = analyzedItem({ askingPrice: 105 });
  item.analysis.improvedLow = 240;
  assert.equal(personalizedDecision(item, DEFAULT_SETTINGS).verdict, "Negotiate");
});

test("an investment near the cap requires high confidence", () => {
  const item = analyzedItem({ askingPrice: 70 });
  item.analysis.cleaningCost = 5;
  item.analysis.improvedLow = 180;
  assert.equal(personalizedDecision(item, DEFAULT_SETTINGS).verdict, "Research Further");
});

test("serious mould risk overrides potential profit", () => {
  const item = analyzedItem();
  item.analysis.biggestRisk = "Possible mould inside the cabinet";
  assert.equal(personalizedDecision(item, DEFAULT_SETTINGS).verdict, "Avoid");
});

test("the free coffee table fixture remains Take Only If Free under personal rules", () => {
  const item = analyzedItem({ askingPrice: 0 });
  Object.assign(item.analysis, {
    improvedLow: 45,
    improvedHigh: 75,
    cleaningCost: 5,
    repairCost: 10,
    transportCost: 0,
    platformFees: 0,
    estimatedHours: 2,
    confidence: "Medium"
  });
  const result = personalizedDecision(item, DEFAULT_SETTINGS);
  assert.equal(result.verdict, "Take Only If Free");
  assert.match(result.reason, /\$40 minimum/);
});

test("AI evaluation JSON can be extracted and new result fields normalized", () => {
  const parsed = extractAnalysisJson('Result: {"suggestedName":"Drill","confidence":"medium","identificationConfidence":"low","asIsLow":"40","estimatedHours":"2","effortLevel":"light","workItems":["Clean the housing"],"visibleFacts":["Cord visible"]} done');
  assert.equal(parsed.suggestedName, "Drill");
  assert.equal(parsed.confidence, "Medium");
  assert.equal(parsed.identificationConfidence, "Low");
  assert.equal(parsed.effortLevel, "Light");
  assert.deepEqual(parsed.workItems, ["Clean the housing"]);
  assert.equal(parsed.asIsLow, 40);
  assert.deepEqual(parsed.visibleFacts, ["Cord visible"]);
});

test("currency strings from an imperfect AI response are normalized", () => {
  const parsed = extractAnalysisJson('{"confidence":"high","asIsLow":"$1,250 CAD"}');
  assert.equal(parsed.asIsLow, 1250);
  assert.equal(parsed.identificationConfidence, "High");
});
