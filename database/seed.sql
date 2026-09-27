-- seed.sql
-- Run this AFTER schema.sql. Inserts ~25 fictional products covering
-- every stock state (0, 1-5, >5), multiple categories, suppliers and
-- price points so the dashboard filters/summary are meaningful.

INSERT INTO products (name, category, price, quantity, supplier) VALUES
-- In Stock (quantity > 5)
('Laptop 14" Pro',           'Electronics',      68999.00, 18, 'NovaTech Distributors'),
('Desktop Monitor 24"',      'Electronics',       9499.00, 22, 'NovaTech Distributors'),
('Wireless Mouse',           'Peripherals',        899.00, 65, 'ClickWorks Supply Co.'),
('Mechanical Keyboard',      'Peripherals',       3499.00, 34, 'ClickWorks Supply Co.'),
('USB-C Hub',                'Accessories',       1899.00, 47, 'ConnectPoint Traders'),
('Webcam 1080p',             'Electronics',       2299.00, 26, 'NovaTech Distributors'),
('Wired Headphones',         'Accessories',       1299.00, 40, 'AudioLine Wholesale'),
('External HDD 2TB',         'Storage',           4999.00, 15, 'DataVault Supplies'),
('Wi-Fi Router AC1200',      'Networking',        2799.00, 12, 'NetGear Solutions'),
('Ethernet Cable 10m',       'Networking',         349.00, 90, 'NetGear Solutions'),
('HDMI Cable 2m',            'Accessories',        299.00, 75, 'ConnectPoint Traders'),
('Power Bank 20000mAh',      'Electronics',       1999.00, 30, 'AudioLine Wholesale'),
('Laptop Stand',             'Office Equipment',  1199.00, 28, 'DeskPro Furnishings'),
('Desk Lamp LED',            'Office Equipment',   899.00, 20, 'DeskPro Furnishings'),

-- Low Stock (quantity 1-5)
('External SSD 1TB',         'Storage',           6999.00,  4, 'DataVault Supplies'),
('Bluetooth Speaker',        'Electronics',       2499.00,  3, 'AudioLine Wholesale'),
('Tablet 10"',                'Electronics',      24999.00,  2, 'NovaTech Distributors'),
('Network Switch 8-Port',    'Networking',        1899.00,  5, 'NetGear Solutions'),
('Wireless Earbuds',         'Accessories',       3299.00,  1, 'AudioLine Wholesale'),
('Office Chair Ergonomic',   'Office Equipment', 12999.00,  3, 'DeskPro Furnishings'),

-- Out of Stock (quantity = 0)
('Graphics Tablet',          'Peripherals',       5499.00,  0, 'ClickWorks Supply Co.'),
('Laser Printer',            'Office Equipment', 15999.00,  0, 'DeskPro Furnishings'),
('4K Webcam',                'Electronics',       5999.00,  0, 'NovaTech Distributors'),
('USB Microphone',           'Peripherals',       3999.00,  0, 'ClickWorks Supply Co.'),
('Docking Station',          'Accessories',       6499.00,  0, 'ConnectPoint Traders');
