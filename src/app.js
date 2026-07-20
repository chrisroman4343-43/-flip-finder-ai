import {
  clearItems,
  deleteItem as deleteStoredItem,
  getAllItems,
  getSetting,
  openDatabase,
  saveItem,
  saveManyItems,
  saveSetting
} from "./db.js";
import {
  DEFAULT_SETTINGS,
  QUICK_ACTIONS,
  SOURCES,
  STAGES,
  buildAnalysisPrompt,
  buildQuickActionPrompt,
  calculateFinancials,
  createId,
  daysBetween,
  extractAnalysisJson,
  formatMoney,
  formatPercent,
  isClosedStage,
  numberValue,
  personalizedDecision
} from "./logic.js";

const app = document.querySelector("#app");
const modalRoot = document.querySelector("#modal-root");
const toast = document.querySelector("#toast");

const state = {
  items: [],
  settings: { ...DEFAULT_SETTINGS },
  draftPhotos: [],
  projectFilter: "all",
  promptText: "",
  promptTitle: "",
  toastTimer: null
};

const SAMPLE_IDS = new Set(["sample-cordless-drill", "sample-small-bookcase"]);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safePhotoUrl(value) {
  const url = String(value || "");
  if (url.startsWith("data:image/") || url.startsWith("blob:") || url.startsWith("./assets/")) {
    return escapeHtml(url);
  }
  return "";
}

function safeWebUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function sortItems(items) {
  return [...items].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
}

function route() {
  const raw = window.location.hash.replace(/^#\/?/, "") || "home";
  const [name, ...rest] = raw.split("/");
  return { name, id: rest.length ? decodeURIComponent(rest.join("/")) : null };
}

function navigate(path) {
  const next = `#${path}`;
  if (window.location.hash === next) render();
  else window.location.hash = next;
}

function activeTab(currentRoute) {
  if (currentRoute.name === "item") return "projects";
  return ["home", "evaluate", "projects", "settings"].includes(currentRoute.name)
    ? currentRoute.name
    : "home";
}

function layout(content, currentRoute = route()) {
  const active = activeTab(currentRoute);
  return `
    <div class="app-shell">
      <header class="topbar">
        <a class="topbar-brand" href="#home" aria-label="Flip Finder AI home">
          <span class="brand-mark" aria-hidden="true">FF</span>
          <span class="topbar-title">
            <strong>Flip Finder AI</strong>
            <span>${escapeHtml(state.settings.homeArea)}</span>
          </span>
        </a>
        <button class="quiet-button" data-action="install-help" type="button" aria-label="Installation help" style="min-height:40px;padding:.55rem .7rem">iPhone</button>
      </header>
      <main class="main-content">${content}</main>
      <nav class="bottom-nav" aria-label="Main navigation">
        ${navLink("home", "⌂", "Home", active)}
        ${navLink("evaluate", "＋", "Evaluate", active)}
        ${navLink("projects", "▣", "Projects", active)}
        ${navLink("settings", "⚙", "Settings", active)}
      </nav>
    </div>`;
}

function navLink(name, icon, label, active) {
  return `<a class="nav-link ${active === name ? "active" : ""}" href="#${name}">
    <span class="nav-icon" aria-hidden="true">${icon}</span><span>${label}</span>
  </a>`;
}

function makeSamples() {
  const now = new Date().toISOString();
  return [
    {
      id: "sample-cordless-drill",
      name: "Used cordless drill kit",
      category: "Tools",
      source: "Kijiji",
      askingPrice: 20,
      purchasePrice: "",
      location: "Nearby",
      dimensions: "Not provided",
      brand: "",
      model: "",
      sellerDescription: "Used cordless drill with charger and one battery. Working condition not confirmed.",
      listingLink: "",
      conditionNotes: "Check battery health, charger, chuck, trigger and whether the model has local demand.",
      question: "Is this worth paying $20 for and what should be tested?",
      stage: "Considering",
      nextAction: "Run AI evaluation and ask for the model number.",
      photos: [],
      expenses: [],
      aiHistory: [],
      salePrice: "",
      hoursSpent: 0,
      createdAt: now,
      updatedAt: now,
      isExample: true
    },
    {
      id: "sample-small-bookcase",
      name: "Free small bookcase",
      category: "Home storage",
      source: "Curbside or free listing",
      askingPrice: 0,
      purchasePrice: "",
      location: "Nearby",
      dimensions: "Not provided",
      brand: "",
      model: "",
      sellerDescription: "Small used bookcase offered free for pickup.",
      listingLink: "",
      conditionNotes: "Check stability, backing, shelves, odour, moisture, pests and vehicle fit.",
      question: "Is this free item worth collecting and cleaning for resale?",
      stage: "Considering",
      nextAction: "Request dimensions and inspect for hidden damage.",
      photos: [],
      expenses: [],
      aiHistory: [],
      salePrice: "",
      hoursSpent: 0,
      createdAt: now,
      updatedAt: now,
      isExample: true
    }
  ];
}

async function initialize() {
  try {
    await openDatabase();
    const [items, savedProfile, samplesSeeded] = await Promise.all([
      getAllItems(),
      getSetting("profile"),
      getSetting("samplesSeeded")
    ]);
    state.settings = { ...DEFAULT_SETTINGS, ...(savedProfile || {}) };
    state.items = sortItems(items || []);

    if (!samplesSeeded && state.items.length === 0 && state.settings.showExamples) {
      const samples = makeSamples();
      await saveManyItems(samples);
      await saveSetting("samplesSeeded", true);
      state.items = samples;
    }

    if (!window.location.hash) window.location.hash = "#home";
    render();
    registerServiceWorker();
  } catch (error) {
    app.innerHTML = layout(`
      <div class="page-head"><p class="eyebrow">Storage problem</p><h1>Flip Finder could not open</h1></div>
      <div class="notice warn">${escapeHtml(error.message || "Local storage is unavailable. Try opening the app in a normal Safari tab rather than Private Browsing.")}</div>
    `);
  }
}

function render() {
  const currentRoute = route();
  let content;
  switch (currentRoute.name) {
    case "evaluate":
      content = renderEvaluate();
      break;
    case "projects":
      content = renderProjects();
      break;
    case "item":
      content = renderItem(currentRoute.id);
      break;
    case "settings":
      content = renderSettings();
      break;
    case "home":
    default:
      content = renderHome();
      break;
  }
  app.innerHTML = layout(content, currentRoute);
  window.scrollTo({ top: 0, behavior: "instant" });
}

function dashboardStats() {
  const active = state.items.filter((item) => !isClosedStage(item.stage));
  const analyzed = active.filter((item) => item.analysis);
  const totalInvested = active.reduce((sum, item) => sum + calculateFinancials(item).actualInvestment, 0);
  const expectedProfit = analyzed.reduce((sum, item) => sum + Math.max(0, calculateFinancials(item).expectedNetLow), 0);
  const soldProfit = state.items
    .filter((item) => item.stage === "Sold")
    .reduce((sum, item) => sum + (calculateFinancials(item).actualNet || 0), 0);
  return { active: active.length, totalInvested, expectedProfit, soldProfit };
}

function renderHome() {
  const stats = dashboardStats();
  const needsDecision = state.items.filter((item) => !item.analysis && !isClosedStage(item.stage)).slice(0, 3);
  const activeProjects = state.items.filter((item) => item.analysis && !isClosedStage(item.stage)).slice(0, 3);
  return `
    <section class="hero-card">
      <p class="eyebrow">Your personal flipping assistant</p>
      <h1>Spot it. Check it. Flip it.</h1>
      <p>Upload a Marketplace or Kijiji screenshot, apply your personal profit rules, and keep the entire flip in one place.</p>
      <a class="primary-button" href="#evaluate">＋ Evaluate a Find</a>
    </section>

    <section class="metric-grid" aria-label="Dashboard summary">
      ${metric("Active finds", stats.active, "Open projects")}
      ${metric("Money invested", formatMoney(stats.totalInvested), "Current projects")}
      ${metric("Expected profit", formatMoney(stats.expectedProfit), "Conservative total", true)}
      ${metric("Profit recorded", formatMoney(stats.soldProfit), "Completed sales", true)}
    </section>

    <div class="notice">Your projects stay on this device. Use <strong>Settings → Export Backup</strong> regularly so they can be restored if Safari data is cleared.</div>

    <section class="section-heading"><h2>Needs a decision</h2><a href="#projects">See all</a></section>
    ${needsDecision.length ? `<div class="project-list">${needsDecision.map(projectCard).join("")}</div>` : emptyState("✓", "Nothing waiting", "Every open find has an evaluation.")}

    <section class="section-heading"><h2>Active flips</h2><a href="#projects">See all</a></section>
    ${activeProjects.length ? `<div class="project-list">${activeProjects.map(projectCard).join("")}</div>` : emptyState("↗", "No active flips yet", "Evaluate a find and paste the ChatGPT result to begin.")}
  `;
}

function metric(label, value, note, profit = false) {
  return `<div class="metric ${profit ? "profit" : ""}">
    <span class="metric-label">${escapeHtml(label)}</span>
    <strong class="metric-value">${escapeHtml(value)}</strong>
    <span class="metric-note">${escapeHtml(note)}</span>
  </div>`;
}

function projectCard(item) {
  const financials = calculateFinancials(item);
  const decision = personalizedDecision(item, state.settings);
  const photo = item.photos?.[0]?.dataUrl;
  const name = item.name || item.analysis?.suggestedName || "Unidentified find";
  const profitText = item.analysis ? `Conservative profit ${formatMoney(financials.expectedNetLow)}` : "Needs AI evaluation";
  return `<a class="project-card" href="#item/${encodeURIComponent(item.id)}">
    <div class="project-thumb">${photo ? `<img src="${safePhotoUrl(photo)}" alt="" />` : "?"}</div>
    <div class="project-body">
      <strong>${escapeHtml(name)}</strong>
      <span>${escapeHtml(item.source || "Unknown source")} · ${formatMoney(item.askingPrice)}</span>
      <span>${escapeHtml(item.stage || "Considering")} · ${escapeHtml(decision.verdict)}</span>
      <span class="project-money">${escapeHtml(profitText)}</span>
    </div>
    <span class="chevron" aria-hidden="true">›</span>
  </a>`;
}

function emptyState(icon, title, description) {
  return `<div class="empty-state"><span class="empty-icon" aria-hidden="true">${icon}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div>`;
}

function renderProjects() {
  const filters = [
    ["all", "All"],
    ["free", "Free"],
    ["under10", "Under $10"],
    ["under25", "Under $25"],
    ["under50", "Under $50"],
    ["profit", "Highest profit"],
    ["sold", "Sold"]
  ];
  let items = [...state.items];
  switch (state.projectFilter) {
    case "free": items = items.filter((item) => numberValue(item.askingPrice) === 0); break;
    case "under10": items = items.filter((item) => numberValue(item.askingPrice) <= 10); break;
    case "under25": items = items.filter((item) => numberValue(item.askingPrice) <= 25); break;
    case "under50": items = items.filter((item) => numberValue(item.askingPrice) <= 50); break;
    case "profit": items.sort((a, b) => calculateFinancials(b).expectedNetLow - calculateFinancials(a).expectedNetLow); break;
    case "sold": items = items.filter((item) => item.stage === "Sold"); break;
    default: break;
  }
  return `
    <div class="page-head"><p class="eyebrow">Saved locally</p><h1>Your projects</h1><p>Every find keeps its own photos, decision, expenses and ChatGPT history prompts.</p></div>
    <div class="filter-row" aria-label="Project filters">
      ${filters.map(([key, label]) => `<button class="filter-chip ${state.projectFilter === key ? "active" : ""}" data-action="set-filter" data-filter="${key}" type="button">${label}</button>`).join("")}
    </div>
    ${items.length ? `<div class="project-list">${items.map(projectCard).join("")}</div>` : emptyState("⌕", "No matching projects", "Choose another filter or evaluate a new find.")}
    <div style="height:16px"></div>
    <a class="primary-button button-wide" href="#evaluate">＋ Evaluate a Find</a>
  `;
}

function renderEvaluate() {
  return `
    <div class="page-head"><p class="eyebrow">New opportunity</p><h1>Evaluate a Find</h1><p>One photo and a price are enough to start. Add anything else you already know.</p></div>
    <form id="evaluate-form">
      <section class="form-section">
        <h2>1. Add the pictures</h2>
        <p class="form-intro">Screenshots work best for online listings. Add close-ups of labels or damage when available.</p>
        <div class="upload-grid">
          <label class="upload-button" for="camera-input"><span class="upload-icon">◉</span>Take a photo<input id="camera-input" data-photo-input="draft" type="file" accept="image/*" capture="environment" /></label>
          <label class="upload-button" for="gallery-input"><span class="upload-icon">▧</span>Upload screenshots<input id="gallery-input" data-photo-input="draft" type="file" accept="image/*" multiple /></label>
        </div>
        <p class="form-hint" style="margin-top:.7rem">Photos are compressed on your phone before being saved.</p>
        <div class="photo-preview-grid" id="draft-photo-grid">${renderDraftPhotos()}</div>
      </section>

      <section class="form-section">
        <h2>2. Price and source</h2>
        <p class="form-intro">Use $0 for a curbside pickup or free listing.</p>
        <div class="field-grid">
          <label class="field"><span>Asking price (CAD)</span><div class="price-wrap"><input name="askingPrice" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0" required /></div></label>
          <div class="field"><span>Where did you find it?</span><div class="chip-row" style="margin:0;padding:0 0 .2rem">${SOURCES.map((source, index) => `<label class="choice-chip"><input type="radio" name="source" value="${escapeHtml(source)}" ${index === 0 ? "checked" : ""} />${escapeHtml(source)}</label>`).join("")}</div></div>
          <label class="field"><span>Item or listing location</span><div class="input-with-action"><input name="location" placeholder="Town or pickup area" /><button class="voice-button" data-action="voice" data-field="location" type="button" aria-label="Speak location">🎙</button></div></label>
          <label class="field"><span>Listing link</span><input name="listingLink" type="url" inputmode="url" placeholder="Optional Facebook or Kijiji link" /></label>
        </div>
      </section>

      <section class="form-section">
        <h2>3. What do you know?</h2>
        <p class="form-intro">Leave anything unknown blank. AI must separate facts from guesses.</p>
        <div class="field-grid two-wide">
          <label class="field"><span>Your temporary item name</span><input name="name" placeholder="Example: old wooden box" /></label>
          <label class="field"><span>Dimensions</span><input name="dimensions" placeholder="Example: 24 × 18 × 36 in" /></label>
          <label class="field"><span>Brand</span><input name="brand" placeholder="If visible" /></label>
          <label class="field"><span>Model number</span><input name="model" placeholder="If visible" /></label>
        </div>
        <div class="field-grid" style="margin-top:13px">
          <label class="field"><span>Seller description</span><textarea name="sellerDescription" placeholder="Paste the listing description here"></textarea></label>
          <label class="field"><span>Condition notes</span><div class="input-with-action"><textarea name="conditionNotes" placeholder="What looks damaged, missing or uncertain?"></textarea><button class="voice-button" data-action="voice" data-field="conditionNotes" type="button" aria-label="Speak condition notes">🎙</button></div></label>
          <label class="field"><span>Your question</span><div class="input-with-action"><textarea name="question" placeholder="Is this worth buying? What should I check?"></textarea><button class="voice-button" data-action="voice" data-field="question" type="button" aria-label="Speak question">🎙</button></div></label>
        </div>
      </section>

      <div class="sticky-actions">
        <div class="button-row">
          <button class="secondary-button" type="submit" name="mode" value="draft">Save Draft</button>
          <button class="primary-button" type="submit" name="mode" value="analysis">Create AI Prompt</button>
        </div>
      </div>
    </form>
  `;
}

function renderDraftPhotos() {
  return state.draftPhotos.map((photo, index) => `<div class="photo-preview">
    <img src="${safePhotoUrl(photo.dataUrl)}" alt="Uploaded item photo ${index + 1}" />
    <button class="remove-photo" data-action="remove-draft-photo" data-photo-id="${escapeHtml(photo.id)}" type="button" aria-label="Remove photo">×</button>
  </div>`).join("");
}

function renderItem(id) {
  const item = state.items.find((candidate) => candidate.id === id);
  if (!item) {
    return `<div class="page-head"><p class="eyebrow">Not found</p><h1>That project is missing</h1><p>It may have been removed or restored under a different identifier.</p></div><a class="secondary-button" href="#projects">Back to projects</a>`;
  }

  const analysis = item.analysis;
  const financials = calculateFinancials(item);
  const decision = personalizedDecision(item, state.settings);
  const photo = item.photos?.[0]?.dataUrl;
  const name = item.name || analysis?.suggestedName || "Unidentified find";
  const link = safeWebUrl(item.listingLink);
  return `
    <section class="item-hero">
      ${photo ? `<img src="${safePhotoUrl(photo)}" alt="${escapeHtml(name)}" />` : ""}
      <div class="item-hero-content">
        <span class="status-pill">${escapeHtml(item.stage)}</span>
        <h1>${escapeHtml(name)}</h1>
        <div class="item-meta"><span>${escapeHtml(item.source)}</span><span>•</span><span>${formatMoney(item.askingPrice)} asking</span><span>•</span><span>${daysBetween(item.createdAt)} days saved</span></div>
      </div>
    </section>

    <section class="verdict-card ${decision.tone}">
      <span class="verdict-label">Your personal verdict</span>
      <strong>${escapeHtml(decision.verdict)}</strong>
      <p>${escapeHtml(decision.reason)}</p>
    </section>

    ${analysis ? renderAnalyzedSummary(item, analysis, financials) : renderAnalysisHandoff(item)}

    <section class="section-heading"><h2>Project numbers</h2></section>
    <div class="metric-grid">
      ${metric("Expected investment", formatMoney(financials.expectedInvestment), "Purchase + expected costs")}
      ${metric("Resale range", analysis ? `${formatMoney(financials.resaleLow)}–${formatMoney(financials.resaleHigh)}` : "—", "Conservative local estimate")}
      ${metric("Expected profit", analysis ? formatMoney(financials.expectedNetLow) : "—", "Based on low resale", true)}
      ${metric("Profit per hour", financials.expectedProfitPerHour === null ? "—" : formatMoney(financials.expectedProfitPerHour), `Your minimum is ${formatMoney(state.settings.minimumHourly)}`, true)}
    </div>

    <section class="card">
      <div class="card-head"><div><h2>Project details</h2><p>Update these as the flip moves forward.</p></div></div>
      <form id="project-form" data-item-id="${escapeHtml(item.id)}">
        <div class="field-grid two-wide">
          <label class="field"><span>Stage</span><select name="stage">${STAGES.map((stage) => `<option ${item.stage === stage ? "selected" : ""}>${escapeHtml(stage)}</option>`).join("")}</select></label>
          <label class="field"><span>Price actually paid</span><div class="price-wrap"><input name="purchasePrice" type="number" inputmode="decimal" min="0" step="0.01" value="${escapeHtml(item.purchasePrice)}" placeholder="Not purchased" /></div></label>
          <label class="field"><span>Time spent (hours)</span><input name="hoursSpent" type="number" inputmode="decimal" min="0" step="0.25" value="${escapeHtml(item.hoursSpent || "")}" placeholder="0" /></label>
          <label class="field"><span>Next action</span><input name="nextAction" value="${escapeHtml(item.nextAction || analysis?.nextStep || "")}" placeholder="What happens next?" /></label>
        </div>
        <label class="field" style="margin-top:13px"><span>Notes</span><textarea name="conditionNotes">${escapeHtml(item.conditionNotes || "")}</textarea></label>
        <button class="secondary-button button-wide" style="margin-top:12px" type="submit">Save Project Update</button>
      </form>
    </section>

    <section class="card">
      <div class="card-head"><div><h2>AI notes and history</h2><p>Paste useful ChatGPT answers here so future prompts remember them.</p></div></div>
      ${(item.aiHistory || []).length ? `<div>${[...(item.aiHistory || [])].reverse().map((entry) => `<div class="analysis-tier"><div class="card-head" style="margin-bottom:.35rem"><div><h3>${escapeHtml(entry.title || "ChatGPT answer")}</h3><p>${escapeHtml(new Date(entry.createdAt).toLocaleDateString("en-CA"))}</p></div><button class="mini-delete" data-action="remove-ai-note" data-item-id="${escapeHtml(item.id)}" data-note-id="${escapeHtml(entry.id)}" type="button" aria-label="Delete AI note">×</button></div><p>${escapeHtml(entry.response)}</p></div>`).join("")}</div>` : `<p>No answers saved yet. Your main imported evaluation is already stored separately.</p>`}
      <form id="ai-history-form" data-item-id="${escapeHtml(item.id)}" style="margin-top:13px">
        <label class="field"><span>Answer title</span><input name="title" placeholder="Example: Inspection checklist" /></label>
        <label class="field" style="margin-top:13px"><span>Paste ChatGPT answer or useful note</span><textarea name="response" required placeholder="Paste the useful answer here"></textarea></label>
        <button class="quiet-button button-wide" style="margin-top:12px" type="submit">Save to This Item</button>
      </form>
    </section>

    <section class="card">
      <div class="card-head"><div><h2>Photos</h2><p>Add inspection, repair or finished photographs.</p></div><label class="secondary-button" for="project-photo-input" style="min-height:40px;padding:.5rem .7rem">＋ Add<input id="project-photo-input" data-photo-input="project" data-item-id="${escapeHtml(item.id)}" type="file" accept="image/*" multiple class="sr-only" /></label></div>
      ${item.photos?.length ? `<div class="photo-gallery">${item.photos.map((entry, index) => `<div class="gallery-photo"><img src="${safePhotoUrl(entry.dataUrl)}" alt="Project photo ${index + 1}" /></div>`).join("")}</div>` : `<p>No photos saved.</p>`}
    </section>

    <section class="card">
      <div class="card-head"><div><h2>Expenses</h2><p>Fuel, cleaning, parts, fees or delivery.</p></div><strong>${formatMoney(financials.recordedExpenses)}</strong></div>
      ${(item.expenses || []).map((expense) => `<div class="expense-row"><span>${escapeHtml(expense.type)}<br><small>${escapeHtml(expense.note || "")}</small></span><strong>${formatMoney(expense.amount)}</strong><button class="mini-delete" data-action="remove-expense" data-item-id="${escapeHtml(item.id)}" data-expense-id="${escapeHtml(expense.id)}" type="button" aria-label="Delete expense">×</button></div>`).join("")}
      <form id="expense-form" data-item-id="${escapeHtml(item.id)}" style="margin-top:13px">
        <div class="field-grid two-wide">
          <label class="field"><span>Expense</span><select name="type"><option>Fuel</option><option>Cleaning supplies</option><option>Repair materials</option><option>Replacement parts</option><option>Platform fees</option><option>Delivery</option><option>Paid help</option><option>Other</option></select></label>
          <label class="field"><span>Amount</span><div class="price-wrap"><input name="amount" type="number" inputmode="decimal" min="0" step="0.01" required /></div></label>
        </div>
        <label class="field" style="margin-top:13px"><span>Optional note</span><input name="note" placeholder="What was it for?" /></label>
        <button class="quiet-button button-wide" style="margin-top:12px" type="submit">Add Expense</button>
      </form>
    </section>

    <section class="card">
      <div class="card-head"><div><h2>Final sale</h2><p>Complete this only after the item sells.</p></div></div>
      <form id="sale-form" data-item-id="${escapeHtml(item.id)}">
        <div class="field-grid two-wide">
          <label class="field"><span>Sale price</span><div class="price-wrap"><input name="salePrice" type="number" inputmode="decimal" min="0" step="0.01" value="${escapeHtml(item.salePrice || "")}" /></div></label>
          <label class="field"><span>Total hours</span><input name="hoursSpent" type="number" inputmode="decimal" min="0" step="0.25" value="${escapeHtml(item.hoursSpent || "")}" /></label>
        </div>
        ${financials.actualNet !== null ? `<div class="notice success" style="margin-top:12px">Actual cash profit: <strong>${formatMoney(financials.actualNet)}</strong> · ROI ${formatPercent(financials.actualRoi)}${financials.actualProfitPerHour !== null ? ` · ${formatMoney(financials.actualProfitPerHour)}/hour` : ""}</div>` : ""}
        <button class="secondary-button button-wide" style="margin-top:12px" type="submit">Record Sale</button>
      </form>
    </section>

    <section class="card">
      <div class="card-head"><div><h2>Original information</h2><p>What you saved when evaluating the find.</p></div></div>
      ${detailRow("Location", item.location || "Not provided")}
      ${detailRow("Dimensions", item.dimensions || "Not provided")}
      ${detailRow("Brand / model", [item.brand, item.model].filter(Boolean).join(" ") || "Not provided")}
      ${detailRow("Seller description", item.sellerDescription || "Not provided")}
      ${link ? `<a class="secondary-button button-wide" style="margin-top:12px" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">Open Original Listing</a>` : ""}
    </section>

    <button class="danger-button button-wide" data-action="delete-item" data-item-id="${escapeHtml(item.id)}" type="button">Delete This Project</button>
  `;
}

function renderAnalysisHandoff(item) {
  return `<section class="card">
    <div class="card-head"><div><h2>Run the free AI evaluation</h2><p>No API charge. Your item is already saved.</p></div></div>
    <ol class="steps"><li>Copy the custom evaluation prompt.</li><li>Open ChatGPT Plus and attach the same item photos.</li><li>Send it, copy the complete JSON answer, then return here.</li></ol>
    <button class="primary-button button-wide" data-action="analysis-prompt" data-item-id="${escapeHtml(item.id)}" type="button">1. Copy Evaluation Prompt</button>
    <form id="import-analysis-form" data-item-id="${escapeHtml(item.id)}" style="margin-top:15px">
      <label class="field"><span>2. Paste ChatGPT’s complete answer</span><textarea class="prompt-box" name="analysisResult" placeholder='{ "suggestedName": "..." }'></textarea></label>
      <button class="secondary-button button-wide" style="margin-top:11px" type="submit">Import Evaluation</button>
    </form>
  </section>`;
}

function renderAnalyzedSummary(item, analysis, financials) {
  return `
    <section class="card">
      <div class="card-head"><div><h2>Evaluation report</h2><p>${escapeHtml(analysis.summary || analysis.mainReason || "Evaluation imported from ChatGPT.")}</p></div><span class="confidence-pill">${escapeHtml(analysis.confidence)} confidence</span></div>
      ${detailRow("Opening offer", formatMoney(analysis.openingOffer))}
      ${detailRow("Maximum price", formatMoney(analysis.maxPurchasePrice))}
      ${detailRow("As-is resale", `${formatMoney(analysis.asIsLow)}–${formatMoney(analysis.asIsHigh)}`)}
      ${detailRow("Improved resale", `${formatMoney(analysis.improvedLow)}–${formatMoney(analysis.improvedHigh)}`)}
      ${detailRow("Expected time to sell", analysis.timeToSell || "Not estimated")}
      ${detailRow("Biggest risk", analysis.biggestRisk || "Not stated")}
      ${detailRow("Best strategy", analysis.bestStrategy || "Not stated")}
      ${detailRow("Next step", analysis.nextStep || "Not stated")}
      <button class="quiet-button button-wide" style="margin-top:12px" data-action="analysis-prompt" data-item-id="${escapeHtml(item.id)}" type="button">Run Evaluation Again</button>
    </section>

    <section class="card">
      <h2>What the photos suggest</h2>
      ${analysisTier("Clearly visible facts", analysis.visibleFacts, "Nothing was recorded as clearly visible.")}
      ${analysisTier("Likely possibilities", analysis.likelyPossibilities, "No possibilities were recorded.")}
      ${analysisTier("Must verify in person", analysis.verifyInPerson, "No in-person checks were recorded.")}
    </section>

    <section class="card">
      <div class="card-head"><div><h2>Ask about this item</h2><p>Each button makes a prompt containing this project’s saved information.</p></div></div>
      <div class="quick-action-grid">${QUICK_ACTIONS.map(([key, label]) => `<button class="quick-action" data-action="quick-prompt" data-prompt-action="${key}" data-item-id="${escapeHtml(item.id)}" type="button">${escapeHtml(label)}</button>`).join("")}</div>
    </section>
  `;
}

function analysisTier(title, entries, emptyText) {
  const list = Array.isArray(entries) ? entries : [];
  return `<div class="analysis-tier"><h3>${escapeHtml(title)}</h3>${list.length ? `<ul>${list.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")}</ul>` : `<p>${escapeHtml(emptyText)}</p>`}</div>`;
}

function detailRow(label, value) {
  return `<div class="detail-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderSettings() {
  const examplesExist = state.items.some((item) => item.isExample);
  return `
    <div class="page-head"><p class="eyebrow">Personal setup</p><h1>Settings</h1><p>These rules control every recommendation. Your full street address is not stored.</p></div>

    <section class="card">
      <div class="card-head"><div><h2>Your buying rules</h2><p>Balanced risk and conservative local pricing.</p></div></div>
      <form id="settings-form">
        <div class="field-grid two-wide">
          <label class="field"><span>Home area</span><input name="homeArea" value="${escapeHtml(state.settings.homeArea)}" /></label>
          <label class="field"><span>Local resale market</span><input name="marketRegion" value="${escapeHtml(state.settings.marketRegion)}" placeholder="Province, state or region" /></label>
          <label class="field"><span>Preferred areas</span><input name="preferredAreas" value="${escapeHtml(state.settings.preferredAreas)}" /></label>
          <label class="field"><span>Radius measured from</span><input name="radiusCentre" value="${escapeHtml(state.settings.radiusCentre)}" placeholder="Nearest city or home area" /></label>
          <label class="field"><span>Maximum search radius (km)</span><input name="radiusKm" type="number" inputmode="numeric" min="1" value="${escapeHtml(state.settings.radiusKm)}" /></label>
          <label class="field"><span>Vehicle</span><input name="vehicle" value="${escapeHtml(state.settings.vehicle)}" /></label>
          <label class="field"><span>Minimum profit</span><div class="price-wrap"><input name="minimumProfit" type="number" min="0" value="${escapeHtml(state.settings.minimumProfit)}" /></div></label>
          <label class="field"><span>Preferred profit</span><div class="price-wrap"><input name="targetProfit" type="number" min="0" value="${escapeHtml(state.settings.targetProfit)}" /></div></label>
          <label class="field"><span>Minimum hourly return</span><div class="price-wrap"><input name="minimumHourly" type="number" min="0" value="${escapeHtml(state.settings.minimumHourly)}" /></div></label>
          <label class="field"><span>Strong hourly return</span><div class="price-wrap"><input name="targetHourly" type="number" min="0" value="${escapeHtml(state.settings.targetHourly)}" /></div></label>
          <label class="field"><span>Maximum investment</span><div class="price-wrap"><input name="maxInvestment" type="number" min="0" value="${escapeHtml(state.settings.maxInvestment)}" /></div></label>
          <label class="field"><span>Risk level</span><select name="riskLevel"><option ${state.settings.riskLevel === "Conservative" ? "selected" : ""}>Conservative</option><option ${state.settings.riskLevel === "Balanced" ? "selected" : ""}>Balanced</option><option ${state.settings.riskLevel === "Aggressive" ? "selected" : ""}>Aggressive</option></select></label>
        </div>
        <button class="primary-button button-wide" style="margin-top:14px" type="submit">Save Settings</button>
      </form>
    </section>

    <section class="card">
      <div class="card-head"><div><h2>Backup and restore</h2><p>Your records normally exist only in this browser.</p></div></div>
      <div class="notice warn">Export a backup after important changes. Safari can remove local data if website data is cleared.</div>
      <div class="button-row" style="margin-top:13px">
        <button class="secondary-button" data-action="export-backup" type="button">Export Backup</button>
        <label class="quiet-button" for="backup-input">Import Backup<input id="backup-input" type="file" accept="application/json,.json" class="sr-only" /></label>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><div><h2>Privacy and cost</h2><p>No subscription and no paid API connection.</p></div></div>
      ${detailRow("Project storage", "On this device")}
      ${detailRow("AI connection", "Copy prompt to ChatGPT Plus")}
      ${detailRow("Automatic scraping", "Disabled")}
      ${detailRow("Publishing messages", "Never automatic")}
      <button class="secondary-button button-wide" style="margin-top:12px" data-action="install-help" type="button">iPhone Installation Instructions</button>
    </section>

    ${examplesExist ? `<section class="card"><h2>Example projects</h2><p>Remove the demonstration drill kit and bookcase when you no longer need them.</p><button class="danger-button button-wide" data-action="remove-examples" type="button">Remove Example Projects</button></section>` : ""}
  `;
}

function openPromptModal(title, prompt, photoCount = 0) {
  state.promptTitle = title;
  state.promptText = prompt;
  modalRoot.innerHTML = `<div class="modal-backdrop" data-action="close-modal">
    <section class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="prompt-title" data-modal-sheet>
      <div class="modal-handle"></div>
      <p class="eyebrow">Free ChatGPT handoff</p>
      <h2 id="prompt-title">${escapeHtml(title)}</h2>
      <ol class="steps"><li>Tap Copy Prompt below.</li><li>Open ChatGPT and attach the same ${photoCount || "item"} photo${photoCount === 1 ? "" : "s"} when the request depends on pictures.</li><li>Paste the prompt and send it.</li></ol>
      <label class="field"><span>Prepared prompt</span><textarea id="prompt-text" class="prompt-box" readonly>${escapeHtml(prompt)}</textarea></label>
      <div class="button-row" style="margin-top:12px">
        <button class="primary-button" data-action="copy-prompt" type="button">Copy Prompt</button>
        <button class="secondary-button" data-action="open-chatgpt" type="button">Open ChatGPT</button>
      </div>
      <button class="quiet-button button-wide" style="margin-top:10px" data-action="close-modal" type="button">Close</button>
    </section>
  </div>`;
}

function openInstallModal() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  modalRoot.innerHTML = `<div class="modal-backdrop" data-action="close-modal">
    <section class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="install-title" data-modal-sheet>
      <div class="modal-handle"></div>
      <p class="eyebrow">iPhone installation</p>
      <h2 id="install-title">${standalone ? "Flip Finder is installed" : "Add Flip Finder to your Home Screen"}</h2>
      ${standalone ? `<div class="notice success">You are using the installed app. It can open full-screen and keep working with cached files when your connection is poor.</div>` : `<ol class="steps"><li>Open the published Flip Finder link in <strong>Safari</strong>.</li><li>Tap Safari’s <strong>Share</strong> button.</li><li>Scroll and tap <strong>Add to Home Screen</strong>.</li><li>Keep the name Flip Finder, then tap <strong>Add</strong>.</li></ol>`}
      <div class="notice">For reliable storage, do not use Private Browsing. Export a backup regularly.</div>
      <button class="primary-button button-wide" style="margin-top:13px" data-action="close-modal" type="button">Done</button>
    </section>
  </div>`;
}

function closeModal() {
  modalRoot.innerHTML = "";
}

function showToast(message) {
  clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  state.toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function showLoading(message = "Working…") {
  document.body.insertAdjacentHTML("beforeend", `<div id="loading-overlay" class="loading-overlay"><div class="loading-box"><div class="spinner"></div><p>${escapeHtml(message)}</p></div></div>`);
}

function hideLoading() {
  document.querySelector("#loading-overlay")?.remove();
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function saveAndRefresh(item, message) {
  item.updatedAt = new Date().toISOString();
  await saveItem(item);
  const index = state.items.findIndex((candidate) => candidate.id === item.id);
  if (index >= 0) state.items[index] = item;
  else state.items.unshift(item);
  state.items = sortItems(state.items);
  render();
  if (message) showToast(message);
}

async function handleEvaluateSubmit(form, submitter) {
  const values = formValues(form);
  if (!state.draftPhotos.length && !String(values.sellerDescription || "").trim() && !String(values.listingLink || "").trim()) {
    showToast("Add at least one photo, a seller description or a listing link.");
    return;
  }
  const now = new Date().toISOString();
  const item = {
    id: createId(),
    name: values.name.trim(),
    category: "",
    source: values.source,
    askingPrice: numberValue(values.askingPrice),
    purchasePrice: "",
    location: values.location.trim(),
    listingLink: values.listingLink.trim(),
    sellerDescription: values.sellerDescription.trim(),
    brand: values.brand.trim(),
    model: values.model.trim(),
    dimensions: values.dimensions.trim(),
    conditionNotes: values.conditionNotes.trim(),
    question: values.question.trim(),
    stage: "Considering",
    nextAction: "Run the AI evaluation.",
    photos: [...state.draftPhotos],
    expenses: [],
    aiHistory: [],
    salePrice: "",
    hoursSpent: 0,
    createdAt: now,
    updatedAt: now
  };
  await saveItem(item);
  state.items = sortItems([item, ...state.items]);
  state.draftPhotos = [];
  navigate(`item/${encodeURIComponent(item.id)}`);
  if (submitter?.value === "analysis") {
    setTimeout(() => openPromptModal("Evaluate this find", buildAnalysisPrompt(item, state.settings), item.photos.length), 80);
  } else {
    showToast("Draft saved on this device.");
  }
}

async function importAnalysis(form) {
  const id = form.dataset.itemId;
  const item = state.items.find((candidate) => candidate.id === id);
  if (!item) return;
  try {
    const analysis = extractAnalysisJson(new FormData(form).get("analysisResult"));
    item.analysis = analysis;
    if (!item.name) item.name = analysis.suggestedName || "Unidentified find";
    item.category = analysis.category || item.category || "Unidentified";
    item.nextAction = analysis.nextStep || item.nextAction;
    item.aiHistory = item.aiHistory || [];
    await saveAndRefresh(item, "Evaluation imported and your personal verdict updated.");
  } catch (error) {
    showToast(error.message);
  }
}

async function processPhotoFiles(fileList, destination, itemId) {
  const files = [...fileList].filter((file) => file.type.startsWith("image/"));
  if (!files.length) return;
  const currentCount = destination === "draft"
    ? state.draftPhotos.length
    : state.items.find((item) => item.id === itemId)?.photos?.length || 0;
  const allowed = files.slice(0, Math.max(0, 10 - currentCount));
  if (!allowed.length) {
    showToast("A project can hold up to 10 compressed photos in this version.");
    return;
  }
  showLoading(`Preparing ${allowed.length} photo${allowed.length === 1 ? "" : "s"}…`);
  try {
    const photos = [];
    for (const file of allowed) {
      photos.push({ id: createId("photo"), name: file.name || "Item photo", dataUrl: await compressImage(file) });
    }
    if (destination === "draft") {
      state.draftPhotos.push(...photos);
      const grid = document.querySelector("#draft-photo-grid");
      if (grid) grid.innerHTML = renderDraftPhotos();
    } else {
      const item = state.items.find((candidate) => candidate.id === itemId);
      if (!item) return;
      item.photos = [...(item.photos || []), ...photos];
      await saveAndRefresh(item, "Photos added to this project.");
    }
  } catch (error) {
    showToast(error.message || "One of the images could not be prepared.");
  } finally {
    hideLoading();
  }
}

function compressImage(file, maxDimension = 1280, quality = 0.74) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: false });
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        URL.revokeObjectURL(objectUrl);
        resolve(dataUrl);
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`The image ${file.name || "selected"} could not be opened.`));
    };
    image.src = objectUrl;
  });
}

async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(state.promptText);
    showToast("Prompt copied. Open ChatGPT and attach the same item photos.");
  } catch {
    const box = document.querySelector("#prompt-text");
    box?.focus();
    box?.select();
    showToast("The prompt is selected. Tap Copy from the iPhone menu.");
  }
}

function openChatGPT() {
  window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
}

function startVoice(fieldName) {
  const field = document.querySelector(`[name="${CSS.escape(fieldName)}"]`);
  if (!field) return;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    field.focus();
    showToast("Tap the microphone on your iPhone keyboard to speak this answer.");
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = "en-CA";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    const spoken = event.results[0][0].transcript;
    field.value = field.value ? `${field.value} ${spoken}` : spoken;
    field.dispatchEvent(new Event("input", { bubbles: true }));
  };
  recognition.onerror = () => showToast("Voice input did not start. Use the iPhone keyboard microphone instead.");
  recognition.start();
}

function exportBackup() {
  const backup = {
    app: "Flip Finder AI",
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    items: state.items
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `flip-finder-backup-${date}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Backup created. Save it in the Files app or iCloud Drive.");
}

async function importBackup(file) {
  try {
    const backup = JSON.parse(await file.text());
    if (!backup || backup.app !== "Flip Finder AI" || !Array.isArray(backup.items)) {
      throw new Error("That is not a valid Flip Finder backup file.");
    }
    const confirmed = window.confirm(`Import ${backup.items.length} project${backup.items.length === 1 ? "" : "s"}? Projects with matching IDs will be updated.`);
    if (!confirmed) return;
    await saveManyItems(backup.items);
    if (backup.settings && typeof backup.settings === "object") {
      state.settings = { ...DEFAULT_SETTINGS, ...backup.settings };
      await saveSetting("profile", state.settings);
    }
    state.items = sortItems(await getAllItems());
    render();
    showToast("Backup imported successfully.");
  } catch (error) {
    showToast(error.message || "The backup could not be imported.");
  }
}

async function removeExamples() {
  if (!window.confirm("Remove the two demonstration projects? Your own projects will remain.")) return;
  for (const id of SAMPLE_IDS) await deleteStoredItem(id);
  state.items = state.items.filter((item) => !SAMPLE_IDS.has(item.id));
  render();
  showToast("Example projects removed.");
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;

  if (action === "close-modal") {
    if (event.target.closest("[data-modal-sheet]") && !button.matches("button")) return;
    closeModal();
    return;
  }

  if (action === "remove-draft-photo") {
    state.draftPhotos = state.draftPhotos.filter((photo) => photo.id !== button.dataset.photoId);
    document.querySelector("#draft-photo-grid").innerHTML = renderDraftPhotos();
  } else if (action === "set-filter") {
    state.projectFilter = button.dataset.filter;
    render();
  } else if (action === "analysis-prompt") {
    const item = state.items.find((candidate) => candidate.id === button.dataset.itemId);
    if (item) openPromptModal("Evaluate this find", buildAnalysisPrompt(item, state.settings), item.photos?.length || 0);
  } else if (action === "quick-prompt") {
    const item = state.items.find((candidate) => candidate.id === button.dataset.itemId);
    const label = QUICK_ACTIONS.find(([key]) => key === button.dataset.promptAction)?.[1] || "Ask about this item";
    if (item) openPromptModal(label, buildQuickActionPrompt(item, button.dataset.promptAction, state.settings), item.photos?.length || 0);
  } else if (action === "copy-prompt") {
    await copyPrompt();
  } else if (action === "open-chatgpt") {
    openChatGPT();
  } else if (action === "install-help") {
    openInstallModal();
  } else if (action === "voice") {
    startVoice(button.dataset.field);
  } else if (action === "export-backup") {
    exportBackup();
  } else if (action === "remove-examples") {
    await removeExamples();
  } else if (action === "remove-expense") {
    const item = state.items.find((candidate) => candidate.id === button.dataset.itemId);
    if (item) {
      item.expenses = (item.expenses || []).filter((expense) => expense.id !== button.dataset.expenseId);
      await saveAndRefresh(item, "Expense removed.");
    }
  } else if (action === "remove-ai-note") {
    const item = state.items.find((candidate) => candidate.id === button.dataset.itemId);
    if (item) {
      item.aiHistory = (item.aiHistory || []).filter((entry) => entry.id !== button.dataset.noteId);
      await saveAndRefresh(item, "AI note removed.");
    }
  } else if (action === "delete-item") {
    const item = state.items.find((candidate) => candidate.id === button.dataset.itemId);
    if (item && window.confirm(`Delete “${item.name || "this project"}”? This cannot be undone unless it exists in a backup.`)) {
      await deleteStoredItem(item.id);
      state.items = state.items.filter((candidate) => candidate.id !== item.id);
      navigate("projects");
      showToast("Project deleted.");
    }
  }
});

document.addEventListener("submit", async (event) => {
  const form = event.target;
  event.preventDefault();
  try {
    if (form.id === "evaluate-form") {
      await handleEvaluateSubmit(form, event.submitter);
    } else if (form.id === "import-analysis-form") {
      await importAnalysis(form);
    } else if (form.id === "project-form") {
      const item = state.items.find((candidate) => candidate.id === form.dataset.itemId);
      if (!item) return;
      const values = formValues(form);
      item.stage = values.stage;
      item.purchasePrice = values.purchasePrice === "" ? "" : numberValue(values.purchasePrice);
      item.hoursSpent = numberValue(values.hoursSpent);
      item.nextAction = values.nextAction.trim();
      item.conditionNotes = values.conditionNotes.trim();
      await saveAndRefresh(item, "Project updated.");
    } else if (form.id === "expense-form") {
      const item = state.items.find((candidate) => candidate.id === form.dataset.itemId);
      if (!item) return;
      const values = formValues(form);
      item.expenses = [...(item.expenses || []), { id: createId("expense"), type: values.type, amount: numberValue(values.amount), note: values.note.trim(), createdAt: new Date().toISOString() }];
      await saveAndRefresh(item, "Expense added.");
    } else if (form.id === "ai-history-form") {
      const item = state.items.find((candidate) => candidate.id === form.dataset.itemId);
      if (!item) return;
      const values = formValues(form);
      item.aiHistory = [...(item.aiHistory || []), {
        id: createId("ai-note"),
        title: values.title.trim() || "ChatGPT answer",
        response: values.response.trim(),
        createdAt: new Date().toISOString()
      }];
      await saveAndRefresh(item, "ChatGPT answer saved to this item.");
    } else if (form.id === "sale-form") {
      const item = state.items.find((candidate) => candidate.id === form.dataset.itemId);
      if (!item) return;
      const values = formValues(form);
      item.salePrice = values.salePrice === "" ? "" : numberValue(values.salePrice);
      item.hoursSpent = numberValue(values.hoursSpent);
      if (numberValue(item.salePrice) > 0) {
        item.stage = "Sold";
        item.soldAt = item.soldAt || new Date().toISOString();
      }
      await saveAndRefresh(item, "Sale information saved.");
    } else if (form.id === "settings-form") {
      const values = formValues(form);
      state.settings = {
        ...state.settings,
        homeArea: values.homeArea.trim(),
        marketRegion: values.marketRegion.trim(),
        preferredAreas: values.preferredAreas.trim(),
        radiusCentre: values.radiusCentre.trim(),
        radiusKm: numberValue(values.radiusKm, 50),
        vehicle: values.vehicle.trim(),
        minimumProfit: numberValue(values.minimumProfit, 30),
        targetProfit: numberValue(values.targetProfit, 50),
        minimumHourly: numberValue(values.minimumHourly, 20),
        targetHourly: numberValue(values.targetHourly, 30),
        maxInvestment: numberValue(values.maxInvestment, 100),
        riskLevel: values.riskLevel
      };
      await saveSetting("profile", state.settings);
      render();
      showToast("Your buying rules were saved.");
    }
  } catch (error) {
    showToast(error.message || "That change could not be saved.");
  }
});

document.addEventListener("change", async (event) => {
  const input = event.target;
  if (input.matches("[data-photo-input]")) {
    await processPhotoFiles(input.files, input.dataset.photoInput, input.dataset.itemId);
    input.value = "";
  } else if (input.id === "backup-input" && input.files?.[0]) {
    await importBackup(input.files[0]);
    input.value = "";
  }
});

window.addEventListener("hashchange", render);
window.addEventListener("offline", () => showToast("You are offline. Saved projects and calculations still work."));
window.addEventListener("online", () => showToast("Connection restored."));

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch {
    // The app still works online if service-worker installation is unavailable.
  }
}

initialize();
