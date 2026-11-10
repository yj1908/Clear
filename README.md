# CLEAR — Skincare, made clearer

A fresh Flask + SQLite skincare research and product-awareness web app.

## Features
- Responsive earthy, spa-inspired interface in ivory, olive, sage, clay and forest green.
- Product library: ten starter cards, a distinct icon per category, heart-to-save on every card, and "+ Shelf" that becomes "✓ On shelf" once added (a product can only be on a shelf once).
- **Multiple profiles**: each person has their own skin details, shelf, routine, journal and saved list (up to 8).
- **Skin profile** (remembered in the database between visits): skin type, sensitivities, known ingredient allergies, skin concerns, conditions and a description of the current routine. A short skin-type quiz is included.
- **Allergy & irritation check**: three separate outcomes that are never mixed up:
  - *Allergy match*: an ingredient on the label matches something listed under allergies.
  - *Possible related ingredient*: same ingredient family as an allergy (for example a fragrance component when "fragrance" is listed). Explicitly "not a confirmed match".
  - *General irritation note*: an ingredient commonly flagged for a listed sensitivity. Explicitly "not an allergy and not a prediction".
  CLEAR never claims two products are incompatible because of the ingredients they contain.
- **Ingredient breakdown**: for each ingredient found in the glossary (`ingredient_kb.py`): what it does, intended function, limitations, potential concerns and what the research supports (with an evidence level).
- **Product comparison**: long-press (touch) or right-click a product card, then tap more cards (up to 3), or use the ⇄ button on a card. "Compare with my shelf" compares a product with what you own in the same category. Rows: price, size, price per unit, intended use, period after opening, main functions, ingredients, ingredients unique to each, allergy/irritation, evidence, limitations.
- **Price per unit**: per 100 ml/g, plus per 10 ml/g for small sizes (60 ml/g or less). Supports ml, l, g, kg and fl oz.
- **Purchase necessity checker** (in each product): do you own something similar, does it add a different function, is it redundant, is the price justified. Written to prompt thinking, not to say what you can or can't buy.
- **My skin** (the + button): Shelf, Routine (morning / evening / weekly, how often, and a "log use today" tally), Expiry (opened date + period after opening, with reminders on the Home page and a badge) and Journal (comfort rating, tags, notes, optional photo, routine snapshot, simple trend).
- Product request feedback form stored in SQLite.

## Run on Windows
1. Install Python 3.10 or newer.
2. Open the project folder in VS Code.
3. Open the VS Code terminal.
4. Create a virtual environment (recommended):

   ```powershell
   py -m venv .venv
   .venv\\Scripts\\activate
   ```

5. Install dependencies:

   ```powershell
   py -m pip install -r requirements.txt
   ```

6. Start the app:

   ```powershell
   py app.py
   ```

7. Open http://127.0.0.1:5000 in your browser.

The SQLite database is created automatically at `instance/clear.db` on first run.

## Adding official product data
The Explore page has ten product records, two per category. The ten supplied product images are matched to brand/category starter records. The starter names use only the brand and category visible in the filenames; add the exact product variant, size, price and verified product information before publishing.

The product detail endpoint and database fields are ready. To add records from the app itself, use the `POST /api/products` endpoint with JSON fields:
`product_name`, `brand`, `category`, `size`, `price`, `ingredients`, `ingredient_functions`, `hazards`, `cautions`, `limitations`, `marketing_claims`, `evidence_summary`, `evidence_status`, `evidence_sources`, `intended_use`, `notes`, `image_filename`.

## Filling in ingredient data (important)
The starter products have **no ingredient lists, sizes or prices**, because they were not provided and should be copied from the packaging or the brand's official page. The allergy check, ingredient breakdown, price per unit and necessity checker all depend on that data. Open a product → **Edit product data** and paste the ingredient list (comma separated), size, price and period after opening (months). Shelf items you add manually can have their own ingredient list under "Optional details".

## Extending the ingredient glossary
`ingredient_kb.py` holds the plain-language notes. Each entry lists the names it should match (INCI and common names), plus optional `irritation` tags and `families` used for related-ingredient allergy matches. It is educational, not a medical reference: review the wording and add sources you trust before publishing.

## Important research and safety notes
- The quiz is a rough self-check, not a validated diagnostic tool.
- Allergy and condition fields are user-entered context, not medical records or diagnoses.
- Product ingredient lists and formulations can change. Verify against current packaging and official sources.
- Do not treat an ingredient's general properties as proof that a finished product's marketing claim is true.
- Clearly distinguish evidence for an ingredient from evidence for the finished formulation.
- Starter product names are generic brand/category labels based on the supplied image filenames, not verified full product variants or product assessments.
- This starter project does not yet implement user accounts, authentication, encryption, admin moderation, or public deployment security. Do not deploy it with personal information until those protections are designed and implemented.
- Journal photos are stored unencrypted in `instance/uploads/` on the computer running the app, and are removed when the entry or profile is deleted.
- Expiry reminders appear inside the app (Home page, My skin tab badge, a message on load). They are a guide to the period-after-opening, not a safety guarantee.
- Profiles are for organising, not for security: anyone who can open the app can switch to any profile and read it. The active profile is remembered per browser (localStorage), not per login.

## How multiple profiles work
- Tables: `profiles` (name, skin_type, allergies, skin_conditions); `inventory.profile_id`; `saved_products(profile_id, product_id)`.
- The browser sends its active profile in an `X-Profile-Id` header. Missing or stale ids fall back to the first profile.
- Upgrading is automatic and non-destructive: on first run, the old single profile becomes a profile called "Me", and your existing shelf and saved products are assigned to it. The old `profile` table is left untouched.
- Endpoints: `POST /api/profiles`, `DELETE /api/profiles/<id>`, `PUT /api/profile` (updates the active profile, including its name).


## Product image files
Place product images in `static/images/`. Product photos are shown edge-to-edge in cards with no inner padding, and white photo backgrounds blend into the card (`mix-blend-mode: multiply`), so use images with a pure white background and crop away empty margins. The starter database maps the supplied files as follows:
- `CeraVe_Cleanser.webp` and `Purito_Cleanser.webp`
- `Anua_Toner.webp` and `Roundlab_Toner.webp`
- `Numbuzin_Serum.webp` and `Torriden_Serum.webp`
- `Dr G_Moisturiser.webp` and `Dr Althea_Moisturiser.webp`
- `SKIN1004_Sunscreen.webp` and `Beauty of Joseon_Sunscreen.webp`

The app adds `image_filename` to an older database automatically. It does not delete the database or your inventory/profile information. Product names in the starter records are deliberately generic brand/category labels; verify the exact product variant before adding full product research.
