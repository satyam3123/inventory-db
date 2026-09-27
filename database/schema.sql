-- schema.sql
-- Run this AFTER creating and connecting to the inventory_db database.
-- Defines the products table. Status is intentionally NOT stored as a
-- column; it is always derived from `quantity` at query time so the
-- database can never hold an inconsistent quantity/status combination.

DROP TABLE IF EXISTS products;

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    price NUMERIC(10,2) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    supplier VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
