import React, { useState, useEffect, useRef } from "react";
import { 
  Calendar, 
  Clock, 
  User, 
  Upload, 
  Settings, 
  LogOut, 
  ChevronLeft, 
  ChevronRight, 
  AlertCircle,
  CheckCircle2,
  Loader2,
  Lock
} from "lucide-react";
import { format, addDays, subDays, isSameDay, parseISO, startOfDay } from "date-fns";
import { motion, AnimatePresence } from "motion/react";
import { GoogleGenAI, Type } from "@google/genai";
import { cn } from "./lib/utils";

type ShiftType = "Morning" | "Evening" | "Night" | "Off" | string;

interface RosterItem {
  date: string;
  engineer_name: string;
  shift_type: string;
}

interface ShiftTimes {
  [key: string]: { start: string; end: string };
}

const PAKISTANI_EVENTS: Record<string, string> = {
  "02-05": "Kashmir Day",
  "03-23": "Pakistan Day",
  "05-01": "Labour Day",
  "08-14": "Independence Day",
  "09-06": "Defence Day",
  "11-09": "Iqbal Day",
  "12-25": "Quaid-e-Azam Day",
};

const SHIFT_SEQUENCE = ["Morning", "Evening", "Night"];

function getShiftIndex(type: string) {
  const found = SHIFT_SEQUENCE.findIndex(s => type.toLowerCase().includes(s.toLowerCase()));
  return found === -1 ? 99 : found;
}

export default function App() {
  const [view, setView] = useState<"dashboard" | "admin" | "login">("dashboard");
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [shiftTimes, setShiftTimes] = useState<ShiftTimes>({});
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [token, setToken] = useState<string | null>(localStorage.getItem("admin_token"));

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rosterRes, settingsRes] = await Promise.all([
        fetch("/api/roster"),
        fetch("/api/settings")
      ]);
      const rosterData = await rosterRes.json();
      const settingsData = await settingsRes.json();
      setRoster(rosterData);
      setShiftTimes(settingsData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (newToken: string) => {
    setToken(newToken);
    localStorage.setItem("admin_token", newToken);
    setView("admin");
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem("admin_token");
    setView("dashboard");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 font-sans selection:bg-emerald-500/30">
      <nav className="border-b border-white/5 bg-[#020617]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div 
            className="flex items-center gap-3 cursor-pointer group" 
            onClick={() => setView("dashboard")}
          >
            <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center text-[#020617] shadow-[0_0_15px_rgba(16,185,129,0.4)] group-hover:scale-105 transition-transform">
              <Calendar className="w-5 h-5" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-white">Daily Shifts</h1>
          </div>
          
          <div className="flex items-center gap-4">
            {view === "dashboard" ? (
              <button 
                onClick={() => setView(token ? "admin" : "login")}
                className="px-5 py-1.5 rounded-full border border-white/10 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white transition-all"
              >
                Login
              </button>
            ) : (
              <button 
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/10 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-all"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {view === "dashboard" && (
            <Dashboard 
              roster={roster} 
              shiftTimes={shiftTimes} 
              currentDate={currentDate} 
              setCurrentDate={setCurrentDate} 
            />
          )}
          {view === "login" && (
            <Login onLogin={handleLogin} />
          )}
          {view === "admin" && (
            <AdminPanel 
              shiftTimes={shiftTimes} 
              onUpdate={fetchData} 
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function Dashboard({ roster, shiftTimes, currentDate, setCurrentDate }: { 
  roster: RosterItem[], 
  shiftTimes: ShiftTimes,
  currentDate: Date,
  setCurrentDate: (d: Date) => void
}) {
  const [now, setNow] = useState(new Date());
  const todayStr = format(now, "yyyy-MM-dd");

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);
  
  const getCurrentShift = () => {
    const hour = now.getHours();
    const minute = now.getMinutes();
    const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

    for (const [name, times] of Object.entries(shiftTimes)) {
      if (timeStr >= times.start && timeStr < times.end) return name;
      if (times.start > times.end) { // Night shift case
        if (timeStr >= times.start || timeStr < times.end) return name;
      }
    }
    return null;
  };

  const currentShiftName = getCurrentShift();
  const onDuty = roster.filter(r => r.date === todayStr && r.shift_type === currentShiftName);

  // Group roster by date
  const groupedRoster = roster.reduce((acc, item) => {
    if (!acc[item.date]) acc[item.date] = [];
    acc[item.date].push(item);
    return acc;
  }, {} as Record<string, RosterItem[]>);

  // Filter for dates in the currently selected month
  const monthStart = format(currentDate, "yyyy-MM-01");
  const monthEnd = format(addDays(parseISO(format(addDays(currentDate, 32), "yyyy-MM-01")), -1), "yyyy-MM-dd");

  const isCurrentMonth = isSameDay(startOfDay(currentDate), startOfDay(new Date()));

  const sortedDates = Object.keys(groupedRoster)
    .filter(date => {
      if (isCurrentMonth) {
        return date >= todayStr && date <= monthEnd;
      }
      return date >= monthStart && date <= monthEnd;
    })
    .sort();

  const handlePrevMonth = () => {
    const prev = new Date(currentDate);
    prev.setMonth(prev.getMonth() - 1);
    setCurrentDate(prev);
  };

  const handleNextMonth = () => {
    const next = new Date(currentDate);
    next.setMonth(next.getMonth() + 1);
    setCurrentDate(next);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-10 max-w-5xl mx-auto"
    >
      {/* Hero Header with Navigation */}
      <div className="text-center space-y-1 py-6 relative group">
        <div className="flex items-center justify-center gap-8">
          <button 
            onClick={handlePrevMonth}
            className="p-2 rounded-full hover:bg-white/5 text-slate-500 hover:text-white transition-all"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
          
          <h1 className="text-6xl md:text-7xl font-black tracking-tighter text-white text-display leading-none min-w-[300px]">
            {format(currentDate, "MMMM")}<span className="text-emerald-500">.</span>
          </h1>

          <button 
            onClick={handleNextMonth}
            className="p-2 rounded-full hover:bg-white/5 text-slate-500 hover:text-white transition-all"
          >
            <ChevronRight className="w-8 h-8" />
          </button>
        </div>
        <p className="text-[9px] md:text-[10px] font-bold tracking-[0.3em] uppercase text-emerald-500/80">
          IT RESOURCE CENTER SHIFU DEVELOPMENT
        </p>
      </div>

      {/* Live Status Section (Only show if viewing current month) */}
      {isSameDay(startOfDay(currentDate), startOfDay(new Date())) && (
        <section className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
              <h2 className="text-base font-bold tracking-tight text-white">Live Status</h2>
            </div>
            <div className="h-px flex-1 bg-gradient-to-r from-emerald-500/20 to-transparent" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {onDuty.length > 0 ? (
              onDuty.map(engineer => (
                <EngineerCard 
                  key={engineer.engineer_name}
                  engineer={engineer}
                  times={shiftTimes[engineer.shift_type]}
                  isEventDay={!!PAKISTANI_EVENTS[format(now, "MM-dd")]}
                />
              ))
            ) : (
              <div className="col-span-full p-8 rounded-3xl border border-white/5 bg-white/5 flex flex-col items-center justify-center text-slate-500">
                <Clock className="w-8 h-8 mb-2 opacity-20" />
                <p className="text-sm font-medium">No engineers currently on duty</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Monthly Schedule Section */}
      <section className="space-y-8">
        <div className="flex items-center gap-3">
          <div className="w-1 h-5 bg-emerald-500 rounded-full" />
          <h2 className="text-lg font-bold tracking-tight text-white">
            {format(currentDate, "MMMM")} Schedule
          </h2>
        </div>

        <div className="space-y-4">
          {sortedDates.length > 0 ? (
            sortedDates.map(dateStr => (
              <DaySection 
                key={dateStr} 
                dateStr={dateStr} 
                dayRoster={groupedRoster[dateStr]} 
                shiftTimes={shiftTimes} 
                currentShiftIndex={getShiftIndex(currentShiftName || "")}
              />
            ))
          ) : (
            <div className="p-12 rounded-[2.5rem] border border-white/5 bg-white/5 flex flex-col items-center justify-center text-slate-500">
              <Calendar className="w-12 h-12 mb-4 opacity-10" />
              <p className="text-lg font-bold text-white/40">No roster data for this month</p>
              <p className="text-sm mt-2">Upload a new roster in the control center</p>
            </div>
          )}
        </div>
      </section>
    </motion.div>
  );
}

function DaySection({ dateStr, dayRoster, shiftTimes, currentShiftIndex }: { 
  dateStr: string, 
  dayRoster: RosterItem[], 
  shiftTimes: ShiftTimes, 
  currentShiftIndex: number,
  key?: string 
}) {
  const [isOpen, setIsOpen] = useState(true);
  const date = parseISO(dateStr);
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const isToday = dateStr === todayStr;
  
  const monthDay = format(date, "MM-dd");
  const eventName = PAKISTANI_EVENTS[monthDay];

  const activeShifts = dayRoster
    .filter(r => !r.shift_type.toLowerCase().includes("off") && r.shift_type !== "")
    .filter(r => {
      if (!isToday) return true;
      // If today, only show shifts that are AFTER the current one
      return getShiftIndex(r.shift_type) > currentShiftIndex;
    })
    .sort((a, b) => getShiftIndex(a.shift_type) - getShiftIndex(b.shift_type));

  if (isToday && activeShifts.length === 0) return null;

  return (
    <div className="space-y-2">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-baseline justify-between border-b border-white/5 pb-2 hover:bg-white/5 transition-colors group px-2 rounded-t-lg text-left relative",
          eventName && "border-emerald-500/30"
        )}
      >
        <div className="flex items-center gap-3">
          <ChevronRight className={cn("w-4 h-4 text-emerald-500 transition-transform", isOpen && "rotate-90")} />
          <h3 className="text-xl font-bold text-white text-display">
            {format(date, "d")} <span className="text-slate-400 font-medium">{format(date, "EEEE")}</span>
          </h3>
          {eventName && (
            <motion.span 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold uppercase tracking-tighter flex items-center gap-1"
            >
              <div className="w-1 h-1 rounded-full bg-emerald-400 animate-ping" />
              {eventName}
            </motion.span>
          )}
          {activeShifts.length > 0 && !isOpen && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold uppercase">
              {activeShifts.length} Upcoming
            </span>
          )}
        </div>
        <span className="text-[10px] font-mono text-slate-500 tracking-widest">{dateStr}</span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4">
              {activeShifts.length > 0 ? (
                activeShifts.map(engineer => (
                  <EngineerCard 
                    key={`${dateStr}-${engineer.engineer_name}-${engineer.shift_type}`}
                    engineer={engineer}
                    times={shiftTimes[engineer.shift_type]}
                    isEventDay={!!eventName}
                  />
                ))
              ) : (
                <div className="col-span-full py-4 text-center text-slate-600 text-xs italic">
                  No upcoming shifts for today
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EngineerCard({ engineer, times, isEventDay }: { engineer: RosterItem, times?: { start: string, end: string }, isEventDay?: boolean, key?: string }) {
  const formatTime = (time?: string) => {
    if (!time) return "";
    const [h, m] = time.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour % 12 || 12;
    return `${h12.toString().padStart(2, '0')}:${m} ${ampm}`;
  };

  return (
    <motion.div 
      whileHover={{ y: -4, scale: 1.02 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={cn(
        "p-6 rounded-[2rem] card-gradient backdrop-blur-md border border-white/5 hover:border-emerald-500/30 transition-all group relative overflow-hidden shadow-xl",
        isEventDay && "border-emerald-500/20 shadow-emerald-500/5"
      )}
    >
      <div className={cn(
        "absolute top-0 right-0 w-32 h-32 blur-[60px] rounded-full -mr-16 -mt-16 transition-colors",
        isEventDay ? "bg-emerald-500/20 group-hover:bg-emerald-500/30" : "bg-emerald-500/10 group-hover:bg-emerald-500/20"
      )} />
      
      <div className="relative space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                {engineer.shift_type}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-400">
              <Clock className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">
                {times ? `${formatTime(times.start)} - ${formatTime(times.end)}` : ""}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <h4 className="text-xl font-bold text-white tracking-tight text-display group-hover:text-emerald-400 transition-colors leading-tight">
            {engineer.engineer_name}
          </h4>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/40" />
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.2em]">Infrastructure Engineer</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (data.success) {
        onLogin(data.token);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-md mx-auto mt-20"
    >
      <div className="bg-[#0f172a] p-10 rounded-[2.5rem] shadow-2xl border border-white/5 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-50" />
        
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 mb-6 border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Admin Portal</h2>
          <p className="text-slate-400 mt-2 text-sm">Secure access for roster management</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 ml-1">Access Key</label>
            <input 
              type="password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-5 py-4 rounded-2xl bg-white/5 border border-white/10 text-white focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 outline-none transition-all placeholder:text-slate-700"
              placeholder="••••••••"
              required
            />
          </div>
          
          {error && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-3"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </motion.div>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-emerald-500 text-[#020617] rounded-2xl font-bold text-sm uppercase tracking-widest hover:bg-emerald-400 transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-[0_10px_20px_rgba(16,185,129,0.2)]"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Authenticate"}
          </button>
        </form>
      </div>
    </motion.div>
  );
}

function AdminPanel({ shiftTimes, onUpdate }: { 
  shiftTimes: ShiftTimes, 
  onUpdate: () => void 
}) {
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [localShiftTimes, setLocalShiftTimes] = useState(shiftTimes);
  const [previewData, setPreviewData] = useState<RosterItem[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");
    setSuccess(false);
    setPreviewData(null);

    try {
      // Read file as base64
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("Gemini API key is not configured.");
      }

      const ai = new GoogleGenAI({ apiKey });
      const model = "gemini-3-flash-preview";

      const prompt = `
        Extract the shift roster from this image. 
        The image is a table where:
        - The first column is "Shift" (Day of week).
        - The second column is "Dates" (e.g., 1-Feb-26).
        - Subsequent columns are Engineer Names (e.g., Ahsan Farooq, Ehtisham Nasir, Muhammad Nouman, Talha Sajjad).
        
        The cells for each engineer on a specific date contain their shift:
        - "Morning", "Evening", "Night", "Morning+Evening".
        - "Paternity Leave" or other leave types.
        - Red colored cells or empty cells mean the engineer is "Off".
        
        Return a JSON array of objects. Each object must have:
        - "date": The date converted to YYYY-MM-DD format (e.g., 2026-02-01).
        - "engineer_name": The full name of the engineer from the column header.
        - "shift_type": The shift text found in the cell, or "Off" if the cell is empty or red.
        
        Process every date and every engineer shown in the table.
      `;

      const response = await ai.models.generateContent({
        model,
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: file.type,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING },
                engineer_name: { type: Type.STRING },
                shift_type: { type: Type.STRING },
              },
              required: ["date", "engineer_name", "shift_type"],
            },
          },
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error("Model returned empty response");
      }

      const rosterData = JSON.parse(text);
      setPreviewData(rosterData);
    } catch (err: any) {
      console.error("Error parsing roster:", err);
      setError(err.message || "Failed to parse roster. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleConfirm = async () => {
    if (!previewData) return;
    setConfirming(true);
    setError("");

    try {
      const res = await fetch("/api/roster/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: previewData })
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(true);
        setPreviewData(null);
        onUpdate();
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError("Confirmation failed. Please try again.");
    } finally {
      setConfirming(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shift_times: localShiftTimes })
      });
      onUpdate();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError("Failed to save settings");
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-12"
    >
      <div className="flex items-center justify-between border-b border-white/5 pb-8">
        <div>
          <h2 className="text-4xl font-black text-white tracking-tight">Control Center</h2>
          <p className="text-slate-400 mt-1">Manage roster data and shift configurations</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Upload Section */}
        <div className="bg-[#0f172a]/40 p-10 rounded-[2.5rem] border border-white/5 space-y-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 text-emerald-500">
              <Upload className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white">Roster Intelligence</h3>
          </div>
          
          <p className="text-sm text-slate-400 leading-relaxed">
            Upload your roster image or document. Our AI engine will parse the structure and you can verify the entries before publishing.
          </p>

          {!previewData ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-3xl p-16 flex flex-col items-center justify-center gap-6 cursor-pointer transition-all group",
                uploading ? "bg-white/5 border-white/10" : "hover:bg-emerald-500/5 border-white/5 hover:border-emerald-500/30"
              )}
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="w-12 h-12 animate-spin text-emerald-500" />
                  <p className="text-sm font-bold text-emerald-500 uppercase tracking-widest">Processing Data...</p>
                </div>
              ) : (
                <>
                  <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Upload className="w-10 h-10 text-emerald-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-white">Drop roster here</p>
                    <p className="text-xs text-slate-500 mt-2 uppercase tracking-widest">Supports Image & Excel</p>
                  </div>
                </>
              )}
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden" 
                accept="image/*,.xlsx"
              />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="max-h-96 overflow-y-auto rounded-2xl border border-white/5 bg-black/20 p-4 space-y-2">
                <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-4">Preview Entries ({previewData.length})</p>
                {previewData.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 text-xs">
                    <div className="flex flex-col gap-1">
                      <span className="font-bold text-white">{item.engineer_name}</span>
                      <span className="text-slate-500">{item.date}</span>
                    </div>
                    <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 font-bold">{item.shift_type}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={() => setPreviewData(null)}
                  className="flex-1 py-4 bg-white/5 text-white border border-white/10 rounded-2xl font-bold text-sm uppercase tracking-widest hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleConfirm}
                  disabled={confirming}
                  className="flex-[2] py-4 bg-emerald-500 text-[#020617] rounded-2xl font-bold text-sm uppercase tracking-widest hover:bg-emerald-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {confirming ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                  Confirm & Publish
                </button>
              </div>
            </div>
          )}

          {success && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5" />
              Roster synchronized successfully
            </motion.div>
          )}
          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3">
              <AlertCircle className="w-5 h-5" />
              {error}
            </motion.div>
          )}
        </div>

        {/* Settings Section */}
        <div className="bg-[#0f172a]/40 p-10 rounded-[2.5rem] border border-white/5 space-y-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-500/10 rounded-2xl border border-amber-500/20 text-amber-500">
              <Settings className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white">Shift Configuration</h3>
          </div>

          <div className="space-y-8">
            {(Object.entries(localShiftTimes) as [string, {start: string, end: string}][]).map(([name, times]) => (
              <div key={name} className="space-y-3">
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 ml-1">{name} Window</label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-slate-600 ml-1 uppercase">Start</span>
                    <input 
                      type="time" 
                      value={times.start}
                      onChange={e => setLocalShiftTimes({
                        ...localShiftTimes,
                        [name]: { ...times, start: e.target.value }
                      })}
                      className="w-full px-5 py-3 rounded-2xl bg-white/5 border border-white/10 text-white focus:ring-2 focus:ring-emerald-500/30 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-slate-600 ml-1 uppercase">End</span>
                    <input 
                      type="time" 
                      value={times.end}
                      onChange={e => setLocalShiftTimes({
                        ...localShiftTimes,
                        [name]: { ...times, end: e.target.value }
                      })}
                      className="w-full px-5 py-3 rounded-2xl bg-white/5 border border-white/10 text-white focus:ring-2 focus:ring-emerald-500/30 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>
            ))}

            <button 
              onClick={handleSaveSettings}
              className="w-full py-4 bg-white/5 text-white border border-white/10 rounded-2xl font-bold text-sm uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center gap-3"
            >
              Update Configurations
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
