# CLEAR — Skincare, made clearer

A fresh Flask + SQLite skincare research and product-awareness web app.

## Features
- Responsive, botanical/ivory interface inspired by the supplied reference.
- Five product categories: cleanser, toner, serum, moisturiser and sunscreen.
- Two product slots per category (10 total).
- One fictional demo serum record; the remaining nine slots are intentionally blank.
- Product detail framework for ingredients, functions, hazards, cautions, limitations, marketing claims, evidence, sources, price/size and intended use.
- Skin profile with skin type, allergies and skin conditions.
- Short educational skin-type self-check quiz.
- Personal skincare inventory with add/remove.
- Saved product shortlist.
- Product request feedback form stored in SQLite.
- Dropdown menu with Settings and App customisation placeholders.

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
The Explore page has ten product records, two per category. Only the fictional demo serum is populated. Replace the demo record and fill the remaining records with verified product information before publishing.

The product detail endpoint and database fields are ready. To add records from the app itself, use the `POST /api/products` endpoint with JSON fields:
`product_name`, `brand`, `category`, `size`, `price`, `ingredients`, `ingredient_functions`, `hazards`, `cautions`, `limitations`, `marketing_claims`, `evidence_summary`, `evidence_status`, `evidence_sources`, `intended_use`, `notes`.

## Important research and safety notes
- The quiz is a rough self-check, not a validated diagnostic tool.
- Allergy and condition fields are user-entered context, not medical records or diagnoses.
- Product ingredient lists and formulations can change. Verify against current packaging and official sources.
- Do not treat an ingredient's general properties as proof that a finished product's marketing claim is true.
- Clearly distinguish evidence for an ingredient from evidence for the finished formulation.
- The demo product and its text are fictional placeholders, not a real product recommendation or safety assessment.
- This starter project does not yet implement user accounts, authentication, encryption, admin moderation, or public deployment security. Do not deploy it with personal information until those protections are designed and implemented.
