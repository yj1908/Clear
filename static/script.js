const categories = ["Cleanser", "Toner", "Serum", "Moisturiser", "Sunscreen"];

let state = {
  profile: {}, profiles: [], products: [], inventory: [], saved: [],
  routine: [], usage: {}, used_today: [], journal: [], ingredient_kb: [], today: ""
};
let activeCategory = "All";
let openProductId = null;

// The active profile lives in this browser only, so two people on two devices
// can use different profiles at the same time.
const PROFILE_KEY = "clear.activeProfileId";
const AVATAR_COLOURS = ["#5f6c52", "#98694d", "#3f5143", "#86703f", "#8f6a65", "#587371", "#766470", "#8a6a3a"];

const SENSITIVITY_OPTIONS = {
  "Fragrance": "fragrance", "Alcohol (drying)": "alcohol", "Acids / exfoliants": "acid",
  "Retinoids": "retinoid", "Essential oils": "essential_oil", "Strong cleansers": "surfactant",
  "Sunscreen filters": "filters"
};
const CONCERN_OPTIONS = ["Acne / breakouts", "Dryness", "Oiliness", "Redness", "Dark spots", "Fine lines", "Rough texture", "Sensitivity"];
const JOURNAL_TAGS = ["Dry", "Tight", "Oily", "Breakouts", "Redness", "Irritated", "Calm", "Comfortable", "Glowy"];
const COMFORT_LABELS = ["", "Very uncomfortable", "Uncomfortable", "Okay", "Comfortable", "Very comfortable"];
const FREQUENCIES = {
  morning: ["Daily", "Most days", "A few times a week", "As needed"],
  evening: ["Daily", "Most days", "A few times a week", "As needed"],
  weekly: ["Once a week", "Twice a week", "Every other week", "As needed"]
};
const SLOT_LABELS = { morning: "Morning routine", evening: "Evening routine", weekly: "Weekly treatments" };

function getActiveProfileId() {
  try { return localStorage.getItem(PROFILE_KEY) || ""; } catch { return ""; }
}

function setActiveProfileId(id) {
  try {
    if (id === null || id === undefined) localStorage.removeItem(PROFILE_KEY);
    else localStorage.setItem(PROFILE_KEY, String(id));
  } catch { /* storage unavailable: server falls back to the first profile */ }
}

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Profile-Id": getActiveProfileId()
    }
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

// Multipart upload (journal photos): the browser sets the Content-Type boundary itself.
async function apiForm(url, formData) {
  const response = await fetch(url, {
    method: "POST",
    body: formData,
    headers: { "X-Profile-Id": getActiveProfileId() }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 2800);
}

function esc(value = "") {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function imagePath(filename) {
  if (!filename) return "";
  return `/static/images/${encodeURIComponent(filename)}`;
}

function productImage(filename, alt, extraClass = "") {
  if (!filename) {
    return `<div class="product-image-fallback"><span>✧</span><small>IMAGE COMING SOON</small></div>`;
  }

  return `<img
    src="${imagePath(filename)}"
    alt="${esc(alt)}"
    class="product-image ${extraClass}"
    loading="lazy"
    onerror="this.replaceWith(Object.assign(document.createElement('div'), {className:'product-image-fallback', innerHTML:'<span>✧</span><small>IMAGE UNAVAILABLE</small>'}))"
  >`;
}

/* ---------- Icons (one distinct icon per category) ---------- */
const ICON_ATTR = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const CATEGORY_ICONS = {
  // pump bottle with a foam drop
  Cleanser: `<svg ${ICON_ATTR}><rect x="7" y="10" width="10" height="11" rx="2"/><path d="M10 10V7h4v3M12 7V4h4"/><path d="M12 13.5c1 1.1 1.5 1.8 1.5 2.4a1.5 1.5 0 0 1-3 0c0-.6.5-1.3 1.5-2.4z"/></svg>`,
  // tall bottle with a liquid line
  Toner: `<svg ${ICON_ATTR}><path d="M10 3h4v3h-4z"/><path d="M10 6c0 2-3 3-3 6v7a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-7c0-3-3-4-3-6"/><path d="M8 14c1.3 1 2.7-1 4 0s2.7 1 4 0"/></svg>`,
  // dropper
  Serum: `<svg ${ICON_ATTR}><path d="M10 3.5a2 2 0 0 1 4 0V7h-4z"/><path d="M8.5 7h7M9 7v3h6V7"/><rect x="8" y="10" width="8" height="11" rx="2"/><path d="M12 14c.9 1 1.4 1.7 1.4 2.3a1.4 1.4 0 0 1-2.8 0c0-.6.5-1.3 1.4-2.3z"/></svg>`,
  // jar
  Moisturiser: `<svg ${ICON_ATTR}><rect x="4" y="5" width="16" height="4" rx="1.5"/><path d="M5 9v8a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V9"/><path d="M9 14.5c1 .8 2 .8 3 0s2-.8 3 0"/></svg>`,
  // sun
  Sunscreen: `<svg ${ICON_ATTR}><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/></svg>`
};
const FALLBACK_ICON = `<svg ${ICON_ATTR}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>`;

function categoryIcon(category) { return CATEGORY_ICONS[category] || FALLBACK_ICON; }

function heartIcon(filled) {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/></svg>`;
}

const COMPARE_ICON = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg>`;

/* ---------- Ingredient knowledge & parsing ---------- */
const norm = (value = "") => String(value).toLowerCase().replace(/[().*†‡]/g, " ").replace(/\s+/g, " ").trim();

function splitList(text) {
  // Splits on commas, semicolons and new lines, but not inside brackets.
  const parts = [];
  let depth = 0, current = "";
  for (const character of String(text || "")) {
    if (character === "(" || character === "[") depth++;
    if (character === ")" || character === "]") depth = Math.max(0, depth - 1);
    if (depth === 0 && /[,;\n]/.test(character)) { parts.push(current); current = ""; }
    else current += character;
  }
  parts.push(current);
  return parts.map(part => part.trim()).filter(Boolean);
}

let kbIndex = null;
function buildKbIndex() {
  kbIndex = [];
  state.ingredient_kb.forEach(entry => entry.names.forEach(name => kbIndex.push({ name: norm(name), entry })));
  kbIndex.sort((a, b) => b.name.length - a.name.length); // longest name wins
}

function findKbEntry(token) {
  if (!kbIndex) buildKbIndex();
  const text = norm(token);
  if (!text) return null;
  for (const { name, entry } of kbIndex) {
    if (text === name) return entry;
  }
  for (const { name, entry } of kbIndex) {
    if (name.length >= 7 && (text.startsWith(name + " ") || text.includes(" " + name) || text.includes(name))) return entry;
  }
  return null;
}

function parseIngredients(text) {
  return splitList(text).map((raw, index) => ({ raw, index, text: norm(raw), entry: findKbEntry(raw) }));
}

/* ---------- Merged product / shelf-item data ---------- */
const productById = (id) => state.products.find(product => product.id === id);

function itemData(item) {
  const product = item.product_id ? productById(item.product_id) : null;
  return {
    kind: "shelf",
    id: item.id,
    name: item.product_name,
    brand: item.brand || product?.brand || "",
    category: item.category || product?.category || "",
    ingredients: (item.ingredients || product?.ingredients || "").trim(),
    price: item.price || product?.price || "",
    size: item.size || product?.size || "",
    pao: Number(item.pao_months) || Number(product?.pao_months) || 0,
    intended_use: product?.intended_use || "",
    evidence_status: product?.evidence_status || "",
    limitations: product?.limitations || "",
    image: product?.image_filename || "",
    product
  };
}

function productData(product) {
  return {
    kind: "library", id: product.id, name: product.product_name, brand: product.brand,
    category: product.category, ingredients: (product.ingredients || "").trim(),
    price: product.price, size: product.size, pao: Number(product.pao_months) || 0,
    intended_use: product.intended_use, evidence_status: product.evidence_status,
    limitations: product.limitations, image: product.image_filename, product
  };
}

const shelfItemFor = (productId) => state.inventory.find(item => item.product_id === productId);
const isOnShelf = (productId) => Boolean(shelfItemFor(productId));

/* ---------- Price per unit ---------- */
function parseAmount(text) {
  const match = String(text || "").replace(/,/g, "").match(/([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number(match[1]) : null;
}

function parseSize(text) {
  const match = String(text || "").toLowerCase().replace(/,/g, "").match(/([0-9]+(?:\.[0-9]+)?)\s*(fl\.?\s*oz|ml|l|g|kg)\b/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].replace(/[.\s]/g, "");
  if (unit === "ml") return { amount, unit: "ml" };
  if (unit === "l") return { amount: amount * 1000, unit: "ml" };
  if (unit === "floz") return { amount: amount * 29.5735, unit: "ml" };
  if (unit === "g") return { amount, unit: "g" };
  if (unit === "kg") return { amount: amount * 1000, unit: "g" };
  return null;
}

function currencyOf(priceText) {
  const match = String(priceText || "").match(/^[^0-9]*/);
  const symbol = match ? match[0].trim() : "";
  return symbol || "S$";
}

// Returns per-100 (always, so products compare fairly) and per-10 (for small sizes).
function unitPrice(price, size) {
  const amount = parseAmount(price);
  const parsed = parseSize(size);
  if (!amount || amount <= 0 || !parsed || parsed.amount <= 0) return null;
  const per100 = amount / parsed.amount * 100;
  const symbol = currencyOf(price);
  return {
    per100, per10: per100 / 10, unit: parsed.unit, symbol,
    sizeAmount: parsed.amount,
    small: parsed.amount <= 60,
    text100: `${symbol}${per100.toFixed(2)} / 100 ${parsed.unit}`,
    text10: `${symbol}${(per100 / 10).toFixed(2)} / 10 ${parsed.unit}`
  };
}

function unitPriceLabel(data) {
  const unit = unitPrice(data.price, data.size);
  if (!unit) return null;
  return unit.small ? `${unit.text10} (${unit.text100})` : unit.text100;
}

/* ---------- Allergy & irritation checks ----------
   Three separate outcomes, deliberately never mixed together:
   - confirmed: an ingredient on the label matches something the person listed as an allergy
   - related:   same ingredient family as an allergy (possible, not confirmed)
   - irritation: a general irritation note for a listed sensitivity (not an allergy, not a prediction)
   CLEAR never states that two products are incompatible because of what they contain. */
const GROUP_KEYS = new Set([
  "linalool", "essential_oils", "propolis", "mugwort", "organic_filters", "peptides", "ceramides",
  "centella", "almond", "coconut", "sls", "retinol", "ascorbic", "rice", "alcohol_denat"
]);

const SENSITIVITY_WORDS = [
  [/fragrance|perfume|scent|parfum/, "fragrance"], [/alcohol/, "alcohol"],
  [/acid|exfoliant|\baha\b|\bbha\b|peel/, "acid"], [/retin/, "retinoid"],
  [/essential oil/, "essential_oil"], [/surfactant|sulfate|strong cleanser|foaming/, "surfactant"],
  [/filter|sunscreen/, "filters"]
];

function sensitivityTags(profile) {
  const tags = new Set();
  splitList(profile.sensitivities).forEach(token => {
    const exact = Object.entries(SENSITIVITY_OPTIONS).find(([label]) => norm(label) === norm(token));
    if (exact) { tags.add(exact[1]); return; }
    SENSITIVITY_WORDS.forEach(([pattern, tag]) => { if (pattern.test(norm(token))) tags.add(tag); });
  });
  return tags;
}

const TAG_LABELS = {
  fragrance: "fragrance", alcohol: "drying alcohols", acid: "acids / exfoliants", retinoid: "retinoids",
  essential_oil: "essential oils", surfactant: "strong cleansing agents", filters: "sunscreen filters", actives: "active ingredients"
};

function checkAlerts(ingredientsText, profile = state.profile) {
  const terms = splitList(profile.allergies).map(norm).filter(term => term.length >= 3);
  const tags = sensitivityTags(profile);
  const parsed = parseIngredients(ingredientsText);
  const result = { status: "clear", confirmed: [], related: [], irritation: [], terms, tags, count: parsed.length };

  if (!parsed.length) { result.status = "no-data"; return result; }
  if (!terms.length && !tags.size) { result.status = "no-profile"; return result; }

  const seen = new Set();
  const push = (list, key, item) => { if (!seen.has(key)) { seen.add(key); list.push(item); } };

  terms.forEach(term => {
    const generic = term === "alcohol" || term === "alcohols";
    const termEntry = generic ? state.ingredient_kb.find(e => e.key === "alcohol_denat") : findKbEntry(term);

    parsed.forEach(ing => {
      const textMatch = !generic && (ing.text === term || ing.text.includes(term));
      const sameEntry = termEntry && ing.entry === termEntry;

      if (textMatch || (sameEntry && (generic || !GROUP_KEYS.has(termEntry.key)))) {
        push(result.confirmed, `c|${term}|${ing.index}`, { term, ingredient: ing.raw });
        return;
      }
      if (sameEntry) {
        push(result.related, `r|${term}|${ing.index}`, { term, ingredient: ing.raw, why: `same ingredient group as "${term}"` });
        return;
      }
      if (!ing.entry) return;
      const families = ing.entry.families || [];
      const familyHit = families.find(family => family === term || (term.length >= 4 && (family.includes(term) || term.includes(family))));
      const sharedFamily = termEntry && families.some(family => (termEntry.families || []).includes(family));
      if (familyHit || sharedFamily) {
        const family = familyHit || families.find(f => (termEntry.families || []).includes(f));
        push(result.related, `r|${term}|${ing.index}`, { term, ingredient: ing.raw, why: `belongs to the ${family} family, like "${term}"` });
      }
    });
  });

  parsed.forEach(ing => {
    if (!ing.entry) return;
    ing.entry.irritation.forEach(tag => {
      if (tags.has(tag)) push(result.irritation, `i|${tag}|${ing.index}`, { tag, ingredient: ing.raw, entry: ing.entry });
    });
  });

  result.status = result.confirmed.length ? "confirmed" : result.related.length ? "related" : result.irritation.length ? "irritation" : "clear";
  return result;
}

const alertsFor = (data) => checkAlerts(data.ingredients);

/* ---------- Roles: what a product is doing, for the necessity checker ---------- */
const ROLE_RULES = [
  [/UV filter/i, "sun protection"], [/exfoliant|keratolytic/i, "exfoliation"],
  [/brighten|pigment/i, "brightening"], [/cell turnover|retinol-alternative/i, "retinoid-type renewal"],
  [/antioxidant/i, "antioxidant"], [/barrier|skin-identical|lipid/i, "barrier support"],
  [/humectant/i, "hydration"], [/emollient|occlusive/i, "softening / moisturising"],
  [/surfactant/i, "cleansing"], [/soothing/i, "soothing"], [/multi-purpose|anti-wrinkle|signalling|acne/i, "targeted active"]
];
const CATEGORY_ROLE = { Cleanser: "cleansing", Sunscreen: "sun protection", Moisturiser: "softening / moisturising", Toner: "hydration" };

function ingredientRoles(data) {
  const roles = new Set();
  parseIngredients(data.ingredients).forEach(ing => {
    if (!ing.entry) return;
    ROLE_RULES.forEach(([pattern, role]) => { if (pattern.test(ing.entry.function)) roles.add(role); });
  });
  return roles;
}

function rolesFor(data) {
  const roles = ingredientRoles(data);
  if (CATEGORY_ROLE[data.category]) roles.add(CATEGORY_ROLE[data.category]);
  return roles;
}

const sentence = (items) => items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : (items[0] || "");

function analyseNecessity(data) {
  const shelf = state.inventory.map(itemData).filter(item => !(data.kind === "library" && item.product?.id === data.id));
  const myRoles = rolesFor(data);
  const myIngredientRoles = ingredientRoles(data);
  const hasData = parseIngredients(data.ingredients).length > 0;
  const out = { similar: [], different: [], redundancy: [], price: [], shelfCount: shelf.length, hasData };

  // 1. Do I already own something with a similar purpose?
  shelf.forEach(item => {
    const shared = [...ingredientRoles(item)].filter(role => myIngredientRoles.has(role));
    const sameCategory = item.category && item.category === data.category;
    if (sameCategory || shared.length >= 2) {
      const reasons = [];
      if (sameCategory) reasons.push(`also a ${data.category.toLowerCase()}`);
      if (shared.length) reasons.push(`shares ${sentence(shared)}`);
      out.similar.push(`${item.name}${item.brand ? ` (${item.brand})` : ""} — ${reasons.join("; ")}`);
    }
  });

  // 2. Does it add a different function?
  if (hasData) {
    const covered = new Set();
    let unknownItems = 0;
    shelf.forEach(item => {
      if (!item.ingredients) { unknownItems++; return; }
      rolesFor(item).forEach(role => covered.add(role));
    });
    const fresh = [...myRoles].filter(role => !covered.has(role));
    out.different = fresh.length
      ? [`Compared with products that have ingredient data, this appears to add: ${sentence(fresh)}.`]
      : [shelf.length ? "Its main functions look covered by products you already have." : "Your shelf is empty, so everything it does would be new."];
    if (unknownItems) out.different.push(`${unknownItems} shelf product${unknownItems > 1 ? "s have" : " has"} no ingredient list, so CLEAR can't see what they do.`);
  } else {
    out.different = ["Add this product's ingredient list to see which functions it brings."];
  }

  // 3. Is it redundant with my routine?
  const sameCategoryItems = shelf.filter(item => item.category && item.category === data.category);
  if (!sameCategoryItems.length) {
    out.redundancy = [`You don't own another ${(data.category || "product").toLowerCase()} yet.`];
  } else {
    sameCategoryItems.forEach(item => {
      if (!hasData || !item.ingredients) {
        out.redundancy.push(`${item.name}: same category, but ingredient data is missing on one side, so overlap can't be judged.`);
        return;
      }
      const itemRoles = rolesFor(item);
      const missing = [...myRoles].filter(role => !itemRoles.has(role));
      out.redundancy.push(missing.length
        ? `${item.name}: same category, but this one also offers ${sentence(missing)}.`
        : `${item.name}: appears to do much the same job. That may be fine (a backup, a different texture or a better fit) but it is worth deciding on purpose.`);
    });
  }

  // 4. Is the price justified by what it offers?
  const mine = unitPrice(data.price, data.size);
  if (!mine) {
    out.price.push("Add price and size to see a price per 100 ml/g.");
  } else {
    out.price.push(`This costs ${unitPriceLabel(data)}.`);
    const comparisons = [];
    sameCategoryItems.forEach(item => {
      const theirs = unitPrice(item.price, item.size);
      if (theirs && theirs.unit === mine.unit) comparisons.push({ label: `${item.name} (yours)`, value: theirs.per100 });
    });
    state.products.filter(other => other.category === data.category && other.id !== data.id && other.product_name).forEach(other => {
      const theirs = unitPrice(other.price, other.size);
      if (theirs && theirs.unit === mine.unit && !comparisons.some(c => c.label.startsWith(other.product_name))) {
        comparisons.push({ label: other.product_name, value: theirs.per100 });
      }
    });
    comparisons.forEach(({ label, value }) => {
      const diff = (mine.per100 - value) / value * 100;
      const phrase = Math.abs(diff) < 3 ? "about the same" : `${Math.abs(diff).toFixed(0)}% ${diff > 0 ? "more" : "less"} per 100 ${mine.unit}`;
      out.price.push(`${label}: ${mine.symbol}${value.toFixed(2)} / 100 ${mine.unit} — ${phrase}.`);
    });
    if (!comparisons.length) out.price.push(`No other ${(data.category || "").toLowerCase()} with price and size recorded to compare against.`);
  }
  if (hasData) {
    const supported = parseIngredients(data.ingredients).filter(ing => ing.entry && ["Well supported", "Some support"].includes(ing.entry.level));
    const names = [...new Set(supported.map(ing => ing.entry.label))].slice(0, 5);
    out.price.push(names.length
      ? `Ingredients with some research behind them: ${sentence(names)}. Price alone doesn't show effectiveness, and a longer ingredient list isn't automatically better.`
      : "Few ingredients here have strong research behind them in CLEAR's glossary. Price alone doesn't show effectiveness.");
  }
  return out;
}

/* ---------- Expiry (period after opening) ---------- */
function addMonths(isoDate, months) {
  const date = new Date(`${isoDate}T00:00:00`);
  const day = date.getDate();
  date.setMonth(date.getMonth() + months);
  if (date.getDate() !== day) date.setDate(0); // e.g. 31 Aug + 6 months -> end of Feb
  return date;
}

function expiryInfo(item) {
  const data = itemData(item);
  if (!item.opened_on) return { status: "untracked", data };
  if (!data.pao) return { status: "no-pao", data };
  const due = addMonths(item.opened_on, data.pao);
  const today = new Date(`${state.today}T00:00:00`);
  const days = Math.round((due - today) / 86400000);
  const status = days < 0 ? "over" : days <= 30 ? "soon" : "ok";
  return { status, days, due, data };
}

const formatDate = (date) => (date instanceof Date ? date : new Date(`${date}T00:00:00`))
  .toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });

function expiryText(info) {
  if (info.status === "over") return `Past its recommended use period by ${Math.abs(info.days)} day${Math.abs(info.days) === 1 ? "" : "s"} (was ${formatDate(info.due)})`;
  if (info.status === "soon") return info.days === 0 ? `Recommended use period ends today` : `${info.days} day${info.days === 1 ? "" : "s"} left (until ${formatDate(info.due)})`;
  if (info.status === "ok") return `Use within ${formatDate(info.due)}`;
  if (info.status === "no-pao") return "Opened date saved — add the period-after-opening (months)";
  return "Opened date not recorded";
}

const expiryAlerts = () => state.inventory.map(item => ({ item, info: expiryInfo(item) })).filter(({ info }) => info.status === "soon" || info.status === "over");

/* ---------- Navigation ---------- */
function showPage(name, tab) {
  $$(".page").forEach(page => page.classList.toggle("active", page.id === `${name}Page`));
  $$(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.page === name));
  if (name === "add") showSkinTab(tab || currentSkinTab);
  window.scrollTo({ top: 0, behavior: "smooth" });
  closeDropdowns();
}

let currentSkinTab = "shelf";
function showSkinTab(tab) {
  currentSkinTab = tab;
  $$("#skinTabs .tab").forEach(button => {
    const active = button.dataset.tab === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  $$(".tab-panel").forEach(panel => panel.classList.toggle("active", panel.id === `tab-${tab}`));
}

function closeDropdowns() {
  $("#menuDropdown").classList.add("hidden");
  $("#menuButton").setAttribute("aria-expanded", "false");
  $("#profileDropdown").classList.add("hidden");
  $("#profileButton").setAttribute("aria-expanded", "false");
}

function openModal(id) {
  closeDropdowns();
  $(`#${id}`).classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeModals() {
  $$(".modal-backdrop").forEach(modal => modal.classList.add("hidden"));
  document.body.classList.remove("modal-open");
  openProductId = null;
}

async function load() {
  state = await api("/api/bootstrap");
  kbIndex = null;
  // The server resolves stale or missing ids to a real profile; keep the browser in sync.
  setActiveProfileId(state.active_profile_id);
  renderAll();
}

function renderAll() {
  renderProfileSwitcher();
  renderProfilesPage();
  renderHome();
  renderExplore();
  renderInventory();
  renderRoutine();
  renderExpiry();
  renderJournal();
  renderProfile();
  renderSaved();
  if (openProductId) renderProductModal(openProductId, true);
}

const hasMultipleProfiles = () => state.profiles.length > 1;
const profileName = () => state.profile.name || "Me";

function avatarColour(id) {
  return AVATAR_COLOURS[(Number(id) - 1) % AVATAR_COLOURS.length];
}

function avatarHtml(profile, size = "") {
  const initial = Array.from(profile.name || "?")[0];
  return `<span class="avatar ${size}" style="--avatar:${avatarColour(profile.id)}" aria-hidden="true">${esc(initial)}</span>`;
}

function renderProfileSwitcher() {
  const active = state.profile;
  $("#chipAvatar").textContent = Array.from(active.name || "?")[0];
  $("#chipAvatar").style.setProperty("--avatar", avatarColour(active.id));
  $("#chipName").textContent = active.name;
  $("#profileButton").setAttribute("aria-label", `Active profile: ${active.name}. Switch profile`);

  const canAdd = state.profiles.length < (state.max_profiles || 8);
  $("#profileDropdown").innerHTML = `
    <p class="dropdown-label">SWITCH PROFILE</p>
    ${state.profiles.map(profile => `
      <button type="button" class="profile-option ${profile.id === active.id ? "active" : ""}" data-switch-profile="${profile.id}">
        ${avatarHtml(profile)}
        <span class="po-name">${esc(profile.name)}</span>
        ${profile.id === active.id ? `<span class="po-check" aria-hidden="true">✓</span>` : ""}
      </button>
    `).join("")}
    <div class="dropdown-sep"></div>
    ${canAdd ? `<button type="button" data-modal="newProfileModal">Add a profile <span>＋</span></button>` : ""}
    <button type="button" data-manage-profiles>Manage profiles <span>→</span></button>
  `;
}

function renderProfilesPage() {
  const max = state.max_profiles || 8;
  $("#profileCount").textContent = `${state.profiles.length} OF ${max}`;
  $("#profileList").innerHTML = state.profiles.map(profile => {
    const isActive = profile.id === state.profile.id;
    return `
      <button type="button" class="profile-row ${isActive ? "active" : ""}" data-switch-profile="${profile.id}" ${isActive ? 'aria-current="true"' : ""}>
        ${avatarHtml(profile, "lg")}
        <span class="profile-row-copy">
          <strong>${esc(profile.name)}</strong>
          <small>${esc(profile.skin_type || "Skin type not set")}</small>
        </span>
        ${isActive ? `<span class="soft-tag">ACTIVE</span>` : `<span class="text-link">Switch →</span>`}
      </button>
    `;
  }).join("");
  $("#addProfileButton").classList.toggle("hidden", state.profiles.length >= max);
  $("#deleteProfileButton").classList.toggle("hidden", !hasMultipleProfiles());
}

async function switchProfile(id) {
  closeDropdowns();
  if (String(id) === String(state.profile.id)) return;
  setActiveProfileId(id);
  $("#quizResult").textContent = "";
  cancelCompare();
  await load();
  toast(`Switched to ${profileName()}.`);
}

/* ---------- Home ---------- */
function renderHome() {
  $("#homeCategories").innerHTML = categories.map((category, index) => `
    <button class="category-card" data-category="${esc(category)}">
      <span class="category-icon">${categoryIcon(category)}</span>
      <span class="category-number">0${index + 1} / CATEGORY</span>
      <strong>${esc(category)}</strong>
      <small>Explore products <span aria-hidden="true">→</span></small>
    </button>
  `).join("");

  $("#homeGreeting").innerHTML = hasMultipleProfiles()
    ? `Hey ${esc(profileName())},<br><em>let's get clear.</em> ✦`
    : `Hey there,<br><em>let's get clear.</em> ✦`;
  $("#homeProfileEyebrow").textContent = hasMultipleProfiles()
    ? `${profileName().toUpperCase()}'S SKIN PROFILE`
    : "YOUR SKIN PROFILE";
  $("#homeSkinType").textContent = state.profile.skin_type || "Not set up yet";

  const allergyCount = splitList(state.profile.allergies).length;
  const details = [
    allergyCount ? `${allergyCount} allergy ${allergyCount === 1 ? "entry" : "entries"}` : "No allergies listed",
    state.profile.sensitivities ? "Sensitivities added" : "No sensitivities",
    state.profile.skin_concerns || state.profile.skin_conditions ? "Concerns added" : "No concerns"
  ];
  $("#homeProfileMeta").textContent = details.join(" · ");

  const alerts = expiryAlerts();
  $("#homeReminders").innerHTML = alerts.length ? `
    <section class="reminder-card" role="status">
      <div class="reminder-icon" aria-hidden="true">⏳</div>
      <div class="reminder-copy">
        <p class="eyebrow">PRODUCT EXPIRY</p>
        <h3>${alerts.length} product${alerts.length > 1 ? "s" : ""} near or past the recommended use period</h3>
        <p class="muted">${alerts.slice(0, 3).map(({ item, info }) => `${esc(item.product_name)} — ${esc(expiryText(info))}`).join("<br>")}</p>
      </div>
      <button class="text-link" data-page="add" data-tab="expiry">Review →</button>
    </section>
  ` : "";
}

/* ---------- Explore & cards ---------- */
function renderFilters() {
  $("#categoryFilters").innerHTML = ["All", ...categories].map(category => `
    <button
      class="filter-chip ${activeCategory === category ? "active" : ""}"
      data-filter="${esc(category)}"
    >${esc(category)}</button>
  `).join("");
}

function cardBadges(product) {
  const alerts = alertsFor(productData(product));
  if (alerts.status === "confirmed") return `<span class="badge badge-alert" title="An ingredient matches an allergy on this profile">⚠ Allergy match</span>`;
  if (alerts.status === "related") return `<span class="badge badge-warn" title="Related to an allergy on this profile; not a confirmed match">Check: related ingredient</span>`;
  return "";
}

function productCard(product) {
  const saved = state.saved.includes(product.id);
  const onShelf = isOnShelf(product.id);
  const selected = compare.ids.includes(product.id);
  return `
    <article class="product-card ${selected ? "selected" : ""}" data-product="${product.id}">
      <div class="product-card-top">
        <span class="product-category"><span class="cat-icon">${categoryIcon(product.category)}</span>${esc(product.category)}</span>
        <span class="card-tools">
          <button class="tool-button ${selected ? "on" : ""}" type="button" data-action="compare-toggle" data-id="${product.id}" aria-label="Compare ${esc(product.product_name)}" aria-pressed="${selected}" title="Compare">${COMPARE_ICON}</button>
          <button class="tool-button heart ${saved ? "on" : ""}" type="button" data-action="toggle-save" data-id="${product.id}" aria-label="${saved ? "Remove" : "Save"} ${esc(product.product_name)}" aria-pressed="${saved}" title="${saved ? "Saved" : "Save"}">${heartIcon(saved)}</button>
        </span>
      </div>

      <div class="product-image-container">
        ${productImage(product.image_filename, product.product_name)}
      </div>

      <div class="product-card-copy">
        <h3>${esc(product.product_name)}</h3>
        <p>${esc(product.brand || "Brand not specified")}</p>
        ${cardBadges(product)}
      </div>

      <div class="product-card-actions">
        <button class="view-product-button" type="button" data-action="view" data-id="${product.id}">
          View details <span aria-hidden="true">↗</span>
        </button>
        <button class="add-shelf-button ${onShelf ? "on-shelf" : ""}" type="button" data-action="add-shelf" data-id="${product.id}" aria-pressed="${onShelf}" aria-label="${onShelf ? `${esc(product.product_name)} is on your shelf` : `Add ${esc(product.product_name)} to my shelf`}">
          ${onShelf ? "✓ On shelf" : "+ Shelf"}
        </button>
      </div>
    </article>
  `;
}

function renderExplore() {
  renderFilters();

  const query = ($("#searchInput")?.value || "").trim().toLowerCase();

  const visible = state.products.filter(product => {
    const matchesCategory = activeCategory === "All" || product.category === activeCategory;
    const searchable = `${product.product_name} ${product.brand} ${product.category}`.toLowerCase();
    return matchesCategory && searchable.includes(query);
  });

  $("#productGrid").innerHTML = visible.length
    ? visible.map(productCard).join("")
    : `<div class="empty-state">No products match your search yet.</div>`;
}

function renderSaved() {
  const savedProducts = state.products.filter(product =>
    state.saved.includes(product.id) && product.product_name
  );

  $("#savedGrid").innerHTML = savedProducts.length
    ? savedProducts.map(productCard).join("")
    : `<div class="empty-state">Nothing saved yet. Tap the heart on a product to save it to your shortlist.</div>`;
}

const rerenderCards = () => { renderExplore(); renderSaved(); };

const pending = new Set(); // guards against double-taps while a request is in flight
async function guarded(key, task) {
  if (pending.has(key)) return;
  pending.add(key);
  try { await task(); } finally { pending.delete(key); }
}

async function toggleSaved(productId) {
  await guarded(`save-${productId}`, async () => {
    const result = await api(`/api/saved/${productId}`, { method: "POST" });
    state.saved = result.saved
      ? [...new Set([...state.saved, productId])]
      : state.saved.filter(id => id !== productId);
    rerenderCards();
    if (openProductId === productId) renderProductModal(productId, true);
    toast(result.saved ? "Saved to your shortlist" : "Removed from saved");
  });
}

async function addProductToShelf(productId) {
  const product = productById(productId);
  if (!product) return;
  if (isOnShelf(productId)) {
    toast("Already on your shelf. You can remove it in My skin → Shelf.");
    return;
  }
  await guarded(`shelf-${productId}`, async () => {
    const result = await api("/api/inventory", { method: "POST", body: JSON.stringify({ product_id: productId }) });
    await load();
    toast(result.already
      ? `${product.product_name} is already on your shelf.`
      : `${product.product_name} added to ${hasMultipleProfiles() ? `${profileName()}'s` : "your"} shelf.`);
  });
}

/* ---------- Shelf ---------- */
function renderInventory() {
  const routineBySlot = {};
  state.routine.forEach(entry => { (routineBySlot[entry.inventory_id] ||= []).push(entry.slot); });

  $("#inventoryList").innerHTML = state.inventory.length
    ? state.inventory.map(item => {
      const data = itemData(item);
      const alerts = alertsFor(data);
      const info = expiryInfo(item);
      const slots = (routineBySlot[item.id] || []).map(slot => slot[0].toUpperCase() + slot.slice(1));
      return `
      <div class="inventory-item">
        <div class="inventory-item-copy">
          <strong>${esc(item.product_name)}</strong>
          <small>${esc(item.brand)} ${item.category ? `· ${esc(item.category)}` : ""}</small>
          <span class="badge-row">
            ${alerts.status === "confirmed" ? `<span class="badge badge-alert">⚠ Allergy match</span>` : ""}
            ${alerts.status === "related" ? `<span class="badge badge-warn">Related ingredient</span>` : ""}
            ${slots.length ? `<span class="badge badge-soft">${esc(slots.join(" · "))}</span>` : ""}
            ${info.status === "over" ? `<span class="badge badge-alert">Past use period</span>` : info.status === "soon" ? `<span class="badge badge-warn">Use period ending</span>` : ""}
          </span>
          ${item.notes ? `<small class="inventory-notes">${esc(item.notes)}</small>` : ""}
        </div>
        <div class="item-actions">
          <button class="text-link" type="button" data-action="shelf-details" data-id="${item.id}">Details</button>
          <button class="delete-button" data-action="remove-shelf" data-id="${item.id}" aria-label="Remove ${esc(item.product_name)}">×</button>
        </div>
      </div>`;
    }).join("")
    : `<div class="empty-state">Your skincare shelf is empty. Add products from Explore or enter one above.</div>`;
}

async function removeInventory(id) {
  await api(`/api/inventory/${id}`, { method: "DELETE" });
  await load();
  toast("Removed from your shelf.");
}

function openShelfItem(id) {
  const item = state.inventory.find(entry => entry.id === id);
  if (!item) return;
  const data = itemData(item);
  $("#shelfItemTitle").textContent = item.product_name;
  $("#shelfItemResult").textContent = "";
  $("#shelfItemForm").dataset.id = id;
  $("#shelfItemForm").innerHTML = `
    <div class="two-col">
      <label>Date opened<input type="date" name="opened_on" value="${esc(item.opened_on || "")}" max="${esc(state.today)}"></label>
      <label>Period after opening (months)<input type="number" name="pao_months" min="1" max="60" value="${item.pao_months || ""}" placeholder="${data.product?.pao_months ? esc(String(data.product.pao_months)) : "e.g. 12"}"></label>
    </div>
    <p class="helper">Look for the open-jar symbol on the pack, e.g. "12M". If you leave it blank and the library has a value for this product, that is used.</p>
    <div class="two-col">
      <label>Price<input name="price" value="${esc(item.price || "")}" placeholder="${esc(data.product?.price || "e.g. S$22")}"></label>
      <label>Size<input name="size" value="${esc(item.size || "")}" placeholder="${esc(data.product?.size || "e.g. 150 ml")}"></label>
    </div>
    ${item.product_id ? "" : `<label>Ingredient list<textarea name="ingredients" rows="3" placeholder="Paste from the packaging, separated by commas">${esc(item.ingredients || "")}</textarea></label>`}
    <label>Notes<textarea name="notes" rows="2">${esc(item.notes || "")}</textarea></label>
    <button class="primary-button" type="submit">Save details</button>
  `;
  openModal("shelfItemModal");
}

/* ---------- Routine ---------- */
function renderRoutine() {
  if (!state.inventory.length) {
    $("#routineBoard").innerHTML = `<div class="empty-state">Add products to your shelf first, then arrange them into routines here.</div>`;
    return;
  }

  $("#routineBoard").innerHTML = Object.keys(SLOT_LABELS).map(slot => {
    const entries = state.routine.filter(entry => entry.slot === slot);
    const inSlot = new Set(entries.map(entry => entry.inventory_id));
    const available = state.inventory.filter(item => !inSlot.has(item.id));
    return `
      <section class="form-card routine-card">
        <div class="form-heading"><h2>${SLOT_LABELS[slot]}</h2><span class="soft-tag">${entries.length} PRODUCT${entries.length === 1 ? "" : "S"}</span></div>
        ${entries.length ? entries.map(entry => {
          const item = state.inventory.find(candidate => candidate.id === entry.inventory_id);
          if (!item) return "";
          const usage = state.usage[item.id];
          const usedToday = state.used_today.includes(item.id);
          const options = [...new Set([...FREQUENCIES[slot], entry.frequency])];
          return `
            <div class="routine-item">
              <div class="routine-copy">
                <strong>${esc(item.product_name)}</strong>
                <small>${esc(item.category || "Product")} · ${usage ? `used ${usage.uses_30d}× in the last 30 days` : "no uses logged yet"}</small>
              </div>
              <select class="freq-select" data-routine-frequency="${entry.id}" aria-label="How often: ${esc(item.product_name)}">
                ${options.map(option => `<option ${option === entry.frequency ? "selected" : ""}>${esc(option)}</option>`).join("")}
              </select>
              <button type="button" class="use-button ${usedToday ? "on" : ""}" data-action="use-today" data-id="${item.id}" aria-pressed="${usedToday}">${usedToday ? "✓ Used today" : "Log use today"}</button>
              <button class="delete-button" type="button" data-action="routine-remove" data-id="${entry.id}" aria-label="Remove ${esc(item.product_name)} from ${SLOT_LABELS[slot].toLowerCase()}">×</button>
            </div>`;
        }).join("") : `<p class="helper">Nothing here yet.</p>`}
        ${available.length ? `
          <div class="routine-add">
            <select data-routine-select="${slot}" aria-label="Add a product to ${SLOT_LABELS[slot].toLowerCase()}">
              <option value="">Add a product…</option>
              ${available.map(item => `<option value="${item.id}">${esc(item.product_name)}</option>`).join("")}
            </select>
          </div>` : ""}
      </section>`;
  }).join("");
}

/* ---------- Expiry ---------- */
function renderExpiry() {
  const order = { over: 0, soon: 1, ok: 2, "no-pao": 3, untracked: 4 };
  const rows = state.inventory.map(item => ({ item, info: expiryInfo(item) }))
    .sort((a, b) => order[a.info.status] - order[b.info.status] || (a.info.days ?? 9999) - (b.info.days ?? 9999));

  const badge = $("#expiryBadge");
  const count = expiryAlerts().length;
  badge.textContent = count;
  badge.classList.toggle("hidden", !count);

  const labels = { over: "Past use period", soon: "Ending soon", ok: "In use period", "no-pao": "Needs PAO", untracked: "Not tracked" };
  $("#expiryList").innerHTML = rows.length ? rows.map(({ item, info }) => `
    <div class="inventory-item expiry-${info.status}">
      <div class="inventory-item-copy">
        <strong>${esc(item.product_name)}</strong>
        <small>${esc(expiryText(info))}</small>
        ${item.opened_on ? `<small class="inventory-notes">Opened ${esc(formatDate(item.opened_on))}${info.data.pao ? ` · ${info.data.pao}M after opening` : ""}</small>` : ""}
      </div>
      <div class="item-actions">
        <span class="badge ${info.status === "over" ? "badge-alert" : info.status === "soon" ? "badge-warn" : "badge-soft"}">${labels[info.status]}</span>
        ${item.opened_on ? "" : `<button class="text-link" type="button" data-action="opened-today" data-id="${item.id}">Opened today</button>`}
        <button class="text-link" type="button" data-action="shelf-details" data-id="${item.id}">${item.opened_on ? "Edit" : "Set date"}</button>
      </div>
    </div>
  `).join("") : `<div class="empty-state">Add products to your shelf to track when they were opened.</div>`;
}

let expiryToastShown = false;
function announceExpiry() {
  if (expiryToastShown) return;
  expiryToastShown = true;
  const alerts = expiryAlerts();
  if (alerts.length) toast(`${alerts.length} product${alerts.length > 1 ? "s are" : " is"} near or past the recommended use period.`);
}

/* ---------- Journal ---------- */
function setupJournalForm() {
  $("#comfortRow").innerHTML = [1, 2, 3, 4, 5].map(value => `
    <label class="comfort-option"><input type="radio" name="comfort" value="${value}"><span><b>${value}</b><small>${COMFORT_LABELS[value]}</small></span></label>
  `).join("");
  $("#journalTags").innerHTML = JOURNAL_TAGS.map(tag => `
    <label class="chip"><input type="checkbox" value="${esc(tag)}"><span>${esc(tag)}</span></label>
  `).join("");
}

function renderJournal() {
  const form = $("#journalForm");
  if (!form.entry_date.value) form.entry_date.value = state.today;
  form.entry_date.max = state.today;

  const entries = state.journal;
  const rated = entries.filter(entry => entry.comfort > 0).slice().reverse(); // oldest first
  let trend = "";
  if (rated.length >= 2) {
    const width = 320, height = 64, pad = 8;
    const points = rated.map((entry, index) => {
      const x = pad + (width - pad * 2) * index / (rated.length - 1);
      const y = height - pad - (height - pad * 2) * (entry.comfort - 1) / 4;
      return [x, y];
    });
    trend = `
      <div class="trend-card">
        <div class="trend-head"><strong>Comfort over time</strong><small>${esc(formatDate(rated[0].entry_date))} → ${esc(formatDate(rated[rated.length - 1].entry_date))}</small></div>
        <svg viewBox="0 0 ${width} ${height}" class="sparkline" role="img" aria-label="Comfort ratings over time, from 1 to 5">
          <polyline points="${points.map(point => point.join(",")).join(" ")}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
          ${points.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.2" fill="currentColor"/>`).join("")}
        </svg>
        <p class="helper">A rough trend from your own ratings (1 = very uncomfortable, 5 = very comfortable). Many things change skin, from weather to sleep, so a change that follows a new product isn't proof it caused it.</p>
      </div>`;
  }
  $("#journalTrend").innerHTML = trend;

  $("#journalList").innerHTML = entries.length ? entries.map(entry => `
    <article class="journal-entry">
      ${entry.photo_filename ? `<a href="/uploads/${encodeURIComponent(entry.photo_filename)}" target="_blank" rel="noopener" class="journal-photo"><img src="/uploads/${encodeURIComponent(entry.photo_filename)}" alt="Skin photo from ${esc(formatDate(entry.entry_date))}" loading="lazy"></a>` : ""}
      <div class="journal-body">
        <div class="journal-head">
          <strong>${esc(formatDate(entry.entry_date))}</strong>
          ${entry.comfort ? `<span class="badge badge-soft">${entry.comfort}/5 · ${esc(COMFORT_LABELS[entry.comfort])}</span>` : ""}
          <button class="delete-button" type="button" data-action="journal-delete" data-id="${entry.id}" aria-label="Delete entry from ${esc(formatDate(entry.entry_date))}">×</button>
        </div>
        ${entry.tags ? `<span class="badge-row">${entry.tags.split(",").filter(Boolean).map(tag => `<span class="badge badge-soft">${esc(tag.trim())}</span>`).join("")}</span>` : ""}
        ${entry.notes ? `<p>${esc(entry.notes)}</p>` : ""}
        ${entry.routine_snapshot ? `<details class="snapshot"><summary>Routine at the time</summary><p>${esc(entry.routine_snapshot).replace(/; /g, "<br>")}</p></details>` : ""}
      </div>
    </article>
  `).join("") : `<div class="empty-state">No entries yet. Add one above to start tracking how your skin changes.</div>`;
}

// Resize photos in the browser first: keeps the journal light and uploads fast.
async function resizePhoto(file, maxSide = 1200) {
  if (!file || !file.size) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.84));
    return blob ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file; // the server still validates type and size
  }
}

/* ---------- Profile ---------- */
function chipHtml(name, label, checked) {
  return `<label class="chip"><input type="checkbox" name="${name}" value="${esc(label)}" ${checked ? "checked" : ""}><span>${esc(label)}</span></label>`;
}

function splitChips(text, options) {
  const chosen = new Set(), extra = [];
  splitList(text).forEach(token => {
    const match = options.find(option => norm(option) === norm(token));
    if (match) chosen.add(match); else extra.push(token);
  });
  return { chosen, extra: extra.join(", ") };
}

function renderProfile() {
  const form = $("#profileForm");
  form.name.value = state.profile.name || "";
  $("#profileFormTitle").textContent = hasMultipleProfiles() ? `Skin details · ${profileName()}` : "Skin details";
  form.skin_type.value = state.profile.skin_type || "";
  form.allergies.value = state.profile.allergies || "";
  form.skin_conditions.value = state.profile.skin_conditions || "";
  form.routine_notes.value = state.profile.routine_notes || "";

  const sens = splitChips(state.profile.sensitivities, Object.keys(SENSITIVITY_OPTIONS));
  $("#sensitivityChips").innerHTML = Object.keys(SENSITIVITY_OPTIONS).map(label => chipHtml("sens", label, sens.chosen.has(label))).join("");
  $("#sensitivitiesExtra").value = sens.extra;

  const concerns = splitChips(state.profile.skin_concerns, CONCERN_OPTIONS);
  $("#concernChips").innerHTML = CONCERN_OPTIONS.map(label => chipHtml("concern", label, concerns.chosen.has(label))).join("");
  $("#concernsExtra").value = concerns.extra;
}

/* ---------- Product modal ---------- */
const alertWho = () => (hasMultipleProfiles() ? `${esc(profileName())}'s` : "your");

function alertsSection(data) {
  const alerts = alertsFor(data);
  let body = "";

  if (alerts.status === "no-data") {
    body = `<p>The ingredient list hasn't been entered for this product, so CLEAR can't check it against ${alertWho()} allergies.
      ${data.kind === "library" ? `<button type="button" class="text-link" data-action="edit-product" data-id="${data.id}">Add the ingredient list →</button>` : ""}</p>`;
  } else if (alerts.status === "no-profile") {
    body = `<p>No allergies or sensitivities are saved on ${alertWho()} profile yet, so there is nothing to check against.
      <button type="button" class="text-link" data-page="profile">Add them →</button></p>`;
  } else {
    if (alerts.confirmed.length) {
      const byTerm = {};
      alerts.confirmed.forEach(hit => (byTerm[hit.term] ||= []).push(hit.ingredient));
      body += `<div class="alert alert-confirmed"><strong>⚠ Allergy match</strong>${Object.entries(byTerm).map(([term, list]) =>
        `<p>This product lists <b>${esc(list.join(", "))}</b>, which matches “${esc(term)}” on ${alertWho()} allergy list.</p>`).join("")}
        <p class="alert-foot">Please check the packaging and, if the allergy is diagnosed, ask your doctor or pharmacist.</p></div>`;
    }
    if (alerts.related.length) {
      body += `<div class="alert alert-related"><strong>Possible related ingredient · not a confirmed match</strong>${alerts.related.map(hit =>
        `<p><b>${esc(hit.ingredient)}</b> ${esc(hit.why)}.</p>`).join("")}</div>`;
    }
    if (alerts.irritation.length) {
      const byTag = {};
      alerts.irritation.forEach(hit => (byTag[hit.tag] ||= []).push(hit.ingredient));
      body += `<div class="alert alert-note"><strong>General irritation note</strong>${Object.entries(byTag).map(([tag, list]) =>
        `<p><b>${esc(list.join(", "))}</b> — commonly flagged for ${esc(TAG_LABELS[tag] || tag)}, which you listed as a sensitivity.</p>`).join("")}
        <p class="alert-foot">This is a general note about the ingredient, not an allergy match and not a prediction of how this product will feel on your skin.</p></div>`;
    }
    if (alerts.status === "clear") {
      body += `<p>No ingredient matches ${alertWho()} listed allergies or sensitivities.</p>`;
    }
    body += `<p class="helper">This checks the ingredient list entered in CLEAR only. Fragrance listings don't reveal individual components, and formulas change, so always check the current packaging.</p>`;
  }
  return `<section class="detail-section"><h3>Allergy &amp; irritation check</h3>${body}</section>`;
}

function ingredientBreakdown(data) {
  const parsed = parseIngredients(data.ingredients);
  const editButton = data.kind === "library"
    ? ` <button type="button" class="text-link" data-action="edit-product" data-id="${data.id}">${parsed.length ? "Edit ingredient list" : "Add the ingredient list →"}</button>` : "";
  if (!parsed.length) {
    return `<section class="detail-section"><h3>Ingredient breakdown</h3><p>Not yet entered — paste the ingredient list from the packaging to see what each ingredient does.${editButton}</p></section>`;
  }

  const alerts = alertsFor(data);
  const flagged = new Set(alerts.confirmed.map(hit => norm(hit.ingredient)));
  const groups = new Map();
  const unknown = [];
  parsed.forEach(ing => {
    if (!ing.entry) { unknown.push(ing.raw); return; }
    if (!groups.has(ing.entry.key)) groups.set(ing.entry.key, { entry: ing.entry, raws: [] });
    groups.get(ing.entry.key).raws.push(ing.raw);
  });

  const cards = [...groups.values()].map(({ entry, raws }) => `
    <details class="ing-card">
      <summary>
        <span class="ing-name">${esc(entry.label)}</span>
        ${raws.some(raw => flagged.has(norm(raw))) ? `<span class="badge badge-alert">⚠ Allergy match</span>` : ""}
        <span class="badge badge-soft">${esc(entry.level)}</span>
      </summary>
      <dl class="ing-body">
        <dt>What it does</dt><dd>${esc(entry.does)}</dd>
        <dt>Intended function</dt><dd>${esc(entry.function)}</dd>
        <dt>Limitations</dt><dd>${esc(entry.limits)}</dd>
        <dt>Potential concerns</dt><dd>${esc(entry.concerns)}</dd>
        <dt>What the research supports</dt><dd><b>${esc(entry.level)}.</b> ${esc(entry.evidence)}</dd>
        <dt>Listed on this label as</dt><dd>${esc(raws.join(", "))}</dd>
      </dl>
    </details>`).join("");

  return `
    <section class="detail-section">
      <h3>Ingredient breakdown</h3>
      <p>${parsed.length} ingredients listed · ${[...groups.values()].reduce((sum, g) => sum + g.raws.length, 0)} explained below.${editButton}</p>
      <p class="helper">Labels list ingredients from highest to lowest amount (below 1% the order can be mixed). Plain-language notes only; the finished formula, concentration and your own skin all change the outcome.</p>
      <div class="ing-list">${cards}</div>
      ${unknown.length ? `<p class="helper">Not in CLEAR's glossary yet: ${esc(unknown.join(", "))}</p>` : ""}
    </section>`;
}

function necessitySection(data) {
  const result = analyseNecessity(data);
  const list = (items) => items.map(line => `<li>${esc(line)}</li>`).join("");
  return `
    <section class="detail-section">
      <h3>Purchase necessity</h3>
      <p class="helper">These notes are here to help you think, not to tell you what to buy. Overlap can be fine: a backup, a different texture or a better fit are all good reasons.</p>
      ${result.shelfCount ? "" : `<p class="detail-spaced">Your shelf is empty, so there is nothing to compare against yet. <button type="button" class="text-link" data-page="add" data-tab="shelf">Add what you own →</button></p>`}
      <div class="necessity">
        <div><h4>Do I already own something similar?</h4>${result.similar.length ? `<ul>${list(result.similar)}</ul>` : `<p>Nothing on your shelf stands out as similar.</p>`}</div>
        <div><h4>Does it add a different function?</h4><ul>${list(result.different)}</ul></div>
        <div><h4>Is it redundant with my routine?</h4><ul>${list(result.redundancy)}</ul></div>
        <div><h4>Is the price justified by what it offers?</h4><ul>${list(result.price)}</ul></div>
      </div>
    </section>`;
}

function economicSection(data) {
  const unit = unitPrice(data.price, data.size);
  const others = state.products
    .filter(other => other.category === data.category && other.id !== data.id && other.product_name)
    .map(other => `<p><b>${esc(other.product_name)}</b> — ${esc(unitPriceLabel(productData(other)) || "Unit price not available")}</p>`).join("");
  return `
    <section class="detail-section">
      <h3>Economic value</h3>
      <div class="detail-grid">
        <p><b>Listed price</b><br>${esc(data.price || "Not entered")}</p>
        <p><b>Product size</b><br>${esc(data.size || "Not entered")}</p>
        <p><b>Price per unit</b><br>${unit
          ? `${esc(unit.text100)}${unit.small ? `<br>${esc(unit.text10)}` : ""}`
          : "Not enough price/size data"}</p>
      </div>
      ${data.pao ? `<p class="detail-spaced"><b>Period after opening</b><br>${data.pao} months</p>` : ""}
      <div class="comparison-copy"><b>Same category, price per unit</b>${others || `<p>No other ${esc((data.category || "").toLowerCase())} products in the library.</p>`}</div>
    </section>`;
}

function renderProductModal(id, keepScroll = false) {
  const product = productById(id);
  if (!product) return;
  const modal = $("#productModal .modal");
  const scroll = keepScroll ? modal.scrollTop : 0;
  openProductId = id;
  const data = productData(product);
  const saved = state.saved.includes(id);
  const onShelf = isOnShelf(id);

  const fields = [
    ["Safety & cautions", "hazards", "cautions", "Known hazards", "Relevant cautions"],
    ["Limitations", "limitations", null, "Limitations", null],
    ["Claim substantiation", "marketing_claims", "evidence_summary", "Marketing claims", "Evidence assessment"],
    ["Evidence status & sources", "evidence_status", "evidence_sources", "Evidence status", "Sources / references"],
    ["Intended use & notes", "intended_use", "notes", "Intended use", "Notes"]
  ];
  const placeholder = "Not yet assessed — product data can be added here.";
  const content = fields.map(([title, firstKey, secondKey, firstLabel, secondLabel]) => `
    <section class="detail-section">
      <h3>${title}</h3>
      <div class="detail-grid">
        <div><p><b>${firstLabel}</b><br>${esc(product[firstKey] || placeholder)}</p></div>
        ${secondKey ? `<div><p><b>${secondLabel}</b><br>${esc(product[secondKey] || placeholder)}</p></div>` : ""}
      </div>
    </section>`).join("");

  $("#productDetail").innerHTML = `
    <div class="detail-hero">
      <div class="detail-image-wrap">${productImage(product.image_filename, product.product_name, "detail-image")}</div>
      <div class="detail-head">
        <p class="eyebrow">${esc(product.category)} / PRODUCT REVIEW</p>
        <h2>${esc(product.product_name || "Product template")}</h2>
        <p class="detail-brand">${esc(product.brand || "Brand not specified")} ${product.size ? `· ${esc(product.size)}` : ""}</p>
        <div class="detail-actions">
          <button class="save-button ${saved ? "on" : ""}" type="button" data-action="toggle-save" data-id="${id}" aria-pressed="${saved}">${heartIcon(saved)} ${saved ? "Saved" : "Save product"}</button>
          <button class="detail-add-button ${onShelf ? "on-shelf" : ""}" type="button" data-action="add-shelf" data-id="${id}" aria-pressed="${onShelf}">${onShelf ? "✓ On shelf" : "+ Add to my shelf"}</button>
        </div>
        <div class="detail-actions secondary">
          <button class="text-link" type="button" data-action="compare-start" data-id="${id}">${COMPARE_ICON} Compare with another</button>
          <button class="text-link" type="button" data-action="compare-shelf-product" data-id="${id}">Compare with my shelf</button>
          <button class="text-link" type="button" data-action="edit-product" data-id="${id}">Edit product data</button>
        </div>
      </div>
    </div>
    ${alertsSection(data)}
    ${ingredientBreakdown(data)}
    ${content}
    ${economicSection(data)}
    ${necessitySection(data)}
  `;
  openModal("productModal");
  modal.scrollTop = scroll;
}

/* ---------- Edit product data ---------- */
const PRODUCT_FIELDS = [
  ["ingredients", "Ingredient list", "textarea", "Paste the ingredient list from the packaging, separated by commas"],
  ["size", "Size", "input", "e.g. 150 ml"], ["price", "Price", "input", "e.g. S$22"],
  ["pao_months", "Period after opening (months)", "number", "e.g. 12"],
  ["intended_use", "Intended use", "textarea", "What the brand says it is for"],
  ["hazards", "Known hazards", "textarea", ""], ["cautions", "Relevant cautions", "textarea", ""],
  ["limitations", "Limitations", "textarea", ""], ["marketing_claims", "Marketing claims", "textarea", ""],
  ["evidence_summary", "Evidence assessment", "textarea", ""], ["evidence_status", "Evidence status", "input", ""],
  ["evidence_sources", "Sources / references", "textarea", ""], ["notes", "Notes", "textarea", ""]
];

function openEditProduct(id) {
  const product = productById(id);
  if (!product) return;
  $("#editProductTitle").textContent = product.product_name;
  $("#editProductResult").textContent = "";
  $("#editProductForm").dataset.id = id;
  $("#editProductForm").innerHTML = PRODUCT_FIELDS.map(([key, label, type, hint]) => {
    const value = product[key] ?? "";
    if (type === "textarea") return `<label>${label}<textarea name="${key}" rows="${key === "ingredients" ? 4 : 2}" placeholder="${esc(hint)}">${esc(value)}</textarea></label>`;
    return `<label>${label}<input name="${key}" ${type === "number" ? 'type="number" min="0" max="60"' : ""} value="${esc(value || "")}" placeholder="${esc(hint)}"></label>`;
  }).join("") + `<button class="primary-button" type="submit">Save product data</button>`;
  openModal("editProductModal");
}

/* ---------- Compare ---------- */
const compare = { ids: [] };

function startCompare(id) {
  if (!compare.ids.includes(id)) {
    if (compare.ids.length >= 3) { toast("You can compare up to 3 products."); return; }
    compare.ids.push(id);
  }
  updateCompareUI();
}

function toggleCompare(id) {
  if (compare.ids.includes(id)) { compare.ids = compare.ids.filter(other => other !== id); updateCompareUI(); }
  else startCompare(id);
}

function cancelCompare() {
  if (!compare.ids.length) return;
  compare.ids = [];
  updateCompareUI();
}

function updateCompareUI() {
  const tray = $("#compareTray");
  const count = compare.ids.length;
  tray.classList.toggle("hidden", !count);
  document.body.classList.toggle("comparing", count > 0);
  if (count === 1) {
    tray.innerHTML = `<span>1 selected — choose another product (up to 3)</span>
      <button type="button" class="outline-button" data-action="compare-shelf">Compare with my shelf</button>
      <button type="button" class="outline-button" data-action="compare-cancel">Cancel</button>`;
  } else if (count > 1) {
    tray.innerHTML = `<span>${count} selected</span>
      <button type="button" class="pill-button" data-action="compare-run">Compare</button>
      <button type="button" class="outline-button" data-action="compare-cancel">Cancel</button>`;
  }
  rerenderCards();
}

function shelfAlternatives(product) {
  return state.inventory
    .filter(item => item.product_id !== product.id)
    .map(itemData)
    .filter(item => item.category === product.category);
}

function runCompare(ids = compare.ids, fromShelf = false) {
  const products = ids.map(productById).filter(Boolean);
  if (!products.length) return;
  let columns = products.map(productData);
  let title = "Side by side";
  let note = "";
  if (fromShelf) {
    const mine = shelfAlternatives(products[0]);
    columns = [...columns, ...mine];
    title = `${products[0].product_name} vs my shelf`;
    note = mine.length ? "" : `You don't have another ${products[0].category.toLowerCase()} on your shelf yet.`;
  }
  showCompare(columns, title, note);
}

function compareCell(column, row) {
  const missing = `<span class="muted-cell">Not entered</span>`;
  switch (row) {
    case "Category": return esc(column.category || "—");
    case "Price": return column.price ? esc(column.price) : missing;
    case "Size": return column.size ? esc(column.size) : missing;
    case "Intended use": return column.intended_use ? esc(column.intended_use) : missing;
    case "Period after opening": return column.pao ? `${column.pao} months` : missing;
    case "Evidence status": return column.evidence_status ? esc(column.evidence_status) : missing;
    case "Limitations": return column.limitations ? esc(column.limitations) : missing;
    default: return "";
  }
}

function showCompare(columns, title, note = "") {
  const units = columns.map(column => unitPrice(column.price, column.size));
  const comparable = units.filter(unit => unit && unit.unit === units.find(Boolean)?.unit);
  const lowest = comparable.length > 1 ? Math.min(...comparable.map(unit => unit.per100)) : null;

  const ingredientSets = columns.map(column => new Set(parseIngredients(column.ingredients).map(ing => ing.text)));
  const withData = columns.map((column, index) => ingredientSets[index].size > 0);

  const alertCell = (column) => {
    const alerts = alertsFor(column);
    if (alerts.status === "no-data") return `<span class="muted-cell">Ingredients not entered</span>`;
    if (alerts.status === "no-profile") return `<span class="muted-cell">No allergies or sensitivities saved on this profile</span>`;
    const parts = [];
    if (alerts.confirmed.length) parts.push(`<span class="badge badge-alert">⚠ Allergy match</span> ${esc([...new Set(alerts.confirmed.map(hit => hit.ingredient))].join(", "))}`);
    if (alerts.related.length) parts.push(`<span class="badge badge-warn">Related</span> ${esc([...new Set(alerts.related.map(hit => hit.ingredient))].join(", "))}`);
    if (alerts.irritation.length) parts.push(`<span class="badge badge-soft">Irritation note</span> ${esc([...new Set(alerts.irritation.map(hit => hit.ingredient))].join(", "))}`);
    return parts.length ? parts.join("<br>") : "No matches";
  };

  const rows = [
    ["Category"], ["Price"], ["Size"],
    ["Price per unit", (column, index) => {
      const unit = units[index];
      if (!unit) return `<span class="muted-cell">Needs price and size</span>`;
      return `${esc(unit.text100)}${unit.small ? `<br><small>${esc(unit.text10)}</small>` : ""}${lowest !== null && unit.per100 === lowest ? ` <span class="badge badge-soft">lowest</span>` : ""}`;
    }],
    ["Intended use"], ["Period after opening"],
    ["Main functions", (column) => {
      const roles = [...ingredientRoles(column)];
      if (!column.ingredients) return `<span class="muted-cell">Needs ingredient list</span>`;
      return roles.length ? esc(roles.join(", ")) : "None identified in glossary";
    }],
    ["Ingredients", (column) => {
      const list = splitList(column.ingredients);
      return list.length ? `<details><summary>${list.length} listed</summary><p class="ing-inline">${esc(list.join(", "))}</p></details>` : `<span class="muted-cell">Not entered</span>`;
    }],
    ["Only in this product", (column, index) => {
      if (!withData[index] || withData.filter(Boolean).length < 2) return `<span class="muted-cell">Needs 2+ ingredient lists</span>`;
      const unique = splitList(column.ingredients).filter(raw => !ingredientSets.some((set, other) => other !== index && set.has(norm(raw))));
      return unique.length ? esc(unique.slice(0, 14).join(", ")) + (unique.length > 14 ? ` +${unique.length - 14} more` : "") : "Nothing unique";
    }],
    ["Allergy & irritation", alertCell],
    ["Evidence status"], ["Limitations"]
  ];

  $("#compareBody").innerHTML = `
    <p class="eyebrow">COMPARE</p><h2>${esc(title)}</h2>
    ${note ? `<p class="muted small">${esc(note)}</p>` : ""}
    <p class="helper">Differences here are about what is listed, not a verdict. Empty cells mean the data hasn't been entered yet.</p>
    <div class="compare-scroll">
      <table class="compare-table">
        <thead><tr><th></th>${columns.map(column => `
          <th><div class="compare-head">
            <div class="compare-img">${column.image ? `<img src="${imagePath(column.image)}" alt="">` : categoryIcon(column.category)}</div>
            <strong>${esc(column.name)}</strong>
            <small>${esc(column.brand || "")}</small>
            ${column.kind === "shelf" ? `<span class="badge badge-soft">On your shelf</span>` : ""}
          </div></th>`).join("")}</tr></thead>
        <tbody>${rows.map(([label, render]) => `
          <tr><th scope="row">${esc(label)}</th>${columns.map((column, index) => `<td>${render ? render(column, index) : compareCell(column, label)}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>`;
  openModal("compareModal");
}

/* ---------- Press-and-hold / right-click to start comparing ---------- */
let pressTimer = null, pressStart = null, suppressClickUntil = 0;
const LONG_PRESS_MS = 550;

document.addEventListener("touchstart", event => {
  const card = event.target.closest(".product-card");
  if (!card || event.target.closest("button")) return;
  const touch = event.touches[0];
  pressStart = { x: touch.clientX, y: touch.clientY };
  pressTimer = setTimeout(() => {
    suppressClickUntil = Date.now() + 700;
    if (navigator.vibrate) navigator.vibrate(15);
    startCompare(Number(card.dataset.product));
  }, LONG_PRESS_MS);
}, { passive: true });

document.addEventListener("touchmove", event => {
  if (!pressTimer || !pressStart) return;
  const touch = event.touches[0];
  if (Math.hypot(touch.clientX - pressStart.x, touch.clientY - pressStart.y) > 10) { clearTimeout(pressTimer); pressTimer = null; }
}, { passive: true });

["touchend", "touchcancel"].forEach(type => document.addEventListener(type, () => { clearTimeout(pressTimer); pressTimer = null; }, { passive: true }));

document.addEventListener("contextmenu", event => {
  const card = event.target.closest(".product-card");
  if (!card) return;
  event.preventDefault();
  // A mouse right-click is not followed by a click; a touch long-press might be.
  if (event.pointerType === "touch" || event.sourceCapabilities?.firesTouchEvents) suppressClickUntil = Date.now() + 700;
  startCompare(Number(card.dataset.product));
});

/* ---------- Click handling ---------- */
const run = (task) => Promise.resolve().then(task).catch(error => toast(error.message));

document.addEventListener("click", event => {
  if (Date.now() < suppressClickUntil) { event.preventDefault(); return; }
  if (!event.target.closest(".menu-wrap, .profile-wrap")) closeDropdowns();

  const switchButton = event.target.closest("[data-switch-profile]");
  if (switchButton) { run(() => switchProfile(switchButton.dataset.switchProfile)); return; }

  if (event.target.closest("[data-manage-profiles]")) { showPage("profile"); return; }

  const actionEl = event.target.closest("[data-action]");
  if (actionEl) {
    const action = actionEl.dataset.action;
    const id = Number(actionEl.dataset.id);
    switch (action) {
      case "view": renderProductModal(id); break;
      case "toggle-save": run(() => toggleSaved(id)); break;
      case "add-shelf": run(() => addProductToShelf(id)); break;
      case "compare-toggle": toggleCompare(id); break;
      case "compare-start":
        closeModals(); showPage("explore"); startCompare(id);
        toast("Now pick another product to compare."); break;
      case "compare-run": runCompare(); break;
      case "compare-shelf": runCompare(compare.ids.slice(0, 1), true); break;
      case "compare-shelf-product": runCompare([id], true); break;
      case "compare-cancel": cancelCompare(); break;
      case "edit-product": openEditProduct(id); break;
      case "shelf-details": openShelfItem(id); break;
      case "remove-shelf": run(() => removeInventory(id)); break;
      case "opened-today": run(async () => {
        await api(`/api/inventory/${id}`, { method: "PATCH", body: JSON.stringify({ opened_on: state.today }) });
        await load();
        const item = state.inventory.find(entry => entry.id === id);
        if (item && !itemData(item).pao) { openShelfItem(id); toast("Add the period-after-opening (months) so CLEAR can remind you."); }
        else toast("Opened date saved.");
      }); break;
      case "use-today": run(async () => { await api(`/api/usage/${id}`, { method: "POST" }); await load(); }); break;
      case "routine-remove": run(async () => { await api(`/api/routine/${id}`, { method: "DELETE" }); await load(); }); break;
      case "journal-delete":
        if (confirm("Delete this journal entry and its photo?")) run(async () => { await api(`/api/journal/${id}`, { method: "DELETE" }); await load(); toast("Entry deleted."); });
        break;
    }
    return;
  }

  const pageButton = event.target.closest("[data-page]");
  if (pageButton) {
    event.preventDefault();
    closeModals();
    cancelCompare();
    showPage(pageButton.dataset.page, pageButton.dataset.tab);
    return;
  }

  const tabButton = event.target.closest("#skinTabs [data-tab]");
  if (tabButton) { showSkinTab(tabButton.dataset.tab); return; }

  const categoryButton = event.target.closest("[data-category]");
  if (categoryButton) {
    activeCategory = categoryButton.dataset.category;
    showPage("explore");
    renderExplore();
    return;
  }

  const filterButton = event.target.closest("[data-filter]");
  if (filterButton) {
    activeCategory = filterButton.dataset.filter;
    renderExplore();
    return;
  }

  const card = event.target.closest("[data-product]");
  if (card) {
    const id = Number(card.dataset.product);
    if (compare.ids.length) toggleCompare(id);
    else renderProductModal(id);
    return;
  }

  const modalButton = event.target.closest("[data-modal]");
  if (modalButton) { openModal(modalButton.dataset.modal); return; }

  if (event.target.matches("[data-close]") || event.target.classList.contains("modal-backdrop")) {
    closeModals();
  }
});

document.addEventListener("change", event => {
  const frequency = event.target.closest("[data-routine-frequency]");
  if (frequency) {
    run(async () => {
      await api(`/api/routine/${frequency.dataset.routineFrequency}`, { method: "PUT", body: JSON.stringify({ frequency: frequency.value }) });
      await load();
    });
    return;
  }
  const picker = event.target.closest("[data-routine-select]");
  if (picker && picker.value) {
    run(async () => {
      await api("/api/routine", { method: "POST", body: JSON.stringify({ inventory_id: Number(picker.value), slot: picker.dataset.routineSelect }) });
      await load();
      toast(`Added to your ${picker.dataset.routineSelect} routine.`);
    });
  }
});

$("#menuButton").addEventListener("click", () => {
  const willOpen = $("#menuDropdown").classList.contains("hidden");
  closeDropdowns();
  $("#menuDropdown").classList.toggle("hidden", !willOpen);
  $("#menuButton").setAttribute("aria-expanded", String(willOpen));
});

$("#profileButton").addEventListener("click", () => {
  const willOpen = $("#profileDropdown").classList.contains("hidden");
  closeDropdowns();
  $("#profileDropdown").classList.toggle("hidden", !willOpen);
  $("#profileButton").setAttribute("aria-expanded", String(willOpen));
});

document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  closeDropdowns();
  const modalOpen = $$(".modal-backdrop").some(modal => !modal.classList.contains("hidden"));
  if (modalOpen) closeModals(); else cancelCompare();
});

/* ---------- Forms ---------- */
$("#newProfileForm").addEventListener("submit", async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));

  try {
    const result = await api("/api/profiles", { method: "POST", body: JSON.stringify(data) });
    event.target.reset();
    $("#newProfileResult").textContent = "";
    setActiveProfileId(result.id);
    $("#quizResult").textContent = "";
    cancelCompare();
    await load();
    closeModals();
    showPage("profile");
    toast(`${profileName()} created. Add their skin details below.`);
  } catch (error) {
    $("#newProfileResult").textContent = error.message;
  }
});

$("#deleteProfileButton").addEventListener("click", async () => {
  const name = profileName();
  const confirmed = confirm(`Delete ${name}'s profile?\n\nTheir skin details, shelf, routine, journal (including photos) and saved products will be removed. This can't be undone.`);
  if (!confirmed) return;

  try {
    await api(`/api/profiles/${state.profile.id}`, { method: "DELETE" });
    setActiveProfileId(null);   // server falls back to the first remaining profile
    $("#quizResult").textContent = "";
    await load();
    toast(`${name}'s profile was deleted. Now using ${profileName()}.`);
  } catch (error) {
    toast(error.message);
  }
});

$("#searchInput").addEventListener("input", renderExplore);

$("#inventoryForm").addEventListener("submit", async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));

  try {
    await api("/api/inventory", { method: "POST", body: JSON.stringify(data) });
    event.target.reset();
    event.target.querySelector("details")?.removeAttribute("open");
    await load();
    toast("Added to your skincare shelf.");
  } catch (error) {
    toast(error.message);
  }
});

$("#shelfItemForm").addEventListener("submit", async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  try {
    await api(`/api/inventory/${event.target.dataset.id}`, { method: "PATCH", body: JSON.stringify(data) });
    await load();
    closeModals();
    toast("Details saved.");
  } catch (error) {
    $("#shelfItemResult").textContent = error.message;
  }
});

$("#editProductForm").addEventListener("submit", async event => {
  event.preventDefault();
  const id = Number(event.target.dataset.id);
  const data = Object.fromEntries(new FormData(event.target));
  try {
    await api(`/api/products/${id}`, { method: "PUT", body: JSON.stringify(data) });
    await load();
    $("#editProductModal").classList.add("hidden");
    if (openProductId !== id) openProductId = null;
    if ($$(".modal-backdrop").every(modal => modal.classList.contains("hidden"))) document.body.classList.remove("modal-open");
    toast("Product data saved.");
  } catch (error) {
    $("#editProductResult").textContent = error.message;
  }
});

$("#profileForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form));
  const checked = name => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(input => input.value);
  data.sensitivities = [...checked("sens"), ...splitList(data.sensitivities_extra)].join(", ");
  data.skin_concerns = [...checked("concern"), ...splitList(data.concerns_extra)].join(", ");

  try {
    await api("/api/profile", { method: "PUT", body: JSON.stringify(data) });
    await load();
    toast("Your skin profile has been saved.");
  } catch (error) {
    toast(error.message);
  }
});

$("#journalForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.target;
  const body = new FormData();
  body.set("entry_date", form.entry_date.value);
  body.set("comfort", form.querySelector('input[name="comfort"]:checked')?.value || "0");
  body.set("tags", [...$$("#journalTags input:checked")].map(input => input.value).join(","));
  body.set("notes", form.notes.value);
  const photo = await resizePhoto(form.photo.files[0]);
  if (photo) body.set("photo", photo);

  try {
    await apiForm("/api/journal", body);
    form.reset();
    await load();
    toast("Journal entry saved.");
  } catch (error) {
    toast(error.message);
  }
});

$("#openQuiz").addEventListener("click", () => openModal("quizModal"));

$("#quizForm").addEventListener("submit", async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));

  try {
    const result = await api("/api/quiz", { method: "POST", body: JSON.stringify(data) });
    $("#quizResult").textContent = `Your starting point: ${result.skin_type}. This is an estimate, not a diagnosis. You can edit it in your profile.`;
    await load();
  } catch (error) {
    toast(error.message);
  }
});

$("#feedbackForm").addEventListener("submit", async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));

  try {
    const result = await api("/api/feedback", { method: "POST", body: JSON.stringify(data) });
    $("#feedbackResult").textContent = result.message;
    event.target.reset();
  } catch (error) {
    $("#feedbackResult").textContent = error.message;
  }
});

setupJournalForm();
load().then(announceExpiry).catch(error => toast(error.message));
