export const DEFAULT_SETTINGS = Object.freeze({homeArea:"Johnstons River, PEI",marketRegion:"Prince Edward Island, Canada",preferredAreas:"Stratford, Charlottetown, Cornwall",radiusCentre:"Charlottetown",radiusKm:70,vehicle:"Nissan Rogue, rear seats fold down",minimumProfit:40,targetProfit:60,minimumHourly:25,targetHourly:35,maxInvestment:100,riskLevel:"Balanced",currency:"CAD",showExamples:true});
export const SOURCES=["Facebook Marketplace","Kijiji","Thrift store","Yard or garage sale","Estate sale","Auction","Flea market","Curbside or free listing","ReStore","Clearance or liquidation","Surplus sale","Other"];
export const STAGES=["Considering","Seller Contacted","Inspection Needed","Passed","Purchased or Picked Up","Cleaning","Repairing","Ready for Photos","Ready to List","Listed","Offer Received","Sold","Donated","Parted Out","Abandoned"];
const CLOSED_STAGES=new Set(["Sold","Donated","Parted Out","Abandoned"]);
export function numberValue(value,fallback=0){const cleaned=typeof value==="string"?value.replace(/CAD/gi,"").replaceAll(",","").replaceAll("$","").trim():value;const parsed=typeof cleaned==="number"?cleaned:Number.parseFloat(cleaned);return Number.isFinite(parsed)?parsed:fallback;}
export function formatMoney(value){return new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD",maximumFractionDigits:0}).format(numberValue(value));}
export function formatPercent(value){return Number.isFinite(value)?`${Math.round(value)}%`:"—";}
export function createId(prefix="item"){if(globalThis.crypto?.randomUUID)return `${prefix}-${globalThis.crypto.randomUUID()}`;return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;}
export function isClosedStage(stage){return CLOSED_STAGES.has(stage);}
export function daysBetween(start,end=new Date()){const d=new Date(start);return Number.isNaN(d.getTime())?0:Math.max(0,Math.floor((end.getTime()-d.getTime())/86400000));}
function confidenceLevel(value){const v=String(value||"low").toLowerCase();return v.startsWith("high")?"high":v.startsWith("medium")?"medium":"low";}
export function calculateFinancials(item){const a=item.analysis||{};const askingPrice=numberValue(item.askingPrice);const hasPurchasePrice=item.purchasePrice!==""&&item.purchasePrice!==null&&item.purchasePrice!==undefined;const purchasePrice=hasPurchasePrice?numberValue(item.purchasePrice):askingPrice;const recordedExpenses=(item.expenses||[]).reduce((s,e)=>s+numberValue(e.amount),0);const plannedCosts=numberValue(a.cleaningCost)+numberValue(a.repairCost)+numberValue(a.transportCost)+numberValue(a.platformFees);const expectedInvestment=purchasePrice+Math.max(plannedCosts,recordedExpenses);const actualInvestment=purchasePrice+recordedExpenses;const asIsLow=numberValue(a.asIsLow),asIsHigh=numberValue(a.asIsHigh),improvedLow=numberValue(a.improvedLow),improvedHigh=numberValue(a.improvedHigh);const improved=improvedLow>0&&improvedHigh>0;const resaleLow=improved?improvedLow:asIsLow,resaleHigh=improved?improvedHigh:asIsHigh,resaleMid=resaleLow&&resaleHigh?(resaleLow+resaleHigh)/2:resaleLow||resaleHigh;const estimatedHours=Math.max(numberValue(a.estimatedHours,numberValue(item.hoursSpent)),0);const expectedNetLow=resaleLow-expectedInvestment,expectedNetMid=resaleMid-expectedInvestment,expectedProfitPerHour=estimatedHours>0?expectedNetLow/estimatedHours:null;const salePrice=numberValue(item.salePrice);const actualNet=salePrice>0?salePrice-actualInvestment:null;const actualProfitPerHour=actualNet!==null&&numberValue(item.hoursSpent)>0?actualNet/numberValue(item.hoursSpent):null;const expectedRoi=expectedInvestment>0?expectedNetLow/expectedInvestment*100:null;const actualRoi=actualNet!==null&&actualInvestment>0?actualNet/actualInvestment*100:null;return{askingPrice,purchasePrice,recordedExpenses,plannedCosts,expectedInvestment,actualInvestment,resaleLow,resaleHigh,resaleMid,expectedNetLow,expectedNetMid,expectedProfitPerHour,expectedRoi,salePrice,actualNet,actualProfitPerHour,actualRoi};}
export function personalizedDecision(item,settings=DEFAULT_SETTINGS){if(!item.analysis)return{verdict:"Research Further",tone:"research",reason:"Run the AI evaluation before spending money."};const a=item.analysis,f=calculateFinancials(item),confidence=confidenceLevel(a.confidence),minProfit=numberValue(settings.minimumProfit,40),targetProfit=numberValue(settings.targetProfit,60),minHourly=numberValue(settings.minimumHourly,25),targetHourly=numberValue(settings.targetHourly,35),maxInvestment=numberValue(settings.maxInvestment,100),riskText=`${a.biggestRisk||""} ${(a.safetyConcerns||[]).join(" ")}`.toLowerCase();if(/mould|mold|bed bug|pest infestation|unsafe|fire hazard|asbestos|stolen|structural failure|recall/.test(riskText))return{verdict:"Avoid",tone:"avoid",reason:"A safety, contamination, recall or structural risk could wipe out the profit."};if(f.expectedInvestment>maxInvestment)return{verdict:f.askingPrice>0?"Negotiate":"Research Further",tone:"negotiate",reason:`Total expected investment is above your ${formatMoney(maxInvestment)} limit.`};if(f.expectedNetLow<0)return{verdict:"Avoid",tone:"avoid",reason:"The conservative resale estimate loses money after expected costs."};const failedRules=[];if(f.expectedNetLow<minProfit)failedRules.push(`Conservative profit is below your ${formatMoney(minProfit)} minimum.`);if(f.expectedProfitPerHour!==null&&f.expectedProfitPerHour<minHourly)failedRules.push(`Estimated return is below your ${formatMoney(minHourly)}/hour minimum.`);if(failedRules.length)return{verdict:f.askingPrice<=0?"Take Only If Free":"Negotiate",tone:f.askingPrice<=0?"free":"negotiate",reason:`${failedRules.join(" ")}${f.askingPrice>0?" Lower the buy price.":""}`};if(confidence==="low")return{verdict:"Research Further",tone:"research",reason:"The AI is not confident enough to risk your money yet. Get the model, condition and comparable-sale evidence."};if(f.expectedInvestment>=maxInvestment*.8&&confidence!=="high")return{verdict:"Research Further",tone:"research",reason:`This uses most of your ${formatMoney(maxInvestment)} cap. Only proceed with high confidence after an in-person check.`};if(f.askingPrice<=0&&f.expectedNetLow>=targetProfit)return{verdict:"Pick Up Immediately",tone:"buy",reason:`It is free and clears your ${formatMoney(targetProfit)} preferred profit target.`};if(f.expectedNetLow>=targetProfit&&(f.expectedProfitPerHour===null||f.expectedProfitPerHour>=targetHourly))return{verdict:"Buy",tone:"buy",reason:`It clears your ${formatMoney(targetProfit)} profit and ${formatMoney(targetHourly)}/hour preferred targets.`};return{verdict:"Negotiate",tone:"negotiate",reason:"The flip may work, but your margin is not strong enough at the current price."};}
function cleanText(value,fallback="Not provided"){const text=String(value??"").trim();return text||fallback;}
export function buildAnalysisPrompt(item,settings=DEFAULT_SETTINGS){return `You are Flip Finder AI, a practical resale-flipping assistant for one Canadian user. Analyze the attached item photos and listing information. Work with ANY category. Never pretend an uncertain identification, value, age, material, brand, model or condition is confirmed.

USER RULES
Market: ${cleanText(settings.marketRegion)}
Preferred areas: ${cleanText(settings.preferredAreas)}
Search radius: ${numberValue(settings.radiusKm,70)} km from ${cleanText(settings.radiusCentre,"Charlottetown")}
Transport: ${cleanText(settings.vehicle)}
Minimum net profit: ${formatMoney(settings.minimumProfit)}
Preferred net profit: ${formatMoney(settings.targetProfit)}
Minimum profit per hour: ${formatMoney(settings.minimumHourly)}
Preferred profit per hour: ${formatMoney(settings.targetHourly)}
Maximum total investment: ${formatMoney(settings.maxInvestment)}
Risk: ${cleanText(settings.riskLevel)}

LISTING
Source: ${cleanText(item.source)}
Asking price: ${formatMoney(item.askingPrice)}
Location: ${cleanText(item.location)}
Description: ${cleanText(item.sellerDescription)}
Brand/model: ${cleanText([item.brand,item.model].filter(Boolean).join(" "))}
Dimensions: ${cleanText(item.dimensions)}
Condition notes: ${cleanText(item.conditionNotes)}
Question: ${cleanText(item.question,"Is this worth flipping?")}

RULES
1. Separate visible facts, likely possibilities and must-verify checks.
2. Look for labels, model numbers, markings, material, construction, damage, missing parts, moisture, mould, pests, rust, cracks, stains and safety issues.
3. Use conservative local used-market estimates, not retail or antique-store asking prices. Never invent sold comparables.
4. Normal local cash Marketplace/Kijiji platform fee = 0 unless the user supplies a real fee. Do not invent fees.
5. Transport cost = 0 unless a real distance/cost is supplied. Do not invent fuel costs.
6. The app calculates the final buy decision. Do not override its profit rules.
7. Recommend only low-cost improvements where likely added value exceeds cost. Preserve labels, finishes, patina and collectible features.
8. Avoid unsafe electrical, structural, mould-remediation or professional restoration instructions.
9. Do not hide defects or create misleading listing photos.
10. Overall evaluation confidence and item-identification confidence are separate. Report each as Low, Medium or High.
11. Estimate the hands-on work required and list only specific tasks supported by the photos or listing.
12. Return JSON only.

JSON FORMAT
{"suggestedName":"","identificationConfidence":"Low, Medium or High","category":"","likelyUse":"","visibleFacts":[],"likelyPossibilities":[],"verifyInPerson":[],"condition":"","valueFeatures":[],"safetyConcerns":[],"openingOffer":0,"maxPurchasePrice":0,"asIsLow":0,"asIsHigh":0,"improvedLow":0,"improvedHigh":0,"cleaningCost":0,"repairCost":0,"transportCost":0,"platformFees":0,"estimatedHours":0,"effortLevel":"Light, Moderate or Heavy","workItems":[],"timeToSell":"","confidence":"Low, Medium or High","mainReason":"","biggestRisk":"","bestStrategy":"","nextStep":"","summary":""}`;}
export const QUICK_ACTIONS=[["worth","Is It Worth Buying?"],["identify","Identify This Item"],["inspect","What Should I Check?"],["max-price","Maximum Price to Pay"],["seller-message","Write Seller Message"],["clean","Create Cleaning Plan"],["repair","Create Repair Plan"],["supplies","Make Supply List"],["photos","Photo Instructions"],["listing","Write Listing"],["buyer-reply","Respond to Buyer"],["offer","Evaluate Offer"],["lower-price","Should I Lower the Price?"],["profit","Calculate Final Profit"]];
const ACTION_REQUESTS={worth:"Give one clear verdict using my saved profit rules. Show asking price, realistic resale, expected costs, conservative net profit and the price I should actually pay.",identify:"Identify the item from the photos. Separate visible facts, likely possibilities and must-verify information. Look for model numbers and labels.",inspect:"Create a short category-specific inspection checklist. Put safety, completeness and profit-killing defects first.","max-price":"Calculate a conservative maximum purchase price using my minimum profit and hourly targets. Do not use a higher AI guess if it conflicts with my rules.","seller-message":"Write one short natural message asking only the most important unanswered questions before I travel to see the item.",clean:"Create a low-cost cleaning plan with supplies, cost, time and safety. Protect original finish, labels and patina.",repair:"Create a low-cost repair plan only where expected value increase exceeds cost. Clearly mark anything I should not attempt myself.",supplies:"Give me the smallest inexpensive supply list for worthwhile work. Avoid specialized tools unless the item justifies them.",photos:"Give exact iPhone product-photo instructions for an honest listing: setup, light, angles, detail shots, measurements and defects.",listing:"Write an honest Facebook Marketplace/Kijiji listing. Include title, description, condition, measurements, defects, included parts, asking price, lowest acceptable price and photo order. Do not publish it.","buyer-reply":"Write a short natural reply to the buyer message I provide. Protect my minimum acceptable price and do not promise a hold unless I approve it.",offer:"Evaluate the buyer offer against my actual investment and saved profit rules. Recommend accept, counter or decline with exact numbers.","lower-price":"Decide whether to lower price, refresh, relist, bundle, part out or hold. Ask for missing listing age or interest data rather than guessing.",profit:"Calculate final sale profit, profit per hour, ROI and total investment from saved numbers. Ask for missing numbers instead of guessing."};
export function buildQuickActionPrompt(item,action,settings=DEFAULT_SETTINGS){const request=ACTION_REQUESTS[action]||"Help me make the most practical next decision for this flip.";const f=calculateFinancials(item);return `You are inside Flip Finder AI. ${request}

MY RULES: minimum profit ${formatMoney(settings.minimumProfit)}, preferred ${formatMoney(settings.targetProfit)}, minimum hourly ${formatMoney(settings.minimumHourly)}, preferred ${formatMoney(settings.targetHourly)}, maximum investment ${formatMoney(settings.maxInvestment)}, balanced risk, PEI market.
ITEM: ${cleanText(item.name||item.analysis?.suggestedName)} | ${cleanText(item.category||item.analysis?.category)} | ${cleanText(item.source)} | asking ${formatMoney(item.askingPrice)} | purchase ${item.purchasePrice===""?"not purchased":formatMoney(item.purchasePrice)}
CURRENT NUMBERS: expected investment ${formatMoney(f.expectedInvestment)}, conservative resale ${formatMoney(f.resaleLow)}–${formatMoney(f.resaleHigh)}, conservative net ${formatMoney(f.expectedNetLow)}, estimated hourly ${f.expectedProfitPerHour==null?"unknown":formatMoney(f.expectedProfitPerHour)}.
SAVED AI REPORT: ${JSON.stringify(item.analysis||{})}
Answer directly and practically. If information is missing, say exactly what is missing. Never invent local sold prices or facts.`;}

export function buildMarketResearchPrompt(item, settings=DEFAULT_SETTINGS, purpose="valuation") {
  const analysis = item.analysis || {};
  const query = [item.brand, item.model, item.name, analysis.suggestedName, item.category || analysis.category, item.dimensions].filter(Boolean).join(" | ");
  return `You are Flip Finder's market research assistant. Google Search is available. Research only this confirmed item identity: ${cleanText(query, "Unidentified item")}.\n\nPURPOSE: ${purpose === "retail" ? "Find current NEW retail references only. Do not use them as used resale comps." : "Find cautious used-market evidence for a PEI resale decision."}\nMARKET PRIORITY: Prince Edward Island first, then Atlantic Canada, then Canada, then broader North America only if the local sample is sparse.\nCONDITION: ${cleanText(item.conditionNotes || analysis.condition)}. Physical condition is not assessed unless photos or notes support it.\n\nRETURN JSON ONLY using this exact shape:\n{"product":{"name":"","brand":"","model":"","category":""},"summary":"","trend":"Up|Stable|Down|Insufficient Trend Data","evidence":[{"kind":"verified_sold|active_asking|retail_reference|inference","market":"PEI|Atlantic Canada|Canada|Broader North America","description":"","price":null,"sourceUrl":""}]}\n\nHONESTY RULES:\n- Add a verified_sold entry ONLY if the cited source explicitly says the item sold or shows a completed sale and price.\n- Add an active_asking entry ONLY if the cited source is an active listing asking price.\n- Retail_reference means a current new-price page only.\n- If direct evidence is incomplete, use inference and say so.\n- Do not invent URLs, prices, source counts, trend or condition.\n- Use sourceUrl only when it is one of the exact URLs returned as a Google Search citation.\n- Use Insufficient Trend Data unless dated evidence is strong enough to support Up, Stable or Down.\n- The app's locked PEI profit rules, not your prose, make the buy decision.`;
}

export function buildListingPrompt(item, settings=DEFAULT_SETTINGS) {
  const analysis = item.analysis || {};
  return `You are writing one honest Canadian resale listing for Flip Finder. Return JSON only: {"title":"","description":"","photoGuidance":[""]}.\n\nCONFIRMED ITEM INFORMATION\nName: ${cleanText(item.name || analysis.suggestedName)}\nBrand/model: ${cleanText([item.brand, item.model].filter(Boolean).join(" "))}\nCategory: ${cleanText(item.category || analysis.category)}\nDimensions: ${cleanText(item.dimensions)}\nCondition notes: ${cleanText(item.conditionNotes || analysis.condition)}\nVisible facts: ${JSON.stringify(analysis.visibleFacts || [])}\nKnown defects / risks: ${JSON.stringify([...(analysis.safetyConcerns || []), analysis.biggestRisk].filter(Boolean))}\nLikely possibilities (do not present as fact): ${JSON.stringify(analysis.likelyPossibilities || [])}\nIncluded/missing parts: ${JSON.stringify(analysis.verifyInPerson || [])}\nSource / pickup context: ${cleanText(item.source)} in PEI\nSelected asking price: ${item.listing?.askingPrice === "" || item.listing?.askingPrice === undefined ? "Not selected" : formatMoney(item.listing.askingPrice)}\n\nRULES\n- Title should be concise and marketplace-friendly, normally under 80 characters.\n- Use only confirmed information. Do not invent material, dimensions, age, provenance, model, compatibility, working condition or included parts.\n- Every known defect must be disclosed clearly.\n- Do not state a likely possibility as a fact.\n- If dimensions or a key condition are unknown, ask the seller/user to confirm in photoGuidance rather than making them up.\n- Include PEI pickup language only if it is supported by the item information.\n- This is copy for the user to post manually; do not claim publication.`;
}

function extractJsonObject(output, errorMessage) {
  if (!output) throw new Error(errorMessage);
  let text = String(output).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const first = text.indexOf("{"), last = text.lastIndexOf("}");
  if (first >= 0 && last > first) text = text.slice(first, last + 1);
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new Error(errorMessage);
  }
}

export function extractMarketEvidence(output, citations = []) {
  const parsed = extractJsonObject(output, "Market research was not in the expected format. Try again.");
  const allowedUrls = new Set((citations || []).map((entry) => String(entry?.url || "")).filter((url) => /^https:\/\//i.test(url)));
  const allowedKinds = new Set(["verified_sold", "active_asking", "retail_reference", "inference"]);
  const evidence = Array.isArray(parsed.evidence) ? parsed.evidence.map((entry) => ({
    kind: allowedKinds.has(String(entry?.kind || "")) ? String(entry.kind) : "inference",
    market: ["PEI", "Atlantic Canada", "Canada", "Broader North America"].includes(String(entry?.market || "")) ? String(entry.market) : "Broader North America",
    description: String(entry?.description || "").trim(),
    price: entry?.price === null || entry?.price === undefined || entry?.price === "" ? null : numberValue(entry.price),
    sourceUrl: String(entry?.sourceUrl || "").trim()
  })).filter((entry) => entry.description && (entry.kind === "inference" || allowedUrls.has(entry.sourceUrl))) : [];
  const trend = ["Up", "Stable", "Down", "Insufficient Trend Data"].includes(String(parsed.trend || "")) ? String(parsed.trend) : "Insufficient Trend Data";
  const product = parsed.product && typeof parsed.product === "object" ? {
    name: String(parsed.product.name || "").trim(),
    brand: String(parsed.product.brand || "").trim(),
    model: String(parsed.product.model || "").trim(),
    category: String(parsed.product.category || "").trim()
  } : { name: "", brand: "", model: "", category: "" };
  return {
    product,
    summary: String(parsed.summary || "").trim() || "Grounded sources were found, but no summary was returned.",
    trend,
    evidence,
    sources: (citations || []).filter((entry) => /^https:\/\//i.test(String(entry?.url || ""))).map((entry) => ({ title: String(entry.title || entry.url), url: String(entry.url) })).slice(0, 12)
  };
}

export function extractListingJson(output) {
  const parsed = extractJsonObject(output, "The listing draft was not in the expected format. Try again.");
  const title = String(parsed.title || "").replace(/\s+/g, " ").trim().slice(0, 120);
  const description = String(parsed.description || "").trim().slice(0, 6000);
  const photoGuidance = Array.isArray(parsed.photoGuidance) ? parsed.photoGuidance.map((value) => String(value || "").trim()).filter(Boolean).slice(0, 8) : [];
  if (!title || !description) throw new Error("The listing draft needs both a title and description. Try again.");
  return { title, description, photoGuidance };
}
export function extractAnalysisJson(output){if(!output)throw new Error("The AI returned no evaluation.");let text=String(output).trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"");const first=text.indexOf("{"),last=text.lastIndexOf("}");if(first>=0&&last>first)text=text.slice(first,last+1);try{const parsed=JSON.parse(text);if(!parsed||typeof parsed!=="object")throw new Error();for(const key of["openingOffer","maxPurchasePrice","asIsLow","asIsHigh","improvedLow","improvedHigh","cleaningCost","repairCost","transportCost","platformFees","estimatedHours"])if(key in parsed)parsed[key]=numberValue(parsed[key]);const confidence=confidenceLevel(parsed.confidence);parsed.confidence=confidence[0].toUpperCase()+confidence.slice(1);const identificationConfidence=confidenceLevel(parsed.identificationConfidence||parsed.confidence);parsed.identificationConfidence=identificationConfidence[0].toUpperCase()+identificationConfidence.slice(1);const effort=String(parsed.effortLevel||"").toLowerCase();parsed.effortLevel=effort.startsWith("heavy")?"Heavy":effort.startsWith("moderate")?"Moderate":numberValue(parsed.estimatedHours)>2?"Moderate":"Light";parsed.workItems=Array.isArray(parsed.workItems)?parsed.workItems.map((entry)=>String(entry||"").trim()).filter(Boolean):[];return parsed;}catch{throw new Error("The AI response was not in the expected format. Try the evaluation again.");}}
