from flask import Flask, render_template, request, jsonify
from database import init_db, get_db

app = Flask(__name__)
app.config["JSON_SORT_KEYS"] = False

with app.app_context():
    init_db()

@app.get("/")
def home():
    return render_template("index.html")

@app.get("/api/bootstrap")
def bootstrap():
    db = get_db()
    profile = db.execute("SELECT * FROM profile WHERE id=1").fetchone()
    products = db.execute("SELECT * FROM products ORDER BY category, id").fetchall()
    inventory = db.execute("""
        SELECT inventory.id, inventory.product_name, inventory.brand, inventory.category,
               inventory.notes, inventory.created_at
        FROM inventory ORDER BY inventory.created_at DESC
    """).fetchall()
    saved = db.execute("SELECT product_id FROM saved_products").fetchall()
    return jsonify({
        "profile": dict(profile) if profile else {},
        "products": [dict(p) for p in products],
        "inventory": [dict(i) for i in inventory],
        "saved": [r["product_id"] for r in saved]
    })

@app.put("/api/profile")
def update_profile():
    data = request.get_json(force=True)
    db = get_db()
    db.execute("""
        UPDATE profile SET skin_type=?, allergies=?, skin_conditions=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=1
    """, (
        data.get("skin_type", "").strip(),
        data.get("allergies", "").strip(),
        data.get("skin_conditions", "").strip()
    ))
    db.commit()
    return jsonify({"ok": True})

@app.post("/api/inventory")
def add_inventory():
    data = request.get_json(force=True)
    name = data.get("product_name", "").strip()
    if not name:
        return jsonify({"error": "Please enter a product name."}), 400
    db = get_db()
    cur = db.execute("""
        INSERT INTO inventory (product_name, brand, category, notes)
        VALUES (?, ?, ?, ?)
    """, (name, data.get("brand", "").strip(), data.get("category", ""), data.get("notes", "").strip()))
    db.commit()
    return jsonify({"ok": True, "id": cur.lastrowid})

@app.delete("/api/inventory/<int:item_id>")
def delete_inventory(item_id):
    db = get_db()
    db.execute("DELETE FROM inventory WHERE id=?", (item_id,))
    db.commit()
    return jsonify({"ok": True})

@app.post("/api/feedback")
def submit_feedback():
    data = request.get_json(force=True)
    product = data.get("product_name", "").strip()
    if not product:
        return jsonify({"error": "Please enter the product name."}), 400
    db = get_db()
    db.execute("""
        INSERT INTO feedback (feedback_type, brand, product_name, product_url, message)
        VALUES (?, ?, ?, ?, ?)
    """, (
        data.get("feedback_type", "product_request"),
        data.get("brand", "").strip(), product,
        data.get("product_url", "").strip(), data.get("message", "").strip()
    ))
    db.commit()
    return jsonify({"ok": True, "message": "Thanks! Your request has been recorded."})

@app.post("/api/saved/<int:product_id>")
def toggle_saved(product_id):
    db = get_db()
    exists = db.execute("SELECT 1 FROM saved_products WHERE product_id=?", (product_id,)).fetchone()
    if exists:
        db.execute("DELETE FROM saved_products WHERE product_id=?", (product_id,))
        saved = False
    else:
        db.execute("INSERT INTO saved_products (product_id) VALUES (?)", (product_id,))
        saved = True
    db.commit()
    return jsonify({"ok": True, "saved": saved})

@app.post("/api/quiz")
def skin_quiz():
    data = request.get_json(force=True)
    answers = [data.get(k, "") for k in ("tightness", "shine", "breakouts", "sensitivity")]
    # A simple educational starting-point quiz, not a diagnosis.
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
    db.execute("UPDATE profile SET skin_type=?, updated_at=CURRENT_TIMESTAMP WHERE id=1", (result,))
    db.commit()
    return jsonify({"ok": True, "skin_type": result})

@app.get("/api/products/<int:product_id>")
def product_detail(product_id):
    db = get_db()
    product = db.execute("SELECT * FROM products WHERE id=?", (product_id,)).fetchone()
    if not product:
        return jsonify({"error": "Product not found."}), 404
    return jsonify(dict(product))

@app.post("/api/products")
def create_product():
    data = request.get_json(force=True)
    required = ("product_name", "category")
    if any(not data.get(k, "").strip() for k in required):
        return jsonify({"error": "Product name and category are required."}), 400
    db = get_db()
    cur = db.execute("""
        INSERT INTO products (
          product_name, brand, category, size, price, ingredients, ingredient_functions,
          hazards, cautions, limitations, marketing_claims, evidence_summary,
          evidence_status, evidence_sources, intended_use, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, tuple(data.get(k, "") for k in (
        "product_name", "brand", "category", "size", "price", "ingredients",
        "ingredient_functions", "hazards", "cautions", "limitations",
        "marketing_claims", "evidence_summary", "evidence_status",
        "evidence_sources", "intended_use", "notes"
    )))
    db.commit()
    return jsonify({"ok": True, "id": cur.lastrowid})

@app.errorhandler(500)
def server_error(error):
    return jsonify({"error": "Something went wrong on the server."}), 500

if __name__ == "__main__":
    app.run(debug=True)
