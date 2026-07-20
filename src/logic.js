export const DEFAULT_SETTINGS = Object.freeze({
  homeArea: "Your area",
  marketRegion: "Your local used market",
  preferredAreas: "Enter your preferred towns",
  radiusCentre: "your home area",
  radiusKm: 50,
  vehicle: "Enter your vehicle or transport limits",
  minimumProfit: 30,
  targetProfit: 50,
  minimumHourly: 20,
  targetHourly: 30,
  maxInvestment: 100,
  riskLevel: "Balanced",
  currency: "CAD",
  showExamples: true
});

export const SOURCES = [
  "Facebook Marketplace",
  "Kijiji",
  "Thrift store",
  "Yard or garage sale",
  "Estate sale",
  "Auction",
  "Flea market",
  "Curbside or free listing",
  "ReStore",
  "Clearance or liquidation",
  "Surplus sale",
  "Other"
];

export const STAGES = [
  "Considering",
  "Seller Contacted",
  "Inspection Needed",
  "Passed",
  "Purchased or Picked Up",
  "Cleaning",
  "Repairing",
  "Ready for Photos",
  "Ready to List",
  "Listed",
  "Offer Received",
  "Sold",
  "Donated",
  "Parted Out",
  "Abandoned"
];

const CLOSED_STAGES = new Set(["Sold", "Donated", "Parted Out", "Abandoned"]);

export function numberValue(value, fallback = 0) {
  const cleaned = typeof value === "string"
    ? value.replace(/CAD/gi, "").replaceAll(",", "").replaceAll("$", "").trim()
    : value;
  const parsed = typeof cleaned === "number" ? cleaned : Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatMoney(value) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0
  }).format(numberValue(value));
}

export function formatPercent(value) {
  if (!Number.isFinite(value)) return "—";
  return `${Math.round(value)}%`;
}

export function createId(prefix = "item") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function isClosedStage(stage) {
  return CLOSED_STAGES.has(stage);
}

export function daysBetween(start, end = new Date()) {
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return 0;
  return Math.max(0, Math.floor((end.getTime() - startDate.getTime()) / 86_400_000));
}

export function calculateFinancials(item) {
  const analysis = item.analysis || {};
  const askingPrice = numberValue(item.askingPrice);
  const hasPurchasePrice = item.purchasePrice !== "" && item.purchasePrice !== null && item.purchasePrice !== undefined;
  const purchasePrice = hasPurchasePrice ? numberValue(item.purchasePrice) : askingPrice;
  const recordedExpenses = (item.expenses || []).reduce((sum, expense) => sum + numberValue(expense.amount), 0);
  const plannedCosts =
    numberValue(analysis.cleaningCost) +
    numberValue(analysis.repairCost) +
    numberValue(analysis.transportCost) +
    numberValue(analysis.platformFees);

  const expectedInvestment = purchasePrice + Math.max(plannedCosts, recordedExpenses);
  const actualInvestment = purchasePrice + recordedExpenses;
  const hasImprovedRange = numberValue(analysis.improvedHigh) > 0;
  const resaleLow = hasImprovedRange ? numberValue(analysis.improvedLow) : numberValue(analysis.asIsLow);
  const resaleHigh = hasImprovedRange ? numberValue(analysis.improvedHigh) : numberValue(analysis.asIsHigh);
  const resaleMid = resaleLow && resaleHigh ? (resaleLow + resaleHigh) / 2 : resaleLow || resaleHigh;
  const expectedNetLow = resaleLow - expectedInvestment;
  const expectedNetMid = resaleMid - expectedInvestment;
  const estimatedHours = Math.max(numberValue(analysis.estimatedHours, numberValue(item.hoursSpent)), 0);
  const expectedProfitPerHour = estimatedHours > 0 ? expectedNetLow / estimatedHours : null;
  const salePrice = numberValue(item.salePrice);
  const actualNet = salePrice > 0 ? salePrice - actualInvestment : null;
  const actualProfitPerHour = actualNet !== null && numberValue(item.hoursSpent) > 0
    ? actualNet / numberValue(item.hoursSpent)
    : null;
  const expectedRoi = expectedInvestment > 0 ? (expectedNetLow / expectedInvestment) * 100 : null;
  const actualRoi = actualNet !== null && actualInvestment > 0 ? (actualNet / actualInvestment) * 100 : null;

  return {
    askingPrice,
    purchasePrice,
    recordedExpenses,
    plannedCosts,
    expectedInvestment,
    actualInvestment,
    resaleLow,
    resaleHigh,
    resaleMid,
    expectedNetLow,
    expectedNetMid,
    expectedProfitPerHour,
    expectedRoi,
    salePrice,
    actualNet,
    actualProfitPerHour,
    actualRoi
  };
}

export function personalizedDecision(item, settings = DEFAULT_SETTINGS) {
  if (!item.analysis) {
    return {
      verdict: "Research Further",
      tone: "research",
      reason: "Run the photo evaluation before spending money."
    };
  }

  const financials = calculateFinancials(item);
  const confidence = String(item.analysis.confidence || "low").toLowerCase();
  const biggestRisk = String(item.analysis.biggestRisk || "").toLowerCase();
  const seriousRisk = /(mould|mold|bed bug|pest|unsafe|recall|fire hazard|stolen|asbestos|structural failure)/.test(biggestRisk);
  const minimumProfit = numberValue(settings.minimumProfit, 30);
  const targetProfit = numberValue(settings.targetProfit, 50);
  const minimumHourly = numberValue(settings.minimumHourly, 20);
  const targetHourly = numberValue(settings.targetHourly, 30);
  const maxInvestment = numberValue(settings.maxInvestment, 100);

  if (seriousRisk) {
    return { verdict: "Avoid", tone: "avoid", reason: "The main risk could erase the profit or make the item unsafe to resell." };
  }

  if (financials.expectedInvestment > maxInvestment) {
    return {
      verdict: financials.askingPrice > 0 ? "Negotiate" : "Research Further",
      tone: "negotiate",
      reason: `The expected investment is above your ${formatMoney(maxInvestment)} limit.`
    };
  }

  if (financials.expectedInvestment >= maxInvestment * 0.75 && confidence !== "high") {
    return {
      verdict: "Research Further",
      tone: "research",
      reason: `The investment is close to your ${formatMoney(maxInvestment)} limit, so you require high confidence before buying.`
    };
  }

  if (financials.expectedNetLow < 0) {
    return { verdict: "Avoid", tone: "avoid", reason: "The conservative estimate loses money." };
  }

  if (financials.expectedNetLow < minimumProfit) {
    return financials.askingPrice <= 0
      ? { verdict: "Take Only If Free", tone: "free", reason: `The conservative profit is below your ${formatMoney(minimumProfit)} minimum.` }
      : { verdict: "Negotiate", tone: "negotiate", reason: `The conservative profit is below your ${formatMoney(minimumProfit)} minimum.` };
  }

  if (financials.expectedProfitPerHour !== null && financials.expectedProfitPerHour < minimumHourly) {
    return {
      verdict: "Negotiate",
      tone: "negotiate",
      reason: `The estimated hourly return is below your ${formatMoney(minimumHourly)} minimum.`
    };
  }

  if (confidence === "low") {
    return { verdict: "Research Further", tone: "research", reason: "The value estimate is not confident enough yet." };
  }

  if (financials.askingPrice <= 0 && financials.expectedNetLow >= targetProfit) {
    return { verdict: "Pick Up Immediately", tone: "buy", reason: "It is free and clears your preferred profit target." };
  }

  if (
    financials.expectedNetLow >= targetProfit &&
    (financials.expectedProfitPerHour === null || financials.expectedProfitPerHour >= targetHourly)
  ) {
    return { verdict: "Buy", tone: "buy", reason: "It clears your preferred profit and hourly-return targets." };
  }

  return { verdict: "Negotiate", tone: "negotiate", reason: "It may work, but a lower purchase price gives you a safer margin." };
}

function cleanText(value, fallback = "Not provided") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

export function buildAnalysisPrompt(item, settings = DEFAULT_SETTINGS) {
  return `You are the analysis engine for my personal resale app, Flip Finder AI. Evaluate the item in the photos I attach to this ChatGPT message. If I have not attached the photos yet, tell me to attach them before analysing.

MY FLIPPING RULES
- Currency: Canadian dollars
- Local market: ${cleanText(settings.marketRegion)}
- Preferred buying areas: ${cleanText(settings.preferredAreas)}
- Wider limit: within ${numberValue(settings.radiusKm, 50)} km of ${cleanText(settings.radiusCentre, "the home area")}
- Transport: ${cleanText(settings.vehicle)}
- Minimum acceptable net profit: ${formatMoney(settings.minimumProfit)}
- Preferred net profit: ${formatMoney(settings.targetProfit)} or more
- Minimum profit per hour: ${formatMoney(settings.minimumHourly)}
- Strong profit per hour: ${formatMoney(settings.targetHourly)} or more
- Maximum total investment: ${formatMoney(settings.maxInvestment)}, and only when the profit is highly likely
- Risk approach: ${cleanText(settings.riskLevel)}

ITEM INFORMATION
- Source: ${cleanText(item.source)}
- Asking price: ${formatMoney(item.askingPrice)}
- Listing location: ${cleanText(item.location)}
- Seller description: ${cleanText(item.sellerDescription)}
- Brand or model entered: ${cleanText([item.brand, item.model].filter(Boolean).join(" "))}
- Dimensions entered: ${cleanText(item.dimensions)}
- Condition notes: ${cleanText(item.conditionNotes)}
- My question: ${cleanText(item.question, "Is this worth acquiring and flipping?")}
- Listing link for reference only: ${cleanText(item.listingLink)}

ANALYSIS RULES
1. Work with any item category. Do not assume it is furniture or an antique.
2. Separate clearly visible facts, likely possibilities and facts that must be verified in person.
3. Never present an uncertain brand, model, material, age, condition or value as confirmed.
4. Look for labels, markings, model numbers, missing pieces, damage, mould, pests, rust, cracks, stains and safety concerns.
5. Use conservative local used-market values for the market stated above, not retail or antique-store asking prices.
6. If you can browse, favour recent relevant local comparisons. If you cannot verify comparisons, say so in the summary and lower confidence.
7. Recommend only inexpensive improvements that are likely to add more value than they cost. Preserve original labels, patina and collectible features.
8. Do not recommend unsafe electrical, structural or professional restoration work.
9. Use numbers without dollar signs inside the JSON.

Return ONLY one valid JSON object, with no Markdown fences and no words before or after it. Use this exact structure:
{
  "suggestedName": "short honest item name",
  "category": "best category or Unidentified",
  "likelyUse": "what it is normally used for",
  "visibleFacts": ["fact visible in an attached photo"],
  "likelyPossibilities": ["possibility, clearly qualified"],
  "verifyInPerson": ["specific thing to check"],
  "condition": "short condition assessment",
  "valueFeatures": ["feature that may increase value or should be preserved"],
  "safetyConcerns": ["concern or None visible"],
  "openingOffer": 0,
  "maxPurchasePrice": 0,
  "asIsLow": 0,
  "asIsHigh": 0,
  "improvedLow": 0,
  "improvedHigh": 0,
  "cleaningCost": 0,
  "repairCost": 0,
  "transportCost": 0,
  "platformFees": 0,
  "estimatedHours": 0,
  "timeToSell": "estimated local selling time",
  "confidence": "Low, Medium or High",
  "mainReason": "main reason behind the recommendation",
  "biggestRisk": "single largest risk",
  "bestStrategy": "as-is, clean and sell, repair, bundle, part out or another strategy",
  "nextStep": "one immediate action",
  "summary": "plain-language summary in no more than 60 words"
}`;
}

export const QUICK_ACTIONS = [
  ["worth", "Is It Worth Buying?"],
  ["identify", "Identify This Item"],
  ["inspect", "What Should I Check?"],
  ["max-price", "Maximum Price to Pay"],
  ["seller-message", "Write Seller Message"],
  ["clean", "Create Cleaning Plan"],
  ["repair", "Create Repair Plan"],
  ["supplies", "Make Supply List"],
  ["photos", "Photo Instructions"],
  ["listing", "Write Listing"],
  ["buyer-reply", "Respond to Buyer"],
  ["offer", "Evaluate Offer"],
  ["lower-price", "Should I Lower the Price?"],
  ["profit", "Calculate Final Profit"]
];

const ACTION_REQUESTS = {
  worth: "Tell me whether this item is worth buying under my personal profit rules. Lead with one verdict and explain the numbers simply.",
  identify: "Identify the item from the attached photos. Separate visible facts, possibilities and things I must verify.",
  inspect: "Create a short, category-specific inspection checklist I can use beside the item. Put safety and profit-killing defects first.",
  "max-price": "Calculate the maximum price I should pay while preserving my profit and hourly-return targets. Show the simple calculation.",
  "seller-message": "Write one short, natural Marketplace message asking only the most important unanswered questions. Do not sound automated.",
  clean: "Create a low-cost cleaning plan. Protect labels, original finishes, patina and collectible value. Include supplies, cost, time and safety.",
  repair: "Create a low-cost repair plan only for work likely to increase profit. Avoid unsafe or major repairs. Include a worth-it verdict for each task.",
  supplies: "Make a minimal, inexpensive supply list for the worthwhile cleaning and repair tasks. Do not include expensive tools.",
  photos: "Give exact honest iPhone product-photo instructions: location, background, light direction, camera height, angles, defects, labels, measurements and photo order. Do not hide damage or invent features.",
  listing: "Write a complete, honest Facebook Marketplace and Kijiji listing with title, description, price, lowest acceptable price, measurements, defects, keywords and pickup wording. Do not publish it.",
  "buyer-reply": "Write a short, natural reply to the buyer message I will paste after this request. Protect my lowest acceptable price and do not promise a hold unless I approve it.",
  offer: "Evaluate the buyer offer I will paste after this request. Compare it with my costs and targets, then recommend accept, counter or decline.",
  "lower-price": "Decide whether I should reduce, refresh, relist, bundle, part out or keep the price. Ask me for listing age and buyer interest if they are missing.",
  profit: "Calculate final cash profit, profit per hour, ROI and days to sell. Ask for any missing sale or expense number instead of guessing."
};

export function buildQuickActionPrompt(item, action, settings = DEFAULT_SETTINGS) {
  const financials = calculateFinancials(item);
  const request = ACTION_REQUESTS[action] || "Give me the most useful next step for this flip.";
  return `Act as my practical resale-flipping partner for this one saved project.

REQUEST
${request}

PROJECT
- Item: ${cleanText(item.name || item.analysis?.suggestedName, "Unidentified item")}
- Category: ${cleanText(item.category || item.analysis?.category, "Unidentified")}
- Source: ${cleanText(item.source)}
- Stage: ${cleanText(item.stage)}
- Asking price: ${formatMoney(item.askingPrice)}
- Purchase price: ${item.purchasePrice === "" || item.purchasePrice == null ? "Not purchased" : formatMoney(item.purchasePrice)}
- Expected investment: ${formatMoney(financials.expectedInvestment)}
- Conservative expected profit: ${formatMoney(financials.expectedNetLow)}
- Location: ${cleanText(item.location)}
- Seller description: ${cleanText(item.sellerDescription)}
- Notes: ${cleanText(item.conditionNotes)}
- Existing analysis: ${item.analysis ? JSON.stringify(item.analysis) : "None yet"}
- Recent saved AI notes: ${item.aiHistory?.length ? JSON.stringify(item.aiHistory.slice(-3).map((entry) => ({ title: entry.title, response: entry.response }))) : "None saved"}

MY RULES
- Market: ${cleanText(settings.marketRegion)}; preferred areas ${cleanText(settings.preferredAreas)}; maximum ${numberValue(settings.radiusKm, 50)} km from ${cleanText(settings.radiusCentre, "the home area")}
- ${cleanText(settings.vehicle)}
- Minimum profit ${formatMoney(settings.minimumProfit)}; preferred ${formatMoney(settings.targetProfit)}+
- Minimum hourly return ${formatMoney(settings.minimumHourly)}; strong return ${formatMoney(settings.targetHourly)}+
- Maximum investment ${formatMoney(settings.maxInvestment)} only when profit is highly likely
- ${cleanText(settings.riskLevel)} risk

Be concise, conservative and honest. Clearly mark uncertainty. Do not invent live comparable sales or claim to see photographs unless I attach them to this ChatGPT message.`;
}

export function extractAnalysisJson(rawText) {
  const input = String(rawText || "").trim();
  if (!input) throw new Error("Paste the answer from ChatGPT first.");
  const firstBrace = input.indexOf("{");
  const lastBrace = input.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error("I could not find the JSON result. Ask ChatGPT to return only the requested JSON object.");
  }

  let parsed;
  try {
    parsed = JSON.parse(input.slice(firstBrace, lastBrace + 1));
  } catch {
    throw new Error("The pasted result is incomplete or not valid JSON. Copy the complete ChatGPT answer and try again.");
  }

  const numericFields = [
    "openingOffer",
    "maxPurchasePrice",
    "asIsLow",
    "asIsHigh",
    "improvedLow",
    "improvedHigh",
    "cleaningCost",
    "repairCost",
    "transportCost",
    "platformFees",
    "estimatedHours"
  ];
  numericFields.forEach((field) => {
    parsed[field] = numberValue(parsed[field]);
  });
  ["visibleFacts", "likelyPossibilities", "verifyInPerson", "valueFeatures", "safetyConcerns"].forEach((field) => {
    parsed[field] = Array.isArray(parsed[field]) ? parsed[field].map(String).filter(Boolean) : [];
  });
  parsed.confidence = ["low", "medium", "high"].includes(String(parsed.confidence).toLowerCase())
    ? `${String(parsed.confidence)[0].toUpperCase()}${String(parsed.confidence).slice(1).toLowerCase()}`
    : "Low";
  return parsed;
}
