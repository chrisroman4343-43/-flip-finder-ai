import { calculateFinancials, formatMoney, numberValue } from "./logic.js";

export function calculatorCostDefaults(item) {
  const financials = calculateFinancials(item);
  const fees = Math.max(0, numberValue(item.analysis?.platformFees));
  return {
    otherCosts: Math.max(0, financials.expectedInvestment - financials.purchasePrice - fees),
    manualFee: fees > 0 ? fees : ""
  };
}

// Fees belong here, not inside screens. Only direct local-cash assumptions are
// calculated automatically. Category-specific online fees remain intentionally
// unknown until the seller supplies a current rate for that listing.
export const PLATFORM_FEES = Object.freeze([
  {
    id: "facebook-local",
    name: "Facebook Marketplace",
    saleMode: "Local pickup",
    feeBasis: "direct-local-cash",
    percentage: 0,
    fixed: 0,
    source: null,
    lastVerified: null,
    feeNote: "No platform fee assumed for a direct local cash pickup. Boosts, checkout and delivery are excluded."
  },
  {
    id: "kijiji-local",
    name: "Kijiji",
    saleMode: "Local pickup",
    feeBasis: "direct-local-cash",
    percentage: 0,
    fixed: 0,
    source: null,
    lastVerified: null,
    feeNote: "No platform fee assumed for a direct local cash pickup. Paid upgrades are excluded."
  },
  {
    id: "ebay-ca",
    name: "eBay Canada",
    saleMode: "Shipping or pickup",
    feeBasis: "manual-required",
    percentage: null,
    fixed: null,
    source: "https://www.ebay.ca/help/selling/fees-credits-invoices/selling-fees?id=4822",
    lastVerified: null,
    feeNote: "Fee varies by category and seller account. Enter the current fee shown by eBay before relying on this result."
  },
  {
    id: "etsy-ca",
    name: "Etsy",
    saleMode: "Shipping or pickup",
    feeBasis: "manual-required",
    percentage: null,
    fixed: null,
    source: "https://help.etsy.com/hc/en-us/categories/360001743108-Fees-and-Payments",
    lastVerified: null,
    feeNote: "Fees and payment processing vary by shop and sale. Enter current Etsy fees before relying on this result."
  }
]);

export function findPlatform(id) {
  return PLATFORM_FEES.find((platform) => platform.id === id) || PLATFORM_FEES[0];
}

export function calculatePlatformQuote({ platformId = "facebook-local", salePrice = 0, purchasePrice = 0, shipping = 0, otherCosts = 0, manualFee = "" } = {}) {
  const platform = findPlatform(platformId);
  const sale = Math.max(numberValue(salePrice), 0);
  const purchase = Math.max(numberValue(purchasePrice), 0);
  const ship = Math.max(numberValue(shipping), 0);
  const other = Math.max(numberValue(otherCosts), 0);
  const enteredManualFee = manualFee === "" || manualFee === null || manualFee === undefined ? null : Math.max(numberValue(manualFee), 0);
  const feeKnown = enteredManualFee !== null || platform.percentage !== null;
  const fees = enteredManualFee !== null
    ? enteredManualFee
    : platform.percentage === null
      ? null
      : sale * platform.percentage + numberValue(platform.fixed);
  const takeHome = fees === null ? null : sale - fees - ship;
  const netProfit = takeHome === null ? null : takeHome - purchase - other;
  const margin = netProfit === null || sale <= 0 ? null : netProfit / sale * 100;
  return { platform, sale, purchase, shipping: ship, otherCosts: other, fees, feeKnown, takeHome, netProfit, margin };
}

function searchableText(item) {
  return [item.category, item.name, item.analysis?.suggestedName, item.brand, item.model, item.dimensions]
    .filter(Boolean).join(" ").toLowerCase();
}

export function recommendedPlatforms(item = {}) {
  const text = searchableText(item);
  const bulky = /furniture|table|desk|dresser|sofa|cabinet|shelving|mattress|appliance|large|heavy|oversize/.test(text);
  const shippable = /tool|electronics|camera|game|book|card|collectible|toy|part|component|clothing|shoe|jewell|watch/.test(text);
  const handmadeOrVintage = /handmade|vintage|antique|art|craft|crochet|knit|jewell|collectible/.test(text);
  const rows = [
    {
      platform: findPlatform("facebook-local"),
      fit: bulky ? "Best local option for a bulky item and a Rogue-friendly pickup." : "Strong PEI local option with direct buyer contact and no shipping to manage."
    },
    {
      platform: findPlatform("kijiji-local"),
      fit: bulky ? "Useful second local audience for a bulky pickup-only item." : "Useful second local audience when the item has broad everyday demand."
    }
  ];
  if (shippable) rows.push({ platform: findPlatform("ebay-ca"), fit: "Broader Canadian buyer reach can fit a small, trackable item once its fee and shipping are confirmed." });
  if (handmadeOrVintage) rows.push({ platform: findPlatform("etsy-ca"), fit: "Can fit verified vintage, handmade or craft-led items when shop fees and shipping are viable." });
  return rows;
}

export function calculateFlipScore(item, settings) {
  const analysis = item.analysis || {};
  const purchase = item.purchasePrice === "" || item.purchasePrice === undefined ? numberValue(item.askingPrice) : numberValue(item.purchasePrice);
  const directCosts = numberValue(analysis.cleaningCost) + numberValue(analysis.repairCost) + numberValue(analysis.transportCost) + numberValue(analysis.platformFees);
  const resale = numberValue(analysis.improvedLow) || numberValue(analysis.asIsLow);
  const profit = resale - purchase - directCosts;
  const hours = numberValue(analysis.estimatedHours);
  const hourly = hours > 0 ? profit / hours : null;
  const confidence = String(analysis.confidence || "Low").toLowerCase();
  const bulky = /furniture|table|desk|dresser|sofa|cabinet|shelving|mattress|appliance|large|heavy|oversize/.test(searchableText(item));
  let score = 0;
  score += Math.max(0, Math.min(40, profit / Math.max(numberValue(settings.minimumProfit, 40), 1) * 20));
  score += hourly === null ? 7 : Math.max(0, Math.min(20, hourly / Math.max(numberValue(settings.minimumHourly, 25), 1) * 10));
  score += confidence === "high" ? 15 : confidence === "medium" ? 9 : 3;
  score += Math.max(0, Math.min(12, (100 - purchase) / 100 * 12));
  score += Array.isArray(item.marketEvidence?.sources) && item.marketEvidence.sources.length ? 8 : 0;
  score += bulky ? 0 : 5;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function formatQuoteMoney(value) {
  return value === null || value === undefined ? "Fee required" : formatMoney(value);
}
