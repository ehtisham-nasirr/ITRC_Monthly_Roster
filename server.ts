import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import multer from "multer";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const db = new Database("roster.db");

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS engineers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE
  );

  CREATE TABLE IF NOT EXISTS roster (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    engineer_id INTEGER,
    shift_type TEXT,
    FOREIGN KEY (engineer_id) REFERENCES engineers(id),
    UNIQUE(date, engineer_id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Seed default settings
const seedSettings = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
seedSettings.run("admin_password", "admin");
seedSettings.run("shift_times", JSON.stringify({
  "Morning": { start: "08:00", end: "16:00" },
  "Evening": { start: "16:00", end: "00:00" },
  "Night": { start: "00:00", end: "08:00" }
}));

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const upload = multer({ storage: multer.memoryStorage() });

// API Routes
app.post("/api/login", (req, res) => {
  const { password } = req.body;
  const row = db.prepare("SELECT value FROM settings WHERE key = 'admin_password'").get() as { value: string };
  if (password === row.value) {
    res.json({ success: true, token: "mock-token-123" });
  } else {
    res.status(401).json({ success: false, message: "Invalid password" });
  }
});

app.get("/api/roster", (req, res) => {
  const { date } = req.query;
  let query = `
    SELECT r.date, e.name as engineer_name, r.shift_type 
    FROM roster r 
    JOIN engineers e ON r.engineer_id = e.id
  `;
  if (date) {
    query += " WHERE r.date = ?";
    const rows = db.prepare(query).all(date);
    res.json(rows);
  } else {
    const rows = db.prepare(query).all();
    res.json(rows);
  }
});

app.get("/api/settings", (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'shift_times'").get() as { value: string };
  res.json(JSON.parse(row.value));
});

app.post("/api/settings", (req, res) => {
  const { shift_times, admin_password } = req.body;
  if (shift_times) {
    db.prepare("UPDATE settings SET value = ? WHERE key = 'shift_times'").run(JSON.stringify(shift_times));
  }
  if (admin_password) {
    db.prepare("UPDATE settings SET value = ? WHERE key = 'admin_password'").run(admin_password);
  }
  res.json({ success: true });
});

app.post("/api/roster/confirm", (req, res) => {
  const { data } = req.body;
  if (!data || !Array.isArray(data)) return res.status(400).send("Invalid data");

  try {
    const insertEngineer = db.prepare("INSERT OR IGNORE INTO engineers (name) VALUES (?)");
    const getEngineerId = db.prepare("SELECT id FROM engineers WHERE name = ?");
    const insertRoster = db.prepare("INSERT OR REPLACE INTO roster (date, engineer_id, shift_type) VALUES (?, ?, ?)");

    const transaction = db.transaction((rosterData) => {
      for (const item of rosterData) {
        insertEngineer.run(item.engineer_name);
        const engineer = getEngineerId.get(item.engineer_name) as { id: number };
        insertRoster.run(item.date, engineer.id, item.shift_type);
      }
    });

    transaction(data);
    res.json({ success: true });
  } catch (error) {
    console.error("Error saving roster:", error);
    res.status(500).json({ success: false, message: "Failed to save roster" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
