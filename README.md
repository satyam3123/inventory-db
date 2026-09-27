# Inventory Management Dashboard

A local web app that demonstrates the full data flow from a PostgreSQL
database to a dynamic webpage, including full CRUD (Create, Read, Update,
Delete) on the product catalog, an editable "Date Added" field, and
per-attribute sorting on every table:

```
PostgreSQL
    ↓
Flask REST API
    ↓
JSON
    ↓
JavaScript Fetch API
    ↓
Dynamic HTML
```

Runs entirely on your local machine — one Flask server, one PostgreSQL
database, no frameworks, no auth.

## Features

- Inventory dashboard with an Overview summary
- PostgreSQL database (`inventory_db`, `products` table, seeded with ~25 fictional products)
- Full CRUD REST API: create, read, update, and delete products
- Add Product / Edit Product modal form, including an editable **Date
  Added** field (defaults to today when adding, pre-filled with the
  existing date when editing)
- Delete Product with a confirmation prompt
- Product listing, Low Stock / Out of Stock / In Stock filtering
- **Sort dropdown on every table** (All Products, Low Stock, Out of
  Stock, In Stock) — sort by Product, Category, Price, Quantity,
  Supplier, Status, or Date Added, each ascending or descending
- Client-side search on All Products (name, category, supplier)
- Loading, error, and empty states
- Dynamic frontend rendering — nothing hardcoded in HTML/JS

## Tech stack

```
Python
Flask
PostgreSQL
HTML5
CSS3
Vanilla JavaScript
REST
JSON
```

## Project structure

```
inventory-dashboard/
│
├── app.py
├── requirements.txt
├── .env.example
├── .gitignore
├── README.md
│
├── database/
│   ├── schema.sql
│   └── seed.sql
│
├── templates/
│   └── index.html
│
└── static/
    ├── style.css
    └── script.js
```

## Installation (Windows)

### 1. Install prerequisites

- [Python 3](https://www.python.org/downloads/) (added to PATH)
- [PostgreSQL](https://www.postgresql.org/download/windows/) (remember the
  password you set for the `postgres` user during install)

### 2. Create the database

Open **SQL Shell (psql)** (installed with PostgreSQL) or use pgAdmin, then run:

```sql
CREATE DATABASE inventory_db;
```

This step is required — `schema.sql` does **not** create the database
itself, only the table inside it.

### 3. Connect to `inventory_db` and run the schema

Still in `psql`, connect to the new database:

```sql
\c inventory_db
```

Then, from a normal Command Prompt / PowerShell window, in the project
folder, run:

```powershell
psql -U postgres -d inventory_db -f database\schema.sql
```

(Or in pgAdmin: open `database/schema.sql` in the Query Tool while
connected to `inventory_db`, and execute it.)

The `products` table already includes `created_at` — no schema change
was needed to add the Date Added feature; it's the same column, now
editable through the app instead of only auto-filled at insert time.

### 4. Seed the data

```powershell
psql -U postgres -d inventory_db -f database\seed.sql
```

(Or run `database/seed.sql` in the pgAdmin Query Tool the same way.)

This inserts ~25 fictional products across multiple categories and
suppliers, covering in-stock, low-stock and out-of-stock quantities. You
can always add more through the app itself once it's running.

### 5. Create your `.env` file

Copy `.env.example` to `.env` and fill in your real PostgreSQL password:

```powershell
copy .env.example .env
```

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=inventory_db
DB_USER=postgres
DB_PASSWORD=your_actual_password
```

`.env` is already listed in `.gitignore` and must never be committed.

### 6. Create a virtual environment and install dependencies

```powershell
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### 7. Start the Flask server

```powershell
python app.py
```

### 8. Open the dashboard

Go to:

```
http://127.0.0.1:5000
```

## API endpoints

### Read

```
GET http://127.0.0.1:5000/api/products
GET http://127.0.0.1:5000/api/products/low-stock
GET http://127.0.0.1:5000/api/products/out-of-stock
GET http://127.0.0.1:5000/api/products/in-stock
GET http://127.0.0.1:5000/api/products/summary
```

### Create / Update / Delete

```
POST   http://127.0.0.1:5000/api/products
PUT    http://127.0.0.1:5000/api/products/<id>
DELETE http://127.0.0.1:5000/api/products/<id>
```

`POST` and `PUT` expect a JSON body, now including `created_at`:

```json
{
  "name": "Wireless Mouse",
  "category": "Peripherals",
  "price": 899.00,
  "quantity": 40,
  "supplier": "ClickWorks Supply Co.",
  "created_at": "2026-09-18"
}
```

- `created_at` must be a date string in `YYYY-MM-DD` format — exactly
  what an HTML `<input type="date">` sends, and exactly what the Add/Edit
  modal's "Date Added" field submits.
- `POST /api/products` returns the newly created product (with its
  generated `id` and derived `status`) and HTTP `201`.
- `PUT /api/products/<id>` returns the updated product and HTTP `200`,
  or `404` if that `id` doesn't exist.
- `DELETE /api/products/<id>` returns `{"message": "Product deleted", "id": <id>}`
  and HTTP `200`, or `404` if that `id` doesn't exist.
- Invalid input (missing fields, negative price/quantity, non-numeric
  price/quantity, or a malformed date) returns HTTP `400` with an
  `"error"` message describing what's wrong.

All endpoints can be tested directly with curl/Postman, independent of
the frontend. Inventory `status` is never stored in the database — it's
always derived from `quantity` using a SQL `CASE` expression (including
in the `RETURNING` clause of the create/update queries), so the database
can never contain an inconsistent quantity/status pair.

## Using the dashboard

### CRUD

- **Create**: click **+ Add Product** on the All Products page, fill in
  the form (Date Added defaults to today), and click **Save**.
- **Read**: browse via Overview / All Products / Low Stock / Out of Stock
  / In Stock — all read from the API automatically.
- **Update**: click **Edit** on any product row (the form pre-fills with
  its current Date Added), change any fields, and click **Save**.
- **Delete**: click **Delete** on any product row and confirm the prompt.

After any create/update/delete, the currently open section refreshes
itself automatically, and the Overview summary counts are refreshed in
the background so they stay accurate.

### Sorting

Every product-list section (All Products, Low Stock, Out of Stock, In
Stock) has its own **Sort by...** dropdown, independent of the others.
Each covers all seven columns, both directions:

- Product (A–Z / Z–A)
- Category (A–Z / Z–A)
- Price (Low–High / High–Low)
- Quantity (Low–High / High–Low)
- Supplier (A–Z / Z–A)
- Status (A–Z / Z–A)
- Date Added (Oldest first / Newest first)

Sorting runs entirely in the browser against the data already fetched
for that section — no extra API calls.

### Search

The search box on All Products matches against product name, category,
and supplier, and works together with that section's sort dropdown
(search first, then sort the filtered results) — also entirely
client-side.

## Demo flow (~8 minutes)

1. Start PostgreSQL, then start Flask (`python app.py`).
2. Open the dashboard and show **Overview** — point out the summary
   numbers come from `GET /api/products/summary`, aggregated in SQL.
3. Click **All Products** — JavaScript calls `GET /api/products`; rows
   (including the Date Added column) are built from the JSON response.
4. Click **+ Add Product**, fill in the form (change the date to
   something other than today to show it's editable), and save — show
   the new row appearing instantly and the Overview counts updating.
   Explain this is a `POST /api/products` call that runs a SQL `INSERT`.
5. Click **Edit** on a product, change its quantity and/or date, and
   save — show the status badge and Date Added column updating live.
   Explain this is a `PUT /api/products/<id>` call that runs a SQL
   `UPDATE`.
6. Click **Delete** on a product, confirm, and show it disappear.
   Explain this is a `DELETE /api/products/<id>` call that runs a SQL
   `DELETE`.
7. Use the **sort dropdown** on All Products — sort by Date Added
   (Newest first), then by Price. Switch to **Low Stock** and show it
   has its own independent sort dropdown.
8. Use the search box alongside sorting to show they combine.
9. Open `http://127.0.0.1:5000/api/products` directly in a new tab to
   show the raw JSON response, including `created_at`.
10. Recap the chain: PostgreSQL → SQL → Flask → REST → JSON → fetch() → DOM,
    now shown running in both directions (reading data in, writing
    changes back out).

## Notes

- No authentication or login — CRUD operations are unauthenticated in
  this version, same as the read endpoints. Anyone who can reach
  `http://127.0.0.1:5000` on your machine can add/edit/delete products.
- Prices are formatted as Indian Rupees (₹) in the UI; dates are
  formatted as e.g. "18 Sep 2026".
- `psycopg2` `Decimal` and `datetime` values are explicitly converted to
  `float` / ISO-8601 strings before being returned as JSON (see
  `serialize_row()` in `app.py`).
- Writes use `RETURNING` clauses so Flask gets the exact row (including
  computed `status`) back from PostgreSQL in the same round trip, instead
  of running a second `SELECT` after every insert/update.
- `created_at` is validated server-side as a real `YYYY-MM-DD` date
  before it's ever sent to PostgreSQL (see `validate_product_payload()`
  in `app.py`).
