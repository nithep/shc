const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'hotel.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to SQLite database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initDb();
    }
});

function initDb() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS rooms (
            id INTEGER PRIMARY KEY,
            status TEXT NOT NULL,
            power BOOLEAN NOT NULL,
            guest_name TEXT,
            guest_email TEXT,
            consent_given_at TEXT,
            consent_ip TEXT,
            checkout_date TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id INTEGER NOT NULL,
            guest_name TEXT NOT NULL,
            status TEXT DEFAULT 'pending_binding',
            binding_token TEXT UNIQUE,
            guest_line_id TEXT,
            guest_session_id TEXT,
            checkin_date TEXT,
            checkout_date TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Check and migrate columns if table already existed but is missing PDPA columns
        db.all("PRAGMA table_info(rooms)", (err, columns) => {
            if (err) {
                console.error("Error reading table info:", err.message);
                return;
            }
            const colNames = columns.map(c => c.name);
            const migrations = [
                { name: 'branch_id', type: 'TEXT DEFAULT "branch_01"' },
                { name: 'guest_name', type: 'TEXT' },
                { name: 'guest_email', type: 'TEXT' },
                { name: 'consent_given_at', type: 'TEXT' },
                { name: 'consent_ip', type: 'TEXT' },
                { name: 'checkout_date', type: 'TEXT' }
            ];

            migrations.forEach(m => {
                if (!colNames.includes(m.name)) {
                    console.log(`[DB] Migrating: Adding column ${m.name}...`);
                    db.run(`ALTER TABLE rooms ADD COLUMN ${m.name} ${m.type}`, (alterErr) => {
                        if (alterErr) {
                            console.error(`[DB] Migration failed for column ${m.name}:`, alterErr.message);
                        } else {
                            console.log(`[DB] Column ${m.name} added successfully.`);
                        }
                    });
                }
            });
        });

        // Seed initial data if empty
        db.get("SELECT COUNT(*) AS count FROM rooms", (err, row) => {
            if (err) {
                console.error("Error checking room count:", err.message);
                return;
            }
            if (row && row.count === 0) {
                const initialRooms = [
                    { id: 101, status: 'occupied', power: true, guest_name: 'คุณสมชาย (Mock Data)' },
                    { id: 102, status: 'vacant', power: false },
                    { id: 103, status: 'vacant', power: false },
                    { id: 104, status: 'vacant', power: false },
                    { id: 105, status: 'vacant', power: false },
                    { id: 106, status: 'vacant', power: false }
                ];
                initialRooms.forEach(room => {
                    const gName = room.guest_name || null;
                    db.run("INSERT INTO rooms (id, status, power, guest_name) VALUES (?, ?, ?, ?)", [room.id, room.status, room.power, gName]);
                });

                // Seed mock bookings
                db.run(`INSERT INTO bookings (room_id, guest_name, status, checkin_date, checkout_date) 
                        VALUES (101, 'คุณสมชาย (Mock Data)', 'bound', datetime('now'), datetime('now', '+1 day'))`);
                db.run(`INSERT INTO bookings (room_id, guest_name, status, checkin_date, checkout_date) 
                        VALUES (102, 'คุณสมหญิง (Mock Data)', 'pending_binding', datetime('now', '+1 day'), datetime('now', '+2 days'))`);

                console.log('Database seeded with initial rooms and mock bookings.');
            }
        });
    });
}

function getAllRooms(callback) {
    db.all("SELECT * FROM rooms", [], (err, rows) => {
        // SQLite stores boolean as 0/1, let's map it back to true/false
        const formattedRows = rows ? rows.map(r => ({ ...r, power: r.power === 1 })) : [];
        callback(err, formattedRows);
    });
}

function updateRoomState(id, status, power, options = {}, callback) {
    // Check if options is a function (fallback for old calls)
    const cb = typeof options === 'function' ? options : callback;
    const opts = typeof options === 'function' ? {} : options;

    if (status === 'vacant') {
        // Data Anonymization on checkout (PDPA)
        db.run(
            "UPDATE rooms SET status = ?, power = ?, guest_name = NULL, guest_email = NULL, consent_given_at = NULL, consent_ip = NULL, checkout_date = NULL WHERE id = ?",
            [status, power ? 1 : 0, id],
            function (err) {
                cb(err, { changes: this.changes });
            }
        );
    } else {
        // On Check-in
        db.run(
            "UPDATE rooms SET status = ?, power = ?, guest_name = ?, guest_email = ?, consent_given_at = ?, consent_ip = ?, checkout_date = ? WHERE id = ?",
            [status, power ? 1 : 0, opts.guestName || null, opts.guestEmail || null, opts.consentGivenAt || null, opts.consentIp || null, opts.checkoutDate || null, id],
            function (err) {
                cb(err, { changes: this.changes });
            }
        );
    }
}

function extendRoomStay(id, newCheckoutDate, callback) {
    db.run(
        "UPDATE rooms SET checkout_date = ? WHERE id = ?",
        [newCheckoutDate, id],
        function (err) {
            callback(err, { changes: this.changes });
        }
    );
}

// --- Booking Management ---

function getAllBookings(callback) {
    db.all("SELECT * FROM bookings ORDER BY created_at DESC", [], (err, rows) => {
        callback(err, rows);
    });
}

function createBooking(data, callback) {
    const token = require('crypto').randomBytes(16).toString('hex');
    db.run(
        "INSERT INTO bookings (room_id, guest_name, checkin_date, checkout_date, binding_token) VALUES (?, ?, ?, ?, ?)",
        [data.roomId, data.guestName, data.checkinDate, data.checkoutDate, token],
        function (err) {
            callback(err, { id: this.lastID, bindingToken: token });
        }
    );
}

function getBookingByToken(token, callback) {
    db.get("SELECT * FROM bookings WHERE binding_token = ?", [token], (err, row) => {
        callback(err, row);
    });
}

function bindBooking(bookingId, identity, callback) {
    // identity can be lineId or sessionId
    const field = identity.type === 'line' ? 'guest_line_id' : 'guest_session_id';
    db.run(
        `UPDATE bookings SET status = 'bound', ${field} = ? WHERE id = ?`,
        [identity.value, bookingId],
        function (err) {
            callback(err, { changes: this.changes });
        }
    );
}

function cancelBooking(bookingId, callback) {
    db.run(
        "UPDATE bookings SET status = 'cancelled' WHERE id = ? AND status = 'pending_binding'",
        [bookingId],
        function (err) {
            callback(err, { changes: this.changes });
        }
    );
}

function deleteBooking(bookingId, callback) {
    db.run(
        "DELETE FROM bookings WHERE id = ? AND status IN ('cancelled', 'pending_binding')",
        [bookingId],
        function (err) {
            callback(err, { changes: this.changes });
        }
    );
}

function getBookingById(bookingId, callback) {
    db.get("SELECT * FROM bookings WHERE id = ?", [bookingId], (err, row) => {
        callback(err, row);
    });
}

module.exports = {
    db,
    getAllRooms,
    updateRoomState,
    extendRoomStay,
    getAllBookings,
    createBooking,
    getBookingByToken,
    bindBooking,
    cancelBooking,
    deleteBooking,
    getBookingById
};
