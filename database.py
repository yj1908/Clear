import sqlite3
from pathlib import Path
from flask import g

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "instance" / "clear.db"

# These names describe the brands and categories shown by the supplied image files.
# They intentionally avoid guessing the full product variant names.
SAMPLE_PRODUCTS = [
    ("CeraVe Cleanser", "CeraVe", "Cleanser", "CeraVe_Cleanser.webp"),
    ("Purito Cleanser", "Purito", "Cleanser", "Purito_Cleanser.webp"),
    ("Anua Toner", "Anua", "Toner", "Anua_Toner.webp"),
    ("Round Lab Toner", "Round Lab", "Toner", "Roundlab_Toner.webp"),
    ("Numbuzin Serum", "Numbuzin", "Serum", "Numbuzin_Serum.webp"),
    ("Torriden Serum", "Torriden", "Serum", "Torriden_Serum.webp"),
    ("Dr.G Moisturiser", "Dr.G", "Moisturiser", "Dr G_Moisturiser.webp"),
    ("Dr. Althea Moisturiser", "Dr. Althea", "Moisturiser", "Dr Althea_Moisturiser.webp"),
    ("SKIN1004 Sunscreen", "SKIN1004", "Sunscreen", "SKIN1004_Sunscreen.webp"),
    ("Beauty of Joseon Sunscreen", "Beauty of Joseon", "Sunscreen", "Beauty of Joseon_Sunscreen.webp"),
]


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


def _columns(db, table):
    return [row["name"] for row in db.execute(f"PRAGMA table_info({table})")]


def migrate_to_profiles(db):
    """Upgrade an older single-profile database to multi-profile without losing data.

    - The old single-row `profile` table becomes the first row of `profiles` ("Me").
    - Existing inventory rows and saved products are assigned to that first profile.
    The old `profile` table is left in place (unused) so nothing is ever deleted.
    """
    if db.execute("SELECT COUNT(*) FROM profiles").fetchone()[0] == 0:
        legacy = None
        has_legacy = db.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='profile'"
        ).fetchone()
        if has_legacy:
            legacy = db.execute(
                "SELECT skin_type, allergies, skin_conditions FROM profile WHERE id=1"
            ).fetchone()
        db.execute(
            "INSERT INTO profiles (name, skin_type, allergies, skin_conditions) VALUES (?, ?, ?, ?)",
            ("Me", *(tuple(legacy) if legacy else ("", "", "")))
        )

    first_id = int(db.execute("SELECT MIN(id) FROM profiles").fetchone()[0])

    if "profile_id" not in _columns(db, "inventory"):
        db.execute(
            f"ALTER TABLE inventory ADD COLUMN profile_id INTEGER NOT NULL DEFAULT {first_id}"
        )

    db.commit()  # close any implicit transaction before the explicit one below

    if "profile_id" not in _columns(db, "saved_products"):
        db.execute("BEGIN")
        db.execute("""
            CREATE TABLE saved_products_new (
              profile_id INTEGER NOT NULL,
              product_id INTEGER NOT NULL,
              PRIMARY KEY (profile_id, product_id),
              FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
              FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
            )
        """)
        db.execute(
            "INSERT INTO saved_products_new (profile_id, product_id) "
            "SELECT ?, product_id FROM saved_products", (first_id,)
        )
        db.execute("DROP TABLE saved_products")
        db.execute("ALTER TABLE saved_products_new RENAME TO saved_products")
        db.commit()

    db.execute("CREATE INDEX IF NOT EXISTS idx_inventory_profile ON inventory(profile_id)")
    db.commit()


def _add_column(db, table, column, ddl):
    if column not in _columns(db, table):
        db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")


def ensure_columns(db):
    """Non-destructive upgrades: only ever adds columns, never drops data."""
    _add_column(db, "profiles", "sensitivities", "TEXT DEFAULT ''")
    _add_column(db, "profiles", "skin_concerns", "TEXT DEFAULT ''")
    _add_column(db, "profiles", "routine_notes", "TEXT DEFAULT ''")

    _add_column(db, "products", "pao_months", "INTEGER DEFAULT 0")

    _add_column(db, "inventory", "product_id", "INTEGER")
    _add_column(db, "inventory", "ingredients", "TEXT DEFAULT ''")
    _add_column(db, "inventory", "price", "TEXT DEFAULT ''")
    _add_column(db, "inventory", "size", "TEXT DEFAULT ''")
    _add_column(db, "inventory", "opened_on", "TEXT DEFAULT ''")
    _add_column(db, "inventory", "pao_months", "INTEGER DEFAULT 0")

    # Link older shelf rows that were added from the library, so the cards can
    # show "On shelf" for them too. Rows are never deleted.
    db.execute("""
        UPDATE inventory SET product_id = (
          SELECT p.id FROM products p
          WHERE p.product_name = inventory.product_name AND p.brand = inventory.brand
          LIMIT 1)
        WHERE product_id IS NULL AND notes LIKE 'Added from the CLEAR product library%'
    """)
    db.execute("CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(profile_id, product_id)")
    db.commit()


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row

    db.executescript("""
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      skin_type TEXT DEFAULT '',
      allergies TEXT DEFAULT '',
      skin_conditions TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

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
      is_demo INTEGER DEFAULT 0,
      image_filename TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL,
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
      profile_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      PRIMARY KEY (profile_id, product_id),
      FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS routine_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL,
      inventory_id INTEGER NOT NULL,
      slot TEXT NOT NULL,                -- morning | evening | weekly
      frequency TEXT DEFAULT '',
      position INTEGER DEFAULT 0,
      UNIQUE (inventory_id, slot),
      FOREIGN KEY(inventory_id) REFERENCES inventory(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS usage_log (
      profile_id INTEGER NOT NULL,
      inventory_id INTEGER NOT NULL,
      used_on TEXT NOT NULL,             -- YYYY-MM-DD
      PRIMARY KEY (inventory_id, used_on),
      FOREIGN KEY(inventory_id) REFERENCES inventory(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL,
      entry_date TEXT NOT NULL,          -- YYYY-MM-DD
      comfort INTEGER DEFAULT 0,         -- 1 (uncomfortable) to 5 (very comfortable), 0 = not rated
      tags TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      photo_filename TEXT DEFAULT '',
      routine_snapshot TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_journal_profile ON journal_entries(profile_id, entry_date);
    """)

    migrate_to_profiles(db)
    ensure_columns(db)

    # Safe migration for an existing database: add the image column without
    # deleting or rebuilding any existing tables or user information.
    columns = [row["name"] for row in db.execute("PRAGMA table_info(products)")]
    if "image_filename" not in columns:
        db.execute("ALTER TABLE products ADD COLUMN image_filename TEXT DEFAULT ''")

    count = db.execute("SELECT COUNT(*) FROM products").fetchone()[0]

    # A brand-new database starts with the ten supplied image-backed examples.
    if count == 0:
        for product_name, brand, category, image_filename in SAMPLE_PRODUCTS:
            db.execute("""
                INSERT INTO products (product_name, brand, category, image_filename)
                VALUES (?, ?, ?, ?)
            """, (product_name, brand, category, image_filename))
    else:
        # Fill only the original blank template slots. Existing real product
        # records are left untouched.
        for product_id, sample in enumerate(SAMPLE_PRODUCTS, start=1):
            product_name, brand, category, image_filename = sample
            row = db.execute(
                "SELECT product_name, is_demo FROM products WHERE id=?",
                (product_id,)
            ).fetchone()
            if not row:
                continue

            is_original_demo = (
                row["is_demo"] == 1
                and row["product_name"] == "Cloudwater Hydrating Serum"
            )
            is_blank_slot = not (row["product_name"] or "").strip()

            if is_original_demo:
                # The old fictional demo record is replaced with the supplied
                # serum image. Clear its fictional assessment text as well.
                db.execute("""
                    UPDATE products SET
                      product_name=?, brand=?, category=?, size='', price='',
                      ingredients='', ingredient_functions='', hazards='',
                      cautions='', limitations='', marketing_claims='',
                      evidence_summary='', evidence_status='', evidence_sources='',
                      intended_use='', notes='', is_demo=0, image_filename=?
                    WHERE id=?
                """, (product_name, brand, category, image_filename, product_id))
            elif is_blank_slot:
                db.execute("""
                    UPDATE products
                    SET product_name=?, brand=?, category=?, image_filename=?
                    WHERE id=?
                """, (product_name, brand, category, image_filename, product_id))

    db.commit()
    db.close()
