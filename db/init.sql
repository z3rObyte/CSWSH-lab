-- init.sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    balance REAL,
    iban TEXT
);

-- victim:pass123 - attacker:haxxor1
INSERT INTO users (username, password, balance, iban)
VALUES
    ('victim', '$2b$10$G2BWjwfDEi..I8AN2LswvuzC9yRWMjnMV64cI3/PgFZKGe7AlG.D6', 1720, 'ES1234567890123456789012'),
    ('attacker', '$2b$10$g5jYJisvf30/8kZbJxBocOuFlACGW6pFHvOZGiEmhWLZ8s/0c116.', 50, 'ES9876543210987654321098');