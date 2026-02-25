import express from "express";
import { createServer as createViteServer } from "vite";
import mongoose from "mongoose";
import multer from "multer";
import path from "path";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

// ── Mongoose schemas ────────────────────────────────────────────────────────

const engineerSchema = new mongoose.Schema({
  name: { type: String, unique: true, required: true },
});

const rosterSchema = new mongoose.Schema({
  date: { type: String, required: true },
  engineer_name: { type: String, required: true },
  shift_type: { type: String, required: true },
});
rosterSchema.index({ date: 1, engineer_name: 1 }, { unique: true });

const settingsSchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  value: { type: String, required: true },
});

const Engineer = mongoose.model("Engineer", engineerSchema);
const Roster = mongoose.model("Roster", rosterSchema);
const Settings = mongoose.model("Settings", settingsSchema);

// ── DB connection ────────────────────────────────────────────────────────────

let isConnected = false;

async function connectDB() {
  if (isConnected && mongoose.connection.readyState === 1) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set in .env");
    throw new Error("MONGODB_URI is not set");
  }

  try {
    console.log("Attempting to connect to MongoDB...");
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log("Connected to MongoDB");

    // Seed defaults (force update if empty or missing)
    const adminPass = await Settings.findOne({ key: "admin_password" });
    if (!adminPass) {
      await Settings.create({ key: "admin_password", value: "2010" });
    } else if (adminPass.value !== "2010") {
      await Settings.updateOne({ key: "admin_password" }, { value: "2010" });
    }

    const shiftTimes = await Settings.findOne({ key: "shift_times" });
    if (!shiftTimes || shiftTimes.value === "{}" || !shiftTimes.value) {
      const defaultValue = JSON.stringify({
        Morning: { start: "08:00", end: "16:00" },
        Evening: { start: "16:00", end: "00:00" },
        Night: { start: "00:00", end: "08:00" },
      });
      if (!shiftTimes) {
        await Settings.create({ key: "shift_times", value: defaultValue });
      } else {
        await Settings.updateOne({ key: "shift_times" }, { value: defaultValue });
      }
    }
  } catch (error) {
    console.error("MongoDB connection error:", error);
    isConnected = false;
    throw error;
  }
}

// ── Express app ──────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
const upload = multer({ storage: multer.memoryStorage() });

// Middleware to ensure DB is connected before every request
app.use(async (_req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Database connection failed. Please check your MONGODB_URI."
    });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  const { password } = req.body;
  const row = await Settings.findOne({ key: "admin_password" });
  if (row && password === row.value) {
    res.json({ success: true, token: "mock-token-123" });
  } else {
    res.status(401).json({ success: false, message: "Invalid password" });
  }
});

// Get roster
app.get("/api/roster", async (req, res) => {
  const { date } = req.query;
  const filter = date ? { date: date as string } : {};
  const rows = await Roster.find(filter).lean();
  res.json(rows);
});

// Get settings
app.get("/api/settings", async (req, res) => {
  const row = await Settings.findOne({ key: "shift_times" });
  res.json(row ? JSON.parse(row.value) : {});
});

// Update settings
app.post("/api/settings", async (req, res) => {
  const { shift_times, admin_password } = req.body;
  if (shift_times) {
    await Settings.updateOne(
      { key: "shift_times" },
      { value: JSON.stringify(shift_times) }
    );
  }
  if (admin_password) {
    await Settings.updateOne({ key: "admin_password" }, { value: admin_password });
  }
  res.json({ success: true });
});

// Confirm/save roster
app.post("/api/roster/confirm", async (req, res) => {
  const { data } = req.body;
  if (!data || !Array.isArray(data))
    return res.status(400).send("Invalid data");

  try {
    const ops = data.map((item: any) => ({
      updateOne: {
        filter: { date: item.date, engineer_name: item.engineer_name },
        update: { $set: { shift_type: item.shift_type } },
        upsert: true,
      },
    }));
    await Roster.bulkWrite(ops);
    res.json({ success: true });
  } catch (error) {
    console.error("Error saving roster:", error);
    res.status(500).json({ success: false, message: "Failed to save roster" });
  }
});

// ── Start server ─────────────────────────────────────────────────────────────

async function startServer() {
  await connectDB();

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

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
