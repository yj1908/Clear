import sqlite3
import uuid
from datetime import date, timedelta
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_from_directory
from database import BASE_DIR, close_db, get_db, init_db
from ingredient_kb import INGREDIENTS

app = Flask(__name__)
app.config["JSON_SORT_KEYS"] = False
app.config["MAX_CONTENT_LENGTH"] = 6 * 1024 * 1024  # journal photos are resized in the browser first

with app.app_context():
    init_db()

app.teardown_appcontext(close_db)

ALLOWED_CATEGORIES = {"Cleanser", "Toner", "Serum", "Moisturiser", "Sunscreen"}
MAX_PROFILES = 8
PROFILE_NAME_MAX = 30
IMAGE_DIR = Path(app.static_folder) / "images"
UPLOAD_DIR = BASE_DIR / "instance" / "uploads"
MAX_PHOTO_BYTES = 4 * 1024 * 1024
ROUTINE_SLOTS = {"morning", "evening", "weekly"}


def clean_text(data, key, default=""):
    value = data.get(key, default)
    return value.strip() if isinstance(value, str) else default


def safe_image_filename(filename):
    """Accept only an image filename that exists inside static/images."""
    if not isinstance(filename, str) or not filename.strip():
        return ""
    filename = Path(filename).name
    suffix = Path(filename).suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
        return ""
    return filename if (IMAGE_DIR / filename).is_file() else ""


def current_profile(db):
    """Return the active profile row.

    The browser sends its chosen profile in the X-Profile-Id header (kept in
    localStorage), so two people on two devices can use different profiles at
    the same time. Missing or stale ids fall back to the first profile.
    """
    raw = request.headers.get("X-Profile-Id", "")
    row = None
    if raw.isascii() and raw.isdigit():
        row = db.execute("SELECT * FROM profiles WHERE id=?", (int(raw),)).fetchone()
    if row is None:
        row = db.execute("SELECT * FROM profiles ORDER BY id LIMIT 1").fetchone()
    return row


def validate_profile_name(name):
    if not name:
        return "Please enter a name for the profile."
    if len(name) > PROFILE_NAME_MAX:
        return f"Profile names can be up to {PROFILE_NAME_MAX} characters."
    return None


def clean_date(value, allow_blank=False):
    """Return a YYYY-MM-DD string, or None if invalid. Dates after tomorrow are rejected."""
    value = (value or "").strip() if isinstance(value, str) else ""
    if not value:
        return "" if allow_blank else None
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        return None
    if parsed > date.today() + timedelta(days=1):
        return None
    return parsed.isoformat()


def clean_pao(value):
    try:
        months = int(value)
    except (TypeError, ValueError):
        return 0
    return months if 0 < months <= 60 else 0


def detect_image_ext(data):
    if data[:3] == b"\xff\xd8\xff":
        return ".jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return None


def remove_upload(filename):
    if filename:
        try:
            (UPLOAD_DIR / Path(filename).name).unlink(missing_ok=True)
        except OSError:
            pass


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/api/bootstrap")
def bootstrap():
    db = get_db()
    profile = current_profile(db)
    profiles = db.execute(
        "SELECT id, name, skin_type FROM profiles ORDER BY id"
    ).fetchall()
    products = db.execute("SELECT * FROM products ORDER BY category, id").fetchall()
    products_payload = []
    for product in products:
        product_data = dict(product)
        product_data["image_filename"] = safe_image_filename(product_data.get("image_filename", ""))
        products_payload.append(product_data)

    inventory = db.execute("""
        SELECT id, product_id, product_name, brand, category, notes, created_at,
               ingredients, price, size, opened_on, pao_months
        FROM inventory
        WHERE profile_id=?
        ORDER BY created_at DESC, id DESC
    """, (profile["id"],)).fetchall()
    saved = db.execute(
        "SELECT product_id FROM saved_products WHERE profile_id=?", (profile["id"],)
    ).fetchall()
    routine = db.execute(
        "SELECT id, inventory_id, slot, frequency FROM routine_items "
        "WHERE profile_id=? ORDER BY position, id", (profile["id"],)
    ).fetchall()
    since = (date.today() - timedelta(days=29)).isoformat()
    usage = db.execute("""
        SELECT inventory_id, COUNT(*) AS uses_30d, MAX(used_on) AS last_used
        FROM usage_log WHERE profile_id=? AND used_on>=? GROUP BY inventory_id
    """, (profile["id"], since)).fetchall()
    used_today = db.execute(
        "SELECT inventory_id FROM usage_log WHERE profile_id=? AND used_on=?",
        (profile["id"], date.today().isoformat())
    ).fetchall()
    journal = db.execute("""
        SELECT id, entry_date, comfort, tags, notes, photo_filename, routine_snapshot
        FROM journal_entries WHERE profile_id=? ORDER BY entry_date DESC, id DESC
    """, (profile["id"],)).fetchall()

    return jsonify({
        "profile": dict(profile),
        "profiles": [dict(row) for row in profiles],
        "active_profile_id": profile["id"],
        "max_profiles": MAX_PROFILES,
        "products": products_payload,
        "inventory": [dict(item) for item in inventory],
        "saved": [row["product_id"] for row in saved],
        "routine": [dict(row) for row in routine],
        "usage": {row["inventory_id"]: {"uses_30d": row["uses_30d"], "last_used": row["last_used"]} for row in usage},
        "used_today": [row["inventory_id"] for row in used_today],
        "journal": [dict(row) for row in journal],
        "ingredient_kb": INGREDIENTS,
        "today": date.today().isoformat()
    })


@app.put("/api/profile")
def update_profile():
    data = request.get_json(silent=True) or {}
    db = get_db()
    profile = current_profile(db)

    name = profile["name"]
    if "name" in data:
        name = clean_text(data, "name")
        error = validate_profile_name(name)
        if error:
            return jsonify({"error": error}), 400

    try:
        db.execute("""
            UPDATE profiles
            SET name=?, skin_type=?, allergies=?, skin_conditions=?,
                sensitivities=?, skin_concerns=?, routine_notes=?, updated_at=CURRENT_TIMESTAMP
            WHERE id=?
        """, (
            name,
            clean_text(data, "skin_type"),
            clean_text(data, "allergies"),
            clean_text(data, "skin_conditions"),
            clean_text(data, "sensitivities"),
            clean_text(data, "skin_concerns"),
            clean_text(data, "routine_notes"),
            profile["id"]
        ))
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "Another profile already uses that name."}), 409
    return jsonify({"ok": True})


@app.post("/api/profiles")
def create_profile():
    data = request.get_json(silent=True) or {}
    name = clean_text(data, "name")
    error = validate_profile_name(name)
    if error:
        return jsonify({"error": error}), 400

    db = get_db()
    count = db.execute("SELECT COUNT(*) FROM profiles").fetchone()[0]
    if count >= MAX_PROFILES:
        return jsonify({"error": f"You can have up to {MAX_PROFILES} profiles."}), 400

    try:
        cursor = db.execute("INSERT INTO profiles (name) VALUES (?)", (name,))
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "A profile with that name already exists."}), 409
    return jsonify({"ok": True, "id": cursor.lastrowid})


@app.delete("/api/profiles/<int:profile_id>")
def delete_profile(profile_id):
    db = get_db()
    exists = db.execute("SELECT 1 FROM profiles WHERE id=?", (profile_id,)).fetchone()
    if not exists:
        return jsonify({"error": "Profile not found."}), 404

    count = db.execute("SELECT COUNT(*) FROM profiles").fetchone()[0]
    if count <= 1:
        return jsonify({"error": "You need at least one profile."}), 400

    # Remove everything owned by this profile (done explicitly so it also works
    # on databases migrated from the single-profile version).
    for row in db.execute(
        "SELECT photo_filename FROM journal_entries WHERE profile_id=?", (profile_id,)
    ).fetchall():
        remove_upload(row["photo_filename"])
    db.execute("DELETE FROM journal_entries WHERE profile_id=?", (profile_id,))
    db.execute("DELETE FROM usage_log WHERE profile_id=?", (profile_id,))
    db.execute("DELETE FROM routine_items WHERE profile_id=?", (profile_id,))
    db.execute("DELETE FROM inventory WHERE profile_id=?", (profile_id,))
    db.execute("DELETE FROM saved_products WHERE profile_id=?", (profile_id,))
    db.execute("DELETE FROM profiles WHERE id=?", (profile_id,))
    db.commit()
    return jsonify({"ok": True})


@app.post("/api/inventory")
def add_inventory():
    data = request.get_json(silent=True) or {}
    db = get_db()
    profile = current_profile(db)

    product_id = data.get("product_id")
    product_id = int(product_id) if isinstance(product_id, int) or str(product_id).isdigit() else None

    if product_id is not None:
        product = db.execute("SELECT * FROM products WHERE id=?", (product_id,)).fetchone()
        if not product:
            return jsonify({"error": "Product not found."}), 404
        # Adding the same library product twice is a no-op, not a duplicate row.
        existing = db.execute(
            "SELECT id FROM inventory WHERE profile_id=? AND product_id=?",
            (profile["id"], product_id)
        ).fetchone()
        if existing:
            return jsonify({"ok": True, "id": existing["id"], "already": True})
        name, brand, category = product["product_name"], product["brand"], product["category"]
        notes = clean_text(data, "notes", "Added from the CLEAR product library.")
    else:
        name = clean_text(data, "product_name")
        if not name:
            return jsonify({"error": "Please enter a product name."}), 400
        brand, category = clean_text(data, "brand"), clean_text(data, "category")
        notes = clean_text(data, "notes")

    opened_on = clean_date(data.get("opened_on"), allow_blank=True)
    if opened_on is None:
        return jsonify({"error": "Please enter a valid opened date."}), 400

    cursor = db.execute("""
        INSERT INTO inventory (profile_id, product_id, product_name, brand, category, notes,
                               ingredients, price, size, opened_on, pao_months)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        profile["id"], product_id, name, brand, category, notes,
        clean_text(data, "ingredients"), clean_text(data, "price"), clean_text(data, "size"),
        opened_on, clean_pao(data.get("pao_months"))
    ))
    db.commit()
    return jsonify({"ok": True, "id": cursor.lastrowid})


@app.patch("/api/inventory/<int:item_id>")
def update_inventory(item_id):
    """Update the details a person records about a product they own (opened date, PAO, etc.)."""
    data = request.get_json(silent=True) or {}
    db = get_db()
    profile = current_profile(db)
    item = db.execute(
        "SELECT * FROM inventory WHERE id=? AND profile_id=?", (item_id, profile["id"])
    ).fetchone()
    if not item:
        return jsonify({"error": "Product not found on this shelf."}), 404

    opened_on = item["opened_on"]
    if "opened_on" in data:
        opened_on = clean_date(data.get("opened_on"), allow_blank=True)
        if opened_on is None:
            return jsonify({"error": "Please enter a valid opened date."}), 400

    db.execute("""
        UPDATE inventory SET opened_on=?, pao_months=?, price=?, size=?, ingredients=?, notes=?
        WHERE id=?
    """, (
        opened_on,
        clean_pao(data["pao_months"]) if "pao_months" in data else item["pao_months"],
        clean_text(data, "price") if "price" in data else item["price"],
        clean_text(data, "size") if "size" in data else item["size"],
        clean_text(data, "ingredients") if "ingredients" in data else item["ingredients"],
        clean_text(data, "notes") if "notes" in data else item["notes"],
        item_id
    ))
    db.commit()
    return jsonify({"ok": True})


@app.delete("/api/inventory/<int:item_id>")
def delete_inventory(item_id):
    db = get_db()
    profile = current_profile(db)
    db.execute("DELETE FROM routine_items WHERE inventory_id=? AND profile_id=?", (item_id, profile["id"]))
    db.execute("DELETE FROM usage_log WHERE inventory_id=? AND profile_id=?", (item_id, profile["id"]))
    db.execute("DELETE FROM inventory WHERE id=? AND profile_id=?", (item_id, profile["id"]))
    db.commit()
    return jsonify({"ok": True})


# ---- Routine tracker -------------------------------------------------------

@app.post("/api/routine")
def add_routine_item():
    data = request.get_json(silent=True) or {}
    slot = clean_text(data, "slot")
    if slot not in ROUTINE_SLOTS:
        return jsonify({"error": "Choose morning, evening or weekly."}), 400

    db = get_db()
    profile = current_profile(db)
    item = db.execute(
        "SELECT id FROM inventory WHERE id=? AND profile_id=?",
        (data.get("inventory_id"), profile["id"])
    ).fetchone()
    if not item:
        return jsonify({"error": "That product is not on this shelf."}), 404

    default_frequency = "Once a week" if slot == "weekly" else "Daily"
    position = db.execute(
        "SELECT COALESCE(MAX(position), 0) + 1 FROM routine_items WHERE profile_id=? AND slot=?",
        (profile["id"], slot)
    ).fetchone()[0]
    try:
        db.execute("""
            INSERT INTO routine_items (profile_id, inventory_id, slot, frequency, position)
            VALUES (?, ?, ?, ?, ?)
        """, (profile["id"], item["id"], slot, clean_text(data, "frequency", default_frequency) or default_frequency, position))
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "That product is already in this routine."}), 409
    return jsonify({"ok": True})


@app.put("/api/routine/<int:routine_id>")
def update_routine_item(routine_id):
    data = request.get_json(silent=True) or {}
    db = get_db()
    profile = current_profile(db)
    db.execute(
        "UPDATE routine_items SET frequency=? WHERE id=? AND profile_id=?",
        (clean_text(data, "frequency")[:40], routine_id, profile["id"])
    )
    db.commit()
    return jsonify({"ok": True})


@app.delete("/api/routine/<int:routine_id>")
def delete_routine_item(routine_id):
    db = get_db()
    profile = current_profile(db)
    db.execute("DELETE FROM routine_items WHERE id=? AND profile_id=?", (routine_id, profile["id"]))
    db.commit()
    return jsonify({"ok": True})


@app.post("/api/usage/<int:item_id>")
def toggle_usage_today(item_id):
    """Mark a product as used today (or undo it). Used to show how often it is really used."""
    db = get_db()
    profile = current_profile(db)
    item = db.execute(
        "SELECT id FROM inventory WHERE id=? AND profile_id=?", (item_id, profile["id"])
    ).fetchone()
    if not item:
        return jsonify({"error": "Product not found on this shelf."}), 404

    today = date.today().isoformat()
    exists = db.execute(
        "SELECT 1 FROM usage_log WHERE inventory_id=? AND used_on=?", (item_id, today)
    ).fetchone()
    if exists:
        db.execute("DELETE FROM usage_log WHERE inventory_id=? AND used_on=?", (item_id, today))
    else:
        db.execute(
            "INSERT INTO usage_log (profile_id, inventory_id, used_on) VALUES (?, ?, ?)",
            (profile["id"], item_id, today)
        )
    db.commit()
    return jsonify({"ok": True, "used": not exists})


# ---- Skin progress journal -------------------------------------------------

@app.post("/api/journal")
def add_journal_entry():
    """Accepts multipart/form-data so an optional photo can be attached."""
    form = request.form
    entry_date = clean_date(form.get("entry_date") or date.today().isoformat())
    if not entry_date:
        return jsonify({"error": "Please choose a valid date."}), 400

    notes = (form.get("notes") or "").strip()[:2000]
    tags = (form.get("tags") or "").strip()[:200]
    try:
        comfort = max(0, min(5, int(form.get("comfort") or 0)))
    except ValueError:
        comfort = 0

    photo_name = ""
    upload = request.files.get("photo")
    if upload and upload.filename:
        data = upload.read(MAX_PHOTO_BYTES + 1)
        if len(data) > MAX_PHOTO_BYTES:
            return jsonify({"error": "That photo is too large (4 MB max)."}), 400
        ext = detect_image_ext(data)
        if not ext:
            return jsonify({"error": "Please upload a JPG, PNG or WebP photo."}), 400
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        photo_name = f"{uuid.uuid4().hex}{ext}"
        (UPLOAD_DIR / photo_name).write_bytes(data)

    if not notes and not comfort and not photo_name and not tags:
        return jsonify({"error": "Add a note, a rating, a tag or a photo."}), 400

    db = get_db()
    profile = current_profile(db)

    # Remember what was in the routine on that day, so changes can be compared later.
    snapshot_rows = db.execute("""
        SELECT r.slot, i.product_name FROM routine_items r
        JOIN inventory i ON i.id = r.inventory_id
        WHERE r.profile_id=? ORDER BY r.slot, r.position
    """, (profile["id"],)).fetchall()
    snapshot = "; ".join(f"{row['slot']}: {row['product_name']}" for row in snapshot_rows)

    cursor = db.execute("""
        INSERT INTO journal_entries (profile_id, entry_date, comfort, tags, notes, photo_filename, routine_snapshot)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (profile["id"], entry_date, comfort, tags, notes, photo_name, snapshot))
    db.commit()
    return jsonify({"ok": True, "id": cursor.lastrowid})


@app.delete("/api/journal/<int:entry_id>")
def delete_journal_entry(entry_id):
    db = get_db()
    profile = current_profile(db)
    row = db.execute(
        "SELECT photo_filename FROM journal_entries WHERE id=? AND profile_id=?",
        (entry_id, profile["id"])
    ).fetchone()
    if row:
        remove_upload(row["photo_filename"])
        db.execute("DELETE FROM journal_entries WHERE id=?", (entry_id,))
        db.commit()
    return jsonify({"ok": True})


@app.get("/uploads/<path:filename>")
def uploaded_photo(filename):
    safe = Path(filename).name
    if safe != filename or not detect_ext_from_name(safe):
        return jsonify({"error": "Not found."}), 404
    response = send_from_directory(UPLOAD_DIR, safe)
    response.headers["Cache-Control"] = "private, max-age=3600"
    return response


def detect_ext_from_name(name):
    return Path(name).suffix.lower() in {".jpg", ".png", ".webp"}


@app.post("/api/feedback")
def submit_feedback():
    data = request.get_json(silent=True) or {}
    product = clean_text(data, "product_name")
    if not product:
        return jsonify({"error": "Please enter the product name."}), 400

    db = get_db()
    db.execute("""
        INSERT INTO feedback (feedback_type, brand, product_name, product_url, message)
        VALUES (?, ?, ?, ?, ?)
    """, (
        clean_text(data, "feedback_type", "product_request") or "product_request",
        clean_text(data, "brand"),
        product,
        clean_text(data, "product_url"),
        clean_text(data, "message")
    ))
    db.commit()
    return jsonify({"ok": True, "message": "Thanks! Your request has been recorded."})


@app.post("/api/saved/<int:product_id>")
def toggle_saved(product_id):
    db = get_db()
    product_exists = db.execute(
        "SELECT 1 FROM products WHERE id=?", (product_id,)
    ).fetchone()
    if not product_exists:
        return jsonify({"error": "Product not found."}), 404

    profile = current_profile(db)
    exists = db.execute(
        "SELECT 1 FROM saved_products WHERE profile_id=? AND product_id=?",
        (profile["id"], product_id)
    ).fetchone()

    if exists:
        db.execute(
            "DELETE FROM saved_products WHERE profile_id=? AND product_id=?",
            (profile["id"], product_id)
        )
        saved = False
    else:
        db.execute(
            "INSERT INTO saved_products (profile_id, product_id) VALUES (?, ?)",
            (profile["id"], product_id)
        )
        saved = True

    db.commit()
    return jsonify({"ok": True, "saved": saved})


@app.post("/api/quiz")
def skin_quiz():
    data = request.get_json(silent=True) or {}
    answers = [
        clean_text(data, key)
        for key in ("tightness", "shine", "breakouts", "sensitivity")
    ]

    if answers[0] == "often" and answers[1] in ("little", "none"):
        result = "Dry"
    elif answers[1] == "all_over":
        result = "Oily"
    elif answers[1] == "t_zone":
        result = "Combination"
    elif answers[3] == "often":
        result = "Sensitive"
    else:
        result = "Normal"

    db = get_db()
    profile = current_profile(db)
    db.execute(
        "UPDATE profiles SET skin_type=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (result, profile["id"])
    )
    db.commit()
    return jsonify({"ok": True, "skin_type": result})


@app.get("/api/products/<int:product_id>")
def product_detail(product_id):
    db = get_db()
    product = db.execute(
        "SELECT * FROM products WHERE id=?", (product_id,)
    ).fetchone()

    if not product:
        return jsonify({"error": "Product not found."}), 404

    result = dict(product)
    result["image_filename"] = safe_image_filename(result.get("image_filename", ""))
    return jsonify(result)


@app.put("/api/products/<int:product_id>")
def update_product(product_id):
    """Fill in or correct a product record (ingredients, size, price, evidence...)."""
    data = request.get_json(silent=True) or {}
    db = get_db()
    row = db.execute("SELECT * FROM products WHERE id=?", (product_id,)).fetchone()
    if not row:
        return jsonify({"error": "Product not found."}), 404

    text_fields = (
        "size", "price", "ingredients", "ingredient_functions", "hazards", "cautions",
        "limitations", "marketing_claims", "evidence_summary", "evidence_status",
        "evidence_sources", "intended_use", "notes"
    )
    values = {field: (clean_text(data, field) if field in data else row[field]) for field in text_fields}
    pao = clean_pao(data["pao_months"]) if "pao_months" in data else row["pao_months"]

    db.execute(f"""
        UPDATE products SET {", ".join(f"{f}=?" for f in text_fields)}, pao_months=? WHERE id=?
    """, (*values.values(), pao, product_id))
    db.commit()
    return jsonify({"ok": True})


@app.post("/api/products")
def create_product():
    data = request.get_json(silent=True) or {}
    product_name = clean_text(data, "product_name")
    category = clean_text(data, "category")

    if not product_name or not category:
        return jsonify({"error": "Product name and category are required."}), 400
    if category not in ALLOWED_CATEGORIES:
        return jsonify({"error": "Please choose a valid product category."}), 400

    image_filename = safe_image_filename(clean_text(data, "image_filename"))
    fields = (
        "product_name", "brand", "category", "size", "price", "ingredients",
        "ingredient_functions", "hazards", "cautions", "limitations",
        "marketing_claims", "evidence_summary", "evidence_status",
        "evidence_sources", "intended_use", "notes"
    )
    values = [product_name if field == "product_name" else
              category if field == "category" else clean_text(data, field)
              for field in fields]

    db = get_db()
    cursor = db.execute("""
        INSERT INTO products (
          product_name, brand, category, size, price, ingredients, ingredient_functions,
          hazards, cautions, limitations, marketing_claims, evidence_summary,
          evidence_status, evidence_sources, intended_use, notes, image_filename
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (*values, image_filename))
    db.commit()
    return jsonify({"ok": True, "id": cursor.lastrowid})


@app.errorhandler(404)
def not_found(error):
    if request.path.startswith("/api/"):
        return jsonify({"error": "The requested item was not found."}), 404
    return error


@app.errorhandler(413)
def too_large(error):
    return jsonify({"error": "The submitted request is too large (6 MB max)."}), 413


@app.errorhandler(500)
def server_error(error):
    return jsonify({"error": "Something went wrong on the server."}), 500


if __name__ == "__main__":
    app.run(debug=True)
