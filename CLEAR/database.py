import sqlite3
from pathlib import Path
from flask import g

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "instance" / "clear.db"

def get_db():
    if "db" not in g:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db

def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()

def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.executescript("""
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK (id=1),
      skin_type TEXT DEFAULT '',
      allergies TEXT DEFAULT '',
      skin_conditions TEXT DEFAULT '',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    INSERT OR IGNORE INTO profile (id, skin_type, allergies, skin_conditions)
    VALUES (1, '', '', '');

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_name TEXT NOT NULL,
      brand TEXT DEFAULT '',
      category TEXT NOT NULL,
      size TEXT DEFAULT '',
      price TEXT DEFAULT '',
      ingredients TEXT DEFAULT '',
      ingredient_functions TEXT DEFAULT '',
      hazards TEXT DEFAULT '',
      cautions TEXT DEFAULT '',
      limitations TEXT DEFAULT '',
      marketing_claims TEXT DEFAULT '',
      evidence_summary TEXT DEFAULT '',
      evidence_status TEXT DEFAULT '',
      evidence_sources TEXT DEFAULT '',
      intended_use TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      is_demo INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_name TEXT NOT NULL,
      brand TEXT DEFAULT '',
      category TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feedback_type TEXT DEFAULT 'product_request',
      brand TEXT DEFAULT '',
      product_name TEXT NOT NULL,
      product_url TEXT DEFAULT '',
      message TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS saved_products (
      product_id INTEGER PRIMARY KEY,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
    );
    """)
    # Ten category slots: two per category. Nine intentionally blank templates;
    # one fictional demo record illustrates the product-detail structure.
    count = db.execute("SELECT COUNT(*) FROM products").fetchone()[0]
    if count == 0:
        categories = ["Cleanser", "Cleanser", "Toner", "Toner", "Serum", "Serum",
                      "Moisturiser", "Moisturiser", "Sunscreen", "Sunscreen"]
        for index, category in enumerate(categories):
            if index == 4:
                db.execute("""
                  INSERT INTO products (
                    product_name, brand, category, size, price, ingredients,
                    ingredient_functions, hazards, cautions, limitations,
                    marketing_claims, evidence_summary, evidence_status,
                    evidence_sources, intended_use, notes, is_demo
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                """, (
                    "Cloudwater Hydrating Serum", "Demo Lab", "Serum", "30 ml", "S$18.00",
                    "Glycerin; panthenol; water (fictional demo formula)",
                    "Glycerin: humectant that attracts water. Panthenol: skin-conditioning ingredient.",
                    "No product-specific hazard assessment has been entered.",
                    "Patch-test new products. Stop use if irritation occurs. Check the full formula against personal allergies.",
                    "This is fictional demonstration data, not a real product or a safety assessment.",
                    "“Provides lasting hydration” (example marketing claim)",
                    "No product-specific clinical evidence has been entered. Ingredient-level research alone would not prove this finished-product claim.",
                    "Not assessed",
                    "Add primary studies, independent testing, or other reliable sources here.",
                    "Hydration",
                    "FICTIONAL DEMO RECORD — replace or delete before public release."
                ))
            else:
                db.execute("""
                  INSERT INTO products (product_name, brand, category)
                  VALUES (?, ?, ?)
                """, ("", "", category))
    db.commit()
    db.close()
