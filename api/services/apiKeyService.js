const { randomBytes } = require('crypto');
const db = require('../db');

function initApiKeyDb() {
    db.db.serialize(() => {
        db.db.run(`CREATE TABLE IF NOT EXISTS api_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            key TEXT UNIQUE NOT NULL,
            created_at TEXT NOT NULL,
            last_used_at TEXT,
            is_active BOOLEAN NOT NULL DEFAULT 1
        )`);
    });
}

function generateApiKey() {
    return 'sk_' + randomBytes(24).toString('hex');
}

function createApiKey(name, callback) {
    const key = generateApiKey();
    const createdAt = new Date().toISOString();
    db.db.run(
        "INSERT INTO api_keys (name, key, created_at, is_active) VALUES (?, ?, ?, 1)",
        [name, key, createdAt],
        function (err) {
            callback(err, { id: this.lastID, name, key, createdAt, isActive: true });
        }
    );
}

function listApiKeys(callback) {
    db.db.all("SELECT id, name, substr(key, 1, 8) || '...' as key_prefix, created_at, last_used_at, is_active FROM api_keys", [], (err, rows) => {
        // map boolean
        const formatted = rows ? rows.map(r => ({ ...r, is_active: r.is_active === 1 })) : [];
        callback(err, formatted);
    });
}

function revokeApiKey(id, callback) {
    db.db.run("UPDATE api_keys SET is_active = 0 WHERE id = ?", [id], function(err) {
        callback(err, { changes: this.changes });
    });
}

function validateApiKey(key, callback) {
    db.db.get("SELECT * FROM api_keys WHERE key = ? AND is_active = 1", [key], (err, row) => {
        if (err || !row) {
            callback(err, false);
        } else {
            // Update last used
            db.db.run("UPDATE api_keys SET last_used_at = ? WHERE id = ?", [new Date().toISOString(), row.id]);
            callback(null, true);
        }
    });
}

module.exports = {
    initApiKeyDb,
    createApiKey,
    listApiKeys,
    revokeApiKey,
    validateApiKey
};
