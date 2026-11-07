const categories = ["Cleanser","Toner","Serum","Moisturiser","Sunscreen"];
let state = {profile:{}, products:[], inventory:[], saved:[]};
let activeCategory = "All";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

async function api(url, options={}) {
  const response = await fetch(url, {headers:{"Content-Type":"application/json"}, ...options});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function toast(message){const el=$("#toast");el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2600)}
function esc(value=""){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function showPage(name){
  $$(".page").forEach(p=>p.classList.toggle("active",p.id===name+"Page"));
  $$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===name));
  window.scrollTo({top:0,behavior:"smooth"});
  $("#menuDropdown").classList.add("hidden");
}
function openModal(id){$("#"+id).classList.remove("hidden")}
function closeModals(){$$(".modal-backdrop").forEach(m=>m.classList.add("hidden"))}
function categoryIcon(c){return ({Cleanser:"◯",Toner:"〰",Serum:"✧",Moisturiser:"◒",Sunscreen:"☼"})[c]||"✧"}

async function load(){
  state=await api("/api/bootstrap");
  renderHome();renderExplore();renderInventory();renderProfile();renderSaved();
}
function renderHome(){
  $("#homeCategories").innerHTML=categories.map((c,i)=>`<button class="category-card" data-category="${c}"><span class="category-number">0${i+1} / CATEGORY</span><strong>${c}</strong><small>Explore products →</small></button>`).join("");
  $("#homeSkinType").textContent=state.profile.skin_type||"Not set up yet";
  const bits=[state.profile.allergies?"Allergies added":"No allergies listed",state.profile.skin_conditions?"Skin notes added":"No skin notes"];
  $("#homeProfileMeta").textContent=bits.join(" · ");
}
function renderFilters(){
  $("#categoryFilters").innerHTML=["All",...categories].map(c=>`<button class="filter-chip ${activeCategory===c?"active":""}" data-filter="${c}">${c}</button>`).join("");
}
function renderExplore(){
  renderFilters();
  const q=($("#searchInput")?.value||"").toLowerCase();
  const visible=state.products.filter(p=>(activeCategory==="All"||p.category===activeCategory)&&(`${p.product_name} ${p.brand} ${p.category}`).toLowerCase().includes(q));
  $("#productGrid").innerHTML=visible.map(p=>{
    const blank=!p.product_name;
    return `<article class="product-card ${blank?"empty-card":""}" ${blank?"":"data-product='"+p.id+"'"}>
      <div class="product-top"><span class="product-category">${esc(p.category)}</span><span>${categoryIcon(p.category)}</span></div>
      <div class="product-placeholder">${blank?"＋":"✧"}</div>
      <h3>${blank?"Product slot available":esc(p.product_name)}</h3>
      <p>${blank?"Template — add product data when ready":esc(p.brand||"Brand not specified")}</p>
      <div class="card-bottom"><span>${blank?"AWAITING ENTRY":(p.is_demo?"DEMO ENTRY":"VIEW PRODUCT")}</span><span>→</span></div>
    </article>`;
  }).join("")||`<div class="empty-state">No products match your search yet.</div>`;
}
function renderInventory(){
  $("#inventoryList").innerHTML=state.inventory.length?state.inventory.map(i=>`<div class="inventory-item"><div><strong>${esc(i.product_name)}</strong><small>${esc(i.brand)} ${i.category?"· "+esc(i.category):""}</small>${i.notes?`<small><br>${esc(i.notes)}</small>`:""}</div><button class="delete-button" data-delete="${i.id}" aria-label="Remove">×</button></div>`).join(""):`<div class="empty-state">Your skincare shelf is empty. Add the products you currently use above.</div>`;
}
function renderProfile(){
  const f=$("#profileForm");
  f.skin_type.value=state.profile.skin_type||"";
  f.allergies.value=state.profile.allergies||"";
  f.skin_conditions.value=state.profile.skin_conditions||"";
}
function renderSaved(){
  const list=state.products.filter(p=>state.saved.includes(p.id)&&p.product_name);
  $("#savedGrid").innerHTML=list.length?list.map(p=>productCard(p)).join(""):`<div class="empty-state">Nothing saved yet. Open a product and save it to your shortlist.</div>`;
}
function productCard(p){return `<article class="product-card" data-product="${p.id}"><div class="product-top"><span class="product-category">${esc(p.category)}</span><span>♡</span></div><div class="product-placeholder">✧</div><h3>${esc(p.product_name)}</h3><p>${esc(p.brand||"Brand not specified")}</p><div class="card-bottom"><span>VIEW PRODUCT</span><span>→</span></div></article>`}
async function openProduct(id){
  const p=await api(`/api/products/${id}`);
  const fields=[
    ["Ingredient information","ingredients","ingredient_functions","Ingredient list","Ingredient functions"],
    ["Safety & cautions","hazards","cautions","Known hazards","Relevant cautions"],
    ["Limitations","limitations",null,"Limitations",null],
    ["Claim substantiation","marketing_claims","evidence_summary","Marketing claims","Evidence assessment"],
    ["Evidence status & sources","evidence_status","evidence_sources","Evidence status","Sources / references"],
    ["Purchase necessity","intended_use","notes","Intended use","Notes"]
  ];
  const content=fields.map(([title,a,b,la,lb])=>`<section class="detail-section"><h3>${title}</h3><div class="detail-grid"><div><p><b>${la}</b><br>${esc(p[a]||"Not yet assessed — product data can be added here.")}</p></div>${b?`<div><p><b>${lb}</b><br>${esc(p[b]||"Not yet assessed — product data can be added here.")}</p></div>`:""}</div></section>`).join("");
  const priceNum=Number(String(p.price||"").replace(/[^0-9.]/g,""));
  const sizeMatch=String(p.size||"").match(/([0-9.]+)\s*(ml|g)\b/i);
  const unitValue=(priceNum>0&&sizeMatch&&Number(sizeMatch[1])>0)?(priceNum/Number(sizeMatch[1])*100):null;
  const unitLabel=sizeMatch?`per 100 ${sizeMatch[2].toLowerCase()}`:"per 100 ml/g";
  const comparable=state.products.filter(other=>other.id!==p.id&&other.product_name&&other.intended_use&&p.intended_use&&other.intended_use.trim().toLowerCase()===p.intended_use.trim().toLowerCase());
  const comparison=comparable.length?comparable.map(other=>{
    const n=Number(String(other.price||"").replace(/[^0-9.]/g,""));
    const m=String(other.size||"").match(/([0-9.]+)\s*(ml|g)\b/i);
    const unit=(n>0&&m&&Number(m[1])>0)?`S$${(n/Number(m[1])*100).toFixed(2)} / 100 ${m[2].toLowerCase()}`:"Unit price not available";
    return `<p><b>${esc(other.product_name)}</b> — ${esc(unit)}</p>`;
  }).join(""):`<p>No other products with the same recorded intended use are available for comparison yet.</p>`;
  const economicSection=`<section class="detail-section"><h3>Economic value</h3><div class="detail-grid"><p><b>Listed price</b><br>${esc(p.price||"Not entered")}</p><p><b>Product size</b><br>${esc(p.size||"Not entered")}</p><p><b>Calculated unit price</b><br>${unitValue===null?"Not enough price/size data":`S$${unitValue.toFixed(2)} ${unitLabel}`}</p></div><p style="margin-top:12px"><b>Similar intended-use comparisons</b><br>${comparison}</p></section>`;
  const shelfComparison=`<section class="detail-section"><h3>Purchase necessity</h3><p><b>Recorded intended use</b><br>${esc(p.intended_use||"Not yet assessed — add the product's intended use.")}</p><p style="margin-top:10px"><b>Your current skincare</b><br>${state.inventory.length?state.inventory.map(i=>`${esc(i.product_name)}${i.brand?" — "+esc(i.brand):""}${i.category?" ("+esc(i.category)+")":""}`).join("<br>"):"Your inventory is empty. Add your current products to compare overlapping functions."}</p><p style="margin-top:10px">Review the intended functions of products you already own before deciding whether this adds something meaningfully different.</p></section>`;
  $("#productDetail").innerHTML=`<div class="detail-head"><p class="eyebrow">${esc(p.category)} / PRODUCT REVIEW</p><h2>${esc(p.product_name||"Product template")}</h2><p class="detail-brand">${esc(p.brand||"Brand not specified")} ${p.size?"· "+esc(p.size):""}</p><div class="detail-actions"><button class="save-button" id="saveProduct">${state.saved.includes(p.id)?"♥ Saved":"♡ Save product"}</button></div></div>${p.is_demo?`<div class="demo-warning"><b>DEMO DATA:</b> This is a fictional sample record to demonstrate the layout. It is not a real product assessment or evidence review.</div>`:""}${content}${economicSection}${shelfComparison}`;
  $("#saveProduct").onclick=async()=>{const r=await api(`/api/saved/${p.id}`,{method:"POST"});state.saved= r.saved?[...state.saved,p.id]:state.saved.filter(x=>x!==p.id);$("#saveProduct").textContent=r.saved?"♥ Saved":"♡ Save product";renderSaved();toast(r.saved?"Added to saved":"Removed from saved")};
  openModal("productModal");
}
$$("[data-page]").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.page)));
document.addEventListener("click",e=>{
  const cat=e.target.closest("[data-category]");if(cat){activeCategory=cat.dataset.category;showPage("explore");renderExplore()}
  const filter=e.target.closest("[data-filter]");if(filter){activeCategory=filter.dataset.filter;renderExplore()}
  const card=e.target.closest("[data-product]");if(card)openProduct(Number(card.dataset.product));
  const del=e.target.closest("[data-delete]");if(del)removeInventory(Number(del.dataset.delete));
  const modal=e.target.closest("[data-modal]");if(modal)openModal(modal.dataset.modal);
  if(e.target.matches("[data-close]"))closeModals();
  if(e.target.classList.contains("modal-backdrop"))closeModals();
});
$("#menuButton").addEventListener("click",()=>{$("#menuDropdown").classList.toggle("hidden");$("#menuButton").setAttribute("aria-expanded",String(!$("#menuDropdown").classList.contains("hidden")))});
$("#searchInput").addEventListener("input",renderExplore);
$("#inventoryForm").addEventListener("submit",async e=>{
  e.preventDefault();const data=Object.fromEntries(new FormData(e.target));
  try{await api("/api/inventory",{method:"POST",body:JSON.stringify(data)});e.target.reset();await load();toast("Added to your skincare shelf.")}catch(err){toast(err.message)}
});
async function removeInventory(id){await api(`/api/inventory/${id}`,{method:"DELETE"});await load();toast("Removed from your inventory.")}
$("#profileForm").addEventListener("submit",async e=>{
  e.preventDefault();const data=Object.fromEntries(new FormData(e.target));
  await api("/api/profile",{method:"PUT",body:JSON.stringify(data)});await load();toast("Your skin profile has been saved.");
});
$("#openQuiz").addEventListener("click",()=>openModal("quizModal"));
$("#quizForm").addEventListener("submit",async e=>{
  e.preventDefault();const data=Object.fromEntries(new FormData(e.target));
  const r=await api("/api/quiz",{method:"POST",body:JSON.stringify(data)});
  $("#quizResult").textContent=`Your starting point: ${r.skin_type}. This is an estimate, not a diagnosis. You can edit it in your profile.`;
  await load();
});
$("#feedbackForm").addEventListener("submit",async e=>{
  e.preventDefault();const data=Object.fromEntries(new FormData(e.target));
  try{const r=await api("/api/feedback",{method:"POST",body:JSON.stringify(data)});$("#feedbackResult").textContent=r.message;e.target.reset()}catch(err){$("#feedbackResult").textContent=err.message}
});
load().catch(err=>toast(err.message));
