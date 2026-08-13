const db = new (require('/app/backend/node_modules/sqlite3').Database)('/app/backend/hotel.db');
db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
  if (err) return console.error(err);
  console.log("Tables:", tables);
  db.all("PRAGMA table_info(rooms)", (err, info) => {
    if (err) return console.error(err);
    console.log("Rooms Table Info:", info);
    db.close();
  });
});
