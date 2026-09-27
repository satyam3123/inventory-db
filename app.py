"""
app.py

Flask REST API + frontend server for the Inventory Management Dashboard.

Data flow:
    PostgreSQL -> SQL queries -> Flask REST API -> JSON -> JavaScript fetch() -> DOM

This version implements full CRUD (Create, Read, Update, Delete) on the
`products` resource, and treats `created_at` ("Date Added") as a normal,
user-editable field rather than a purely automatic timestamp:

    GET    /api/products                 list all products
    GET    /api/products/low-stock       list products with quantity 1-5
    GET    /api/products/out-of-stock    list products with quantity = 0
    GET    /api/products/in-stock        list products with quantity > 5
    GET    /api/products/summary         aggregate counts for Overview
    POST   /api/products                 create a new product
    PUT    /api/products/<id>            update an existing product
    DELETE /api/products/<id>            delete a product

Kept intentionally in one file, with plain SQL strings and no ORM, so the
database -> API -> frontend relationship stays easy to read and explain.
"""

import os
import logging
from datetime import datetime, date
from decimal import Decimal

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

load_dotenv()  # reads .env into environment variables

app = Flask(__name__)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("inventory-dashboard")

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": os.getenv("DB_PORT", "5432"),
    "dbname": os.getenv("DB_NAME", "inventory_db"),
    "user": os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD", ""),
}


def get_db_connection():
    """Open a new PostgreSQL connection using values loaded from .env."""
    return psycopg2.connect(**DB_CONFIG)


def run_query(query, params=None):
    """
    Run a SELECT query and return a list of plain dicts.

    Opens a connection + RealDictCursor, runs the query, and makes sure
    both the cursor and the connection are closed afterwards, even if an
    error is raised.
    """
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query, params or ())
            rows = cur.fetchall()
            return [dict(row) for row in rows]
    finally:
        if conn is not None:
            conn.close()


def run_write(query, params=None, fetch_one=False):
    """
    Run an INSERT/UPDATE/DELETE statement and commit it.

    Used for every write operation (create/update/delete). If the query
    ends with a RETURNING clause, pass fetch_one=True to get that row
    back as a dict (or None if no row matched, e.g. deleting an id that
    doesn't exist). Rolls back on error so a failed write never leaves a
    half-applied change in the database.
    """
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query, params or ())
            result = dict(cur.fetchone()) if (fetch_one and cur.rowcount) else None
        conn.commit()
        return result
    except Exception:
        if conn is not None:
            conn.rollback()
        raise
    finally:
        if conn is not None:
            conn.close()


def serialize_row(row):
    """
    Convert a single row dict into JSON-safe types.

    psycopg2 returns NUMERIC columns as Decimal and TIMESTAMP columns as
    datetime objects, neither of which the json module can serialize by
    default, so both are converted explicitly here.
    """
    clean = {}
    for key, value in row.items():
        if isinstance(value, Decimal):
            clean[key] = float(value)
        elif isinstance(value, (datetime, date)):
            clean[key] = value.isoformat()
        else:
            clean[key] = value
    return clean


def serialize_rows(rows):
    return [serialize_row(row) for row in rows]


def validate_product_payload(data):
    """
    Validate the JSON body sent for creating/updating a product.

    Returns a list of human-readable error strings; an empty list means
    the payload is valid. `created_at` ("Date Added") is required and
    must be a real calendar date in YYYY-MM-DD format, which is exactly
    what an HTML <input type="date"> sends.
    """
    errors = []
    required_fields = ["name", "category", "price", "quantity", "supplier", "created_at"]

    for field in required_fields:
        if field not in data or data[field] in (None, ""):
            errors.append(f"'{field}' is required")

    for text_field in ("name", "category", "supplier"):
        value = data.get(text_field)
        if value not in (None, "") and not str(value).strip():
            errors.append(f"'{text_field}' cannot be blank")

    if data.get("price") not in (None, ""):
        try:
            if float(data["price"]) < 0:
                errors.append("'price' must be zero or greater")
        except (TypeError, ValueError):
            errors.append("'price' must be a number")

    if data.get("quantity") not in (None, ""):
        try:
            if int(data["quantity"]) < 0:
                errors.append("'quantity' must be zero or greater")
        except (TypeError, ValueError):
            errors.append("'quantity' must be a whole number")

    if data.get("created_at") not in (None, ""):
        try:
            datetime.strptime(str(data["created_at"]), "%Y-%m-%d")
        except ValueError:
            errors.append("'created_at' must be a valid date (YYYY-MM-DD)")

    return errors


# ---------------------------------------------------------------------------
# SQL (kept as plain strings so the queries are easy to read and demo)
# ---------------------------------------------------------------------------

STATUS_CASE = """
    CASE
        WHEN quantity = 0 THEN 'Out of Stock'
        WHEN quantity BETWEEN 1 AND 5 THEN 'Low Stock'
        ELSE 'In Stock'
    END AS status
"""

ALL_PRODUCTS_SQL = f"""
    SELECT id, name, category, created_at, price, quantity, supplier, {STATUS_CASE}
    FROM products
    ORDER BY id;
"""

LOW_STOCK_SQL = f"""
    SELECT id, name, category, created_at, price, quantity, supplier, {STATUS_CASE}
    FROM products
    WHERE quantity BETWEEN 1 AND 5
    ORDER BY quantity ASC;
"""

OUT_OF_STOCK_SQL = f"""
    SELECT id, name, category, created_at, price, quantity, supplier, {STATUS_CASE}
    FROM products
    WHERE quantity = 0
    ORDER BY name;
"""

IN_STOCK_SQL = f"""
    SELECT id, name, category, created_at, price, quantity, supplier, {STATUS_CASE}
    FROM products
    WHERE quantity > 5
    ORDER BY quantity DESC;
"""

SUMMARY_SQL = """
    SELECT
        COUNT(*) AS total_products,
        COALESCE(SUM(quantity), 0) AS total_quantity,
        COUNT(*) FILTER (WHERE quantity BETWEEN 1 AND 5) AS low_stock,
        COUNT(*) FILTER (WHERE quantity = 0) AS out_of_stock,
        COUNT(*) FILTER (WHERE quantity > 5) AS in_stock
    FROM products;
"""

INSERT_PRODUCT_SQL = f"""
    INSERT INTO products (name, category, price, quantity, supplier, created_at)
    VALUES (%s, %s, %s, %s, %s, %s)
    RETURNING id, name, category, created_at, price, quantity, supplier, {STATUS_CASE};
"""

UPDATE_PRODUCT_SQL = f"""
    UPDATE products
    SET name = %s, category = %s, price = %s, quantity = %s, supplier = %s, created_at = %s
    WHERE id = %s
    RETURNING id, name, category, created_at, price, quantity, supplier, {STATUS_CASE};
"""

DELETE_PRODUCT_SQL = """
    DELETE FROM products
    WHERE id = %s
    RETURNING id;
"""


# ---------------------------------------------------------------------------
# Frontend route
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    """Serve the single-page dashboard. All data loading happens via fetch()."""
    return render_template("index.html")


# ---------------------------------------------------------------------------
# REST API routes - READ
# ---------------------------------------------------------------------------

@app.route("/api/products", methods=["GET"])
def get_products():
    try:
        rows = run_query(ALL_PRODUCTS_SQL)
        return jsonify(serialize_rows(rows)), 200
    except Exception as exc:  # noqa: BLE001 - log and return a safe message
        logger.exception("Error fetching all products: %s", exc)
        return jsonify({"error": "Unable to retrieve products"}), 500


@app.route("/api/products/low-stock", methods=["GET"])
def get_low_stock_products():
    try:
        rows = run_query(LOW_STOCK_SQL)
        return jsonify(serialize_rows(rows)), 200
    except Exception as exc:  # noqa: BLE001
        logger.exception("Error fetching low-stock products: %s", exc)
        return jsonify({"error": "Unable to retrieve low-stock products"}), 500


@app.route("/api/products/out-of-stock", methods=["GET"])
def get_out_of_stock_products():
    try:
        rows = run_query(OUT_OF_STOCK_SQL)
        return jsonify(serialize_rows(rows)), 200
    except Exception as exc:  # noqa: BLE001
        logger.exception("Error fetching out-of-stock products: %s", exc)
        return jsonify({"error": "Unable to retrieve out-of-stock products"}), 500


@app.route("/api/products/in-stock", methods=["GET"])
def get_in_stock_products():
    try:
        rows = run_query(IN_STOCK_SQL)
        return jsonify(serialize_rows(rows)), 200
    except Exception as exc:  # noqa: BLE001
        logger.exception("Error fetching in-stock products: %s", exc)
        return jsonify({"error": "Unable to retrieve in-stock products"}), 500


@app.route("/api/products/summary", methods=["GET"])
def get_summary():
    try:
        rows = run_query(SUMMARY_SQL)
        summary = serialize_row(rows[0]) if rows else {
            "total_products": 0,
            "total_quantity": 0,
            "low_stock": 0,
            "out_of_stock": 0,
            "in_stock": 0,
        }
        return jsonify(summary), 200
    except Exception as exc:  # noqa: BLE001
        logger.exception("Error fetching summary: %s", exc)
        return jsonify({"error": "Unable to retrieve summary"}), 500


# ---------------------------------------------------------------------------
# REST API routes - CREATE / UPDATE / DELETE
# ---------------------------------------------------------------------------

@app.route("/api/products", methods=["POST"])
def create_product():
    data = request.get_json(silent=True) or {}

    errors = validate_product_payload(data)
    if errors:
        return jsonify({"error": "; ".join(errors)}), 400

    try:
        params = (
            str(data["name"]).strip(),
            str(data["category"]).strip(),
            float(data["price"]),
            int(data["quantity"]),
            str(data["supplier"]).strip(),
            str(data["created_at"]).strip(),
        )
        new_row = run_write(INSERT_PRODUCT_SQL, params, fetch_one=True)
        return jsonify(serialize_row(new_row)), 201
    except Exception as exc:  # noqa: BLE001
        logger.exception("Error creating product: %s", exc)
        return jsonify({"error": "Unable to create product"}), 500


@app.route("/api/products/<int:product_id>", methods=["PUT"])
def update_product(product_id):
    data = request.get_json(silent=True) or {}

    errors = validate_product_payload(data)
    if errors:
        return jsonify({"error": "; ".join(errors)}), 400

    try:
        params = (
            str(data["name"]).strip(),
            str(data["category"]).strip(),
            float(data["price"]),
            int(data["quantity"]),
            str(data["supplier"]).strip(),
            str(data["created_at"]).strip(),
            product_id,
        )
        updated_row = run_write(UPDATE_PRODUCT_SQL, params, fetch_one=True)
        if updated_row is None:
            return jsonify({"error": f"Product {product_id} not found"}), 404
        return jsonify(serialize_row(updated_row)), 200
    except Exception as exc:  # noqa: BLE001
        logger.exception("Error updating product %s: %s", product_id, exc)
        return jsonify({"error": "Unable to update product"}), 500


@app.route("/api/products/<int:product_id>", methods=["DELETE"])
def delete_product(product_id):
    try:
        deleted_row = run_write(DELETE_PRODUCT_SQL, (product_id,), fetch_one=True)
        if deleted_row is None:
            return jsonify({"error": f"Product {product_id} not found"}), 404
        return jsonify({"message": "Product deleted", "id": product_id}), 200
    except Exception as exc:  # noqa: BLE001
        logger.exception("Error deleting product %s: %s", product_id, exc)
        return jsonify({"error": "Unable to delete product"}), 500


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Localhost-only development server.
    app.run(host="127.0.0.1", port=5000, debug=True)
