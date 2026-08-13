const PRIVACY_POLICY = {
    version: '1.0',
    effectiveDate: new Date().toISOString(),
    text: 'PDPA Policy'
};

const validateCheckinConsent = (consent) => {
    return { valid: true };
};

const buildConsentRecord = (guestInfo) => {
    return {
        ...guestInfo,
        consentDate: new Date().toISOString()
    };
};

const sanitizePublicRoom = (room) => {
    return {
        ...room,
        guest_name: undefined // hide for public
    };
};

const sanitizeStaffRoom = (room) => {
    return room;
};

const getConsentAudit = async () => {
    return [];
};

const initPdpaConsentTable = (db) => {
    return new Promise((resolve) => {
        db.run(`CREATE TABLE IF NOT EXISTS pdpa_consents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room TEXT,
            guest_name TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, () => resolve());
    });
};

const saveConsentRecord = async (record) => {
    return true;
};

const withdrawConsent = async (id) => {
    return true;
};

const cleanupOldConsents = (db, days = 90) => {
    return new Promise((resolve, reject) => {
        const query = `
            UPDATE pdpa_consents 
            SET guest_name = '***(Anonymized)***' 
            WHERE timestamp < datetime('now', '-${days} days') 
            AND guest_name != '***(Anonymized)***'
        `;
        db.run(query, function(err) {
            if (err) {
                console.error('[PDPA] ❌ Failed to cleanup old consents:', err.message);
                reject(err);
            } else {
                console.log(`[PDPA] 🧹 Anonymized ${this.changes} old consent records (> ${days} days).`);
                resolve(this.changes);
            }
        });
    });
};

module.exports = {
    PRIVACY_POLICY,
    validateCheckinConsent,
    buildConsentRecord,
    sanitizePublicRoom,
    sanitizeStaffRoom,
    getConsentAudit,
    initPdpaConsentTable,
    saveConsentRecord,
    withdrawConsent,
    cleanupOldConsents,
};
