import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine
} from "recharts";
import Papa from "papaparse";
import {
  LayoutDashboard, NotebookText, Layers, UploadCloud, Plus, Trash2,
  X, TrendingUp, TrendingDown, Save, ChevronDown, ChevronUp, Info,
  Calendar as CalendarIcon, ChevronLeft, ChevronRight,
  Radio, Settings, Volume2, VolumeX
} from "lucide-react";

/* ---------------------------------------------------------
   TOKENS
   bg-0 #0B0F14  bg-1 #121821  bg-2 #1A222C  border #232D3A
   text-hi #E9EEF4  text-mid #8B96A5  text-low #5C6675
   long #33D6A0  short #FF6B7A  info(FVG) #5B9CFF  warn(inducement) #F5B942
--------------------------------------------------------- */

const COLORS = {
  bg0: "#0B0F14", bg1: "#121821", bg2: "#1A222C", bg3: "#212B38",
  border: "#232D3A", hi: "#E9EEF4", mid: "#8B96A5", low: "#5C6675",
  long: "#33D6A0", short: "#FF6B7A", info: "#5B9CFF", warn: "#F5B942",
};

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');`;

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const fmt$ = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);
const fmtDate = (d) => { try { return new Date(d).toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" }); } catch { return d; } };

/* ---------------------------------------------------------
   ARES — voice assistant (browser TTS, no key needed)
   News requires a free Alpha Vantage API key, entered in Settings.
--------------------------------------------------------- */

function pickBritishFemaleVoice() {
  const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  if (!voices.length) return null;
  const gbVoices = voices.filter(v => /en-GB|en_GB/i.test(v.lang));
  // Prefer modern neural "Natural"/"Online" voices first — legacy SAPI voices (Hazel, David, Zira)
  // sound noticeably more robotic. Windows 11 ships these free but they must be installed once
  // via Settings > Time & Language > Speech > Manage voices.
  const natural = gbVoices.find(v => /natural|online/i.test(v.name));
  if (natural) return natural;
  const preferredNames = ["libby", "sonia", "hazel", "female", "olivia"];
  for (const name of preferredNames) {
    const match = gbVoices.find(v => v.name.toLowerCase().includes(name));
    if (match) return match;
  }
  if (gbVoices.length) return gbVoices[0];
  const anyFemale = voices.find(v => /female/i.test(v.name));
  return anyFemale || voices[0] || null;
}

function aresGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning, Sir.";
  if (h < 17) return "Good afternoon, Sir.";
  return "Good evening, Sir.";
}

function aresSpeak(lines) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const voice = pickBritishFemaleVoice();
  lines.forEach((line) => {
    const u = new SpeechSynthesisUtterance(line);
    if (voice) u.voice = voice;
    u.lang = "en-GB";
    u.rate = 0.92;
    u.pitch = 1.0;
    window.speechSynthesis.speak(u);
  });
}

async function fetchAresNews(apiKey) {
  if (!apiKey) return { ok: false, reason: "no-key" };
  try {
    const res = await fetch(`https://www.alphavantage.co/query?function=NEWS_SENTIMENT&topics=financial_markets&limit=6&apikey=${encodeURIComponent(apiKey)}`);
    if (!res.ok) return { ok: false, reason: "bad-response" };
    const data = await res.json();
    if (data.Note || data.Information || !data.feed || !Array.isArray(data.feed) || !data.feed.length) return { ok: false, reason: "empty" };
    return { ok: true, items: data.feed.slice(0, 4).map(d => d.title).filter(Boolean) };
  } catch (e) {
    return { ok: false, reason: "network" };
  }
}

const emptyTrade = () => ({
  id: uid(), date: new Date().toISOString().slice(0, 10), symbol: "", direction: "Long",
  entryPrice: "", exitPrice: "", size: "", stopLoss: "", takeProfit: "", pnl: "",
  fees: "", session: "London", notes: "",
  inducementLevel: "", inducementDesc: "",
  fvgHigh: "", fvgLow: "", fvgTf: "H1", fvgFilled: "No", fvgDesc: "",
  trendStructure: "",
});

const emptySetup = () => ({
  id: uid(), date: new Date().toISOString().slice(0, 10), symbol: "", timeframe: "H1",
  inducementLevel: "", inducementDesc: "",
  fvgHigh: "", fvgLow: "", fvgTf: "H1", fvgFilled: "No", fvgDesc: "",
  trendStructure: "", status: "Watching",
});

const CandleIcon = ({ color = COLORS.long, size = 14 }) => (
  <svg width={size} height={size * 1.4} viewBox="0 0 10 14">
    <line x1="5" y1="0" x2="5" y2="14" stroke={color} strokeWidth="1" />
    <rect x="2" y="4" width="6" height="6" fill={color} />
  </svg>
);

function Field({ label, children, hint }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontFamily: "Inter, sans-serif" }}>
      <span style={{ fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: COLORS.mid, fontWeight: 600 }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11, color: COLORS.low }}>{hint}</span>}
    </label>
  );
}

const inputStyle = {
  background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 8,
  color: COLORS.hi, padding: "9px 10px", fontSize: 13.5, fontFamily: "Inter, sans-serif", outline: "none",
};
const selectStyle = { ...inputStyle, appearance: "none" };
const taStyle = { ...inputStyle, minHeight: 64, resize: "vertical", fontFamily: "Inter, sans-serif", lineHeight: 1.5 };

function Btn({ children, onClick, variant = "ghost", style, type = "button" }) {
  const base = {
    display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600,
    padding: "9px 14px", borderRadius: 8, cursor: "pointer", border: "1px solid transparent",
    fontFamily: "Inter, sans-serif", transition: "all .15s",
  };
  const variants = {
    primary: { background: COLORS.long, color: "#08150F", border: `1px solid ${COLORS.long}` },
    ghost: { background: "transparent", color: COLORS.mid, border: `1px solid ${COLORS.border}` },
    danger: { background: "transparent", color: COLORS.short, border: `1px solid ${COLORS.border}` },
  };
  return <button type={type} onClick={onClick} style={{ ...base, ...variants[variant], ...style }}>{children}</button>;
}

function StatCard({ label, value, sub, positive }) {
  return (
    <div className="card-hover" style={{
      background: `linear-gradient(160deg, ${COLORS.bg1} 0%, ${COLORS.bg2}66 100%)`,
      border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "16px 18px", flex: 1, minWidth: 150,
    }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: COLORS.mid, fontWeight: 600, marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 22, fontWeight: 600, color: positive === undefined ? COLORS.hi : positive ? COLORS.long : COLORS.short }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: COLORS.low, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function TradingJournal() {
  const [tab, setTab] = useState("dashboard");
  const [trades, setTrades] = useState([]);
  const [setups, setSetups] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showTradeForm, setShowTradeForm] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);
  const [showSetupForm, setShowSetupForm] = useState(false);
  const [editingSetup, setEditingSetup] = useState(null);
  const [expandedRow, setExpandedRow] = useState(null);
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState([]);
  const [importError, setImportError] = useState("");
  const fileRef = useRef(null);

  // Ares assistant state
  const [aresKey, setAresKey] = useState("");
  const [showAresSettings, setShowAresSettings] = useState(false);
  const [aresNote, setAresNote] = useState("");
  const aresGreetedRef = useRef(false);

  // Load from persistent storage (plain browser localStorage — works in Electron)
  useEffect(() => {
    try {
      const t = localStorage.getItem("tj-trades");
      if (t) setTrades(JSON.parse(t));
      const s = localStorage.getItem("tj-setups");
      if (s) setSetups(JSON.parse(s));
      const k = localStorage.getItem("ares-av-key");
      if (k) setAresKey(k);
    } catch (e) {}
    setLoaded(true);
  }, []);

  // Persist
  useEffect(() => { if (loaded) localStorage.setItem("tj-trades", JSON.stringify(trades)); }, [trades, loaded]);
  useEffect(() => { if (loaded) localStorage.setItem("tj-setups", JSON.stringify(setups)); }, [setups, loaded]);
  useEffect(() => { if (loaded) localStorage.setItem("ares-av-key", aresKey); }, [aresKey, loaded]);

  async function runAresGreeting() {
    setAresNote("Ares is speaking…");
    const lines = [aresGreeting(), "Let's dive into the news."];
    const newsResult = await fetchAresNews(aresKey);
    if (newsResult.ok) {
      newsResult.items.forEach(h => lines.push(h));
      setAresNote("");
    } else if (newsResult.reason === "no-key") {
      lines.push("I don't have a news source connected yet — add an Alpha Vantage key in Ares settings and I'll bring you the headlines next time.");
      setAresNote("No news key set — click Ares to add one.");
    } else {
      lines.push("I couldn't reach the markets just now — please check your connection or news key.");
      setAresNote("Couldn't fetch news — check connection or key.");
    }
    aresSpeak(lines);
  }

  // Greet once per app launch, after voices are ready
  useEffect(() => {
    if (!loaded || aresGreetedRef.current) return;
    aresGreetedRef.current = true;
    const trigger = () => setTimeout(() => runAresGreeting(), 500);
    if (window.speechSynthesis && window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = trigger;
      // Fallback in case the event never fires
      setTimeout(trigger, 1200);
    } else {
      trigger();
    }
  }, [loaded, aresKey]);

  const stats = useMemo(() => {
    const closed = trades.filter(t => t.pnl !== "" && !isNaN(parseFloat(t.pnl)));
    const pnls = closed.map(t => parseFloat(t.pnl));
    const wins = pnls.filter(p => p > 0);
    const losses = pnls.filter(p => p < 0);
    const total = pnls.reduce((a, b) => a + b, 0);
    const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;
    const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
    const grossWin = wins.reduce((a, b) => a + b, 0);
    const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
    const profitFactor = grossLoss ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
    let equity = 0;
    const curve = [...closed]
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((t, i) => { equity += parseFloat(t.pnl); return { i: i + 1, equity: Number(equity.toFixed(2)), date: t.date }; });
    return { count: closed.length, winRate, avgWin, avgLoss, profitFactor, total, curve, wins: wins.length, losses: losses.length };
  }, [trades]);

  function saveTrade(tr) {
    setTrades(prev => {
      const exists = prev.some(p => p.id === tr.id);
      return exists ? prev.map(p => p.id === tr.id ? tr : p) : [tr, ...prev];
    });
    setShowTradeForm(false); setEditingTrade(null);
  }
  function deleteTrade(id) { setTrades(prev => prev.filter(t => t.id !== id)); }

  function saveSetup(s) {
    setSetups(prev => {
      const exists = prev.some(p => p.id === s.id);
      return exists ? prev.map(p => p.id === s.id ? s : p) : [s, ...prev];
    });
    setShowSetupForm(false); setEditingSetup(null);
  }
  function deleteSetup(id) { setSetups(prev => prev.filter(s => s.id !== id)); }

  function parseCsvRows(rows) {
    // Flexible header mapping for cTrader-style exports
    const pick = (row, keys) => {
      for (const k of keys) {
        const found = Object.keys(row).find(rk => rk.toLowerCase().trim() === k);
        if (found && row[found] !== undefined && row[found] !== "") return row[found];
      }
      return "";
    };
    return rows.map(row => {
      const symbol = pick(row, ["symbol", "instrument"]);
      const dir = (pick(row, ["trade type", "direction", "type"]) || "").toLowerCase();
      const direction = dir.includes("sell") || dir.includes("short") ? "Short" : "Long";
      const entry = pick(row, ["entry price", "open price", "entryprice"]);
      const exit = pick(row, ["closing price", "close price", "exit price", "closingprice"]);
      const size = pick(row, ["volume", "quantity", "size", "lots"]);
      const pnl = pick(row, ["net profit", "profit", "pnl", "gross profit"]);
      const date = pick(row, ["closing time", "close time", "entry time", "date"]) || new Date().toISOString().slice(0, 10);
      return {
        ...emptyTrade(),
        id: uid(),
        date: date.slice(0, 10),
        symbol: symbol || "UNKNOWN",
        direction,
        entryPrice: entry, exitPrice: exit, size,
        pnl: pnl, notes: "Imported from cTrader export",
      };
    }).filter(t => t.symbol && t.symbol !== "UNKNOWN" || t.pnl !== "");
  }

  function handleCsvText(text) {
    setImportError("");
    Papa.parse(text, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        if (!res.data.length) { setImportError("No rows found — check the CSV has a header row."); return; }
        setImportPreview(parseCsvRows(res.data));
      },
      error: (err) => setImportError(err.message),
    });
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setImportText(String(ev.target.result)); handleCsvText(String(ev.target.result)); };
    reader.readAsText(file);
  }

  function commitImport() {
    setTrades(prev => [...importPreview, ...prev]);
    setImportPreview([]); setImportText("");
  }

  const NAV = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "calendar", label: "Calendar", icon: CalendarIcon },
    { id: "log", label: "Trade Log", icon: NotebookText },
    { id: "setups", label: "Setup Library", icon: Layers },
    { id: "import", label: "Import / Sync", icon: UploadCloud },
  ];

  return (
    <div style={{
      background: `radial-gradient(1200px 600px at 15% -10%, #131C26 0%, ${COLORS.bg0} 55%)`,
      minHeight: "100%", display: "flex", color: COLORS.hi,
      fontFamily: "Inter, sans-serif", fontSize: 14,
    }}>
      <style>{`
        ${FONT_IMPORT}
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: ${COLORS.bg3}; border-radius: 4px; }
        table { border-collapse: collapse; width: 100%; }
        th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: ${COLORS.mid}; font-weight: 600; padding: 10px 12px; border-bottom: 1px solid ${COLORS.border}; }
        td { padding: 11px 12px; border-bottom: 1px solid ${COLORS.border}; font-size: 13px; }
        tr:hover td { background: ${COLORS.bg1}; }
        input:focus, textarea:focus, select:focus { border-color: ${COLORS.info} !important; }
        input[type=file] { color: ${COLORS.mid}; }
        .navitem:hover { background: ${COLORS.bg2}; color: ${COLORS.hi} !important; }
        .card-hover { transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease; }
        .card-hover:hover { transform: translateY(-1px); border-color: ${COLORS.bg3} !important; box-shadow: 0 8px 24px rgba(0,0,0,0.35); }
      `}</style>

      {/* Sidebar */}
      <div style={{ width: 220, borderRight: `1px solid ${COLORS.border}`, padding: "22px 14px", display: "flex", flexDirection: "column", gap: 4, flexShrink: 0, background: "rgba(255,255,255,0.012)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 8px 22px" }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
            background: `linear-gradient(135deg, ${COLORS.long}22, ${COLORS.info}22)`, border: `1px solid ${COLORS.border}`,
          }}>
            <CandleIcon color={COLORS.long} size={13} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
            <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: 0.2 }}>WBP</span>
            <span style={{ fontSize: 10.5, color: COLORS.mid, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase" }}>Trade Journal</span>
          </div>
        </div>
        {NAV.map(n => {
          const Icon = n.icon;
          const active = tab === n.id;
          return (
            <div key={n.id} className="navitem" onClick={() => setTab(n.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8,
                cursor: "pointer", color: active ? COLORS.hi : COLORS.mid,
                background: active ? COLORS.bg2 : "transparent", fontWeight: active ? 600 : 500, fontSize: 13.5,
                borderLeft: active ? `2px solid ${COLORS.long}` : "2px solid transparent",
              }}>
              <Icon size={16} /> {n.label}
            </div>
          );
        })}
        <div style={{ marginTop: "auto", padding: "12px 8px 4px", fontSize: 11, color: COLORS.low, lineHeight: 1.5 }}>
          {trades.length} trades logged<br />{setups.length} setups tracked
        </div>
        <div className="navitem" onClick={() => setShowAresSettings(true)}
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "8px 8px", borderRadius: 8, cursor: "pointer",
            marginTop: 4, border: `1px solid ${COLORS.border}`, background: COLORS.bg1,
          }}>
          <Radio size={14} color={COLORS.info} />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.hi }}>Ares</span>
            <span style={{ fontSize: 10, color: COLORS.low }}>{aresNote || "Voice briefing • click to configure"}</span>
          </div>
        </div>
        <div style={{ padding: "10px 8px 0", marginTop: 6, borderTop: `1px solid ${COLORS.border}`, fontSize: 10.5, color: COLORS.low, letterSpacing: 0.2 }}>
          Created by M. Narinesingh
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, padding: "26px 32px", overflowY: "auto", maxHeight: "100vh" }}>
        {tab === "dashboard" && <Dashboard stats={stats} trades={trades} />}
        {tab === "calendar" && <CalendarView trades={trades} />}
        {tab === "log" && (
          <TradeLog
            trades={trades} setTrades={setTrades}
            onAdd={() => { setEditingTrade(emptyTrade()); setShowTradeForm(true); }}
            onEdit={(t) => { setEditingTrade(t); setShowTradeForm(true); }}
            onDelete={deleteTrade}
            expandedRow={expandedRow} setExpandedRow={setExpandedRow}
          />
        )}
        {tab === "setups" && (
          <SetupLibrary
            setups={setups}
            onAdd={() => { setEditingSetup(emptySetup()); setShowSetupForm(true); }}
            onEdit={(s) => { setEditingSetup(s); setShowSetupForm(true); }}
            onDelete={deleteSetup}
          />
        )}
        {tab === "import" && (
          <ImportPanel
            importText={importText} setImportText={setImportText}
            handleCsvText={handleCsvText} handleFile={handleFile}
            importPreview={importPreview} importError={importError}
            commitImport={commitImport} fileRef={fileRef}
          />
        )}
      </div>

      {showTradeForm && (
        <TradeForm trade={editingTrade} onSave={saveTrade} onClose={() => { setShowTradeForm(false); setEditingTrade(null); }} />
      )}
      {showSetupForm && (
        <SetupForm setup={editingSetup} onSave={saveSetup} onClose={() => { setShowSetupForm(false); setEditingSetup(null); }} />
      )}
      {showAresSettings && (
        <AresSettings
          aresKey={aresKey}
          setAresKey={setAresKey}
          onReplay={() => runAresGreeting()}
          onClose={() => setShowAresSettings(false)}
        />
      )}
    </div>
  );
}

function Dashboard({ stats, trades }) {
  const recent = trades.slice(0, 6);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
        <h1 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 22, margin: 0 }}>Performance</h1>
        <span style={{ height: 5, width: 5, borderRadius: "50%", background: COLORS.long, boxShadow: `0 0 8px ${COLORS.long}` }} />
      </div>
      <p style={{ color: COLORS.mid, margin: "0 0 20px", fontSize: 13 }}>Everything below reflects trades with a logged P&L.</p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <StatCard label="Net P&L" value={fmt$(stats.total)} positive={stats.total >= 0} sub={`${stats.count} closed trades`} />
        <StatCard label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} sub={`${stats.wins}W / ${stats.losses}L`} />
        <StatCard label="Profit Factor" value={stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)} />
        <StatCard label="Avg Win" value={fmt$(stats.avgWin)} positive={true} />
        <StatCard label="Avg Loss" value={fmt$(stats.avgLoss)} positive={false} />
      </div>

      <div className="card-hover" style={{ background: `linear-gradient(160deg, ${COLORS.bg1} 0%, ${COLORS.bg2}55 100%)`, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "18px 20px", marginBottom: 20 }}>
        <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, color: COLORS.mid, fontWeight: 600, marginBottom: 10 }}>Equity Curve</div>
        {stats.curve.length > 1 ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={stats.curve}>
              <defs>
                <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.long} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={COLORS.long} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="i" stroke={COLORS.low} fontSize={11} tickLine={false} axisLine={{ stroke: COLORS.border }} />
              <YAxis stroke={COLORS.low} fontSize={11} tickLine={false} axisLine={{ stroke: COLORS.border }} />
              <ReferenceLine y={0} stroke={COLORS.border} />
              <Tooltip contentStyle={{ background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 12 }}
                labelFormatter={(l, p) => p?.[0] ? fmtDate(p[0].payload.date) : l} formatter={(v) => [fmt$(v), "Equity"]} />
              <Area type="monotone" dataKey="equity" stroke={COLORS.long} strokeWidth={2} fill="url(#eq)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState text="Log at least two closed trades to see your equity curve." />
        )}
      </div>

      <div className="card-hover" style={{ background: `linear-gradient(160deg, ${COLORS.bg1} 0%, ${COLORS.bg2}55 100%)`, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "18px 20px" }}>
        <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, color: COLORS.mid, fontWeight: 600, marginBottom: 10 }}>Recent Trades</div>
        {recent.length ? (
          <table>
            <thead><tr><th>Date</th><th>Symbol</th><th>Dir</th><th>P&L</th></tr></thead>
            <tbody>
              {recent.map(t => (
                <tr key={t.id}>
                  <td style={{ color: COLORS.mid }}>{fmtDate(t.date)}</td>
                  <td style={{ fontFamily: "IBM Plex Mono, monospace" }}>{t.symbol}</td>
                  <td style={{ color: t.direction === "Long" ? COLORS.long : COLORS.short }}>{t.direction}</td>
                  <td style={{ fontFamily: "IBM Plex Mono, monospace", color: parseFloat(t.pnl) >= 0 ? COLORS.long : COLORS.short }}>
                    {t.pnl !== "" ? fmt$(parseFloat(t.pnl)) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyState text="No trades yet — add one from the Trade Log tab." />}
      </div>
    </div>
  );
}

function CalendarView({ trades }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });

  const dayStats = useMemo(() => {
    const map = {};
    for (const t of trades) {
      if (t.pnl === "" || isNaN(parseFloat(t.pnl))) continue;
      const key = t.date;
      if (!map[key]) map[key] = { pnl: 0, count: 0 };
      map[key].pnl += parseFloat(t.pnl);
      map[key].count += 1;
    }
    return map;
  }, [trades]);

  const year = cursor.getFullYear(), month = cursor.getMonth();
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const pad = (n) => String(n).padStart(2, "0");
  const keyFor = (d) => `${year}-${pad(month + 1)}-${pad(d)}`;

  let monthTotal = 0;
  for (let d = 1; d <= daysInMonth; d++) { const s = dayStats[keyFor(d)]; if (s) monthTotal += s.pnl; }

  const today = new Date();
  const isToday = (d) => d && today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;

  const goToday = () => { const now = new Date(); setCursor(new Date(now.getFullYear(), now.getMonth(), 1)); };
  const prevMonth = () => setCursor(new Date(year, month - 1, 1));
  const nextMonth = () => setCursor(new Date(year, month + 1, 1));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 22, margin: "0 0 4px" }}>Calendar</h1>
          <p style={{ color: COLORS.mid, margin: 0, fontSize: 13 }}>Daily P&L at a glance — green for winning days, red for losing days.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Btn onClick={goToday}>Today</Btn>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <div onClick={prevMonth} style={{ padding: 8, borderRadius: 8, cursor: "pointer", color: COLORS.mid, border: `1px solid ${COLORS.border}` }}><ChevronLeft size={15} /></div>
            <div onClick={nextMonth} style={{ padding: 8, borderRadius: 8, cursor: "pointer", color: COLORS.mid, border: `1px solid ${COLORS.border}`, marginLeft: 4 }}><ChevronRight size={15} /></div>
          </div>
          <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 600, fontSize: 16 }}>{monthLabel}</span>
          <span style={{ fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, fontSize: 15, color: monthTotal >= 0 ? COLORS.long : COLORS.short }}>{fmt$(monthTotal)}</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr) 130px", gap: 8 }}>
        {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map(d => (
          <div key={d} style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, color: COLORS.low, textAlign: "center", paddingBottom: 2 }}>{d}</div>
        ))}
        <div />

        {weeks.map((week, wi) => {
          let weekPnl = 0, weekCount = 0, weekHasData = false;
          week.forEach(d => { if (d) { const s = dayStats[keyFor(d)]; if (s) { weekPnl += s.pnl; weekCount += s.count; weekHasData = true; } } });
          return (
            <React.Fragment key={wi}>
              {week.map((d, di) => {
                if (!d) return <div key={di} style={{ minHeight: 92, borderRadius: 10, background: "transparent" }} />;
                const s = dayStats[keyFor(d)];
                const win = s && s.pnl > 0, loss = s && s.pnl < 0;
                return (
                  <div key={di} className="card-hover" style={{
                    minHeight: 92, borderRadius: 10, padding: "8px 10px",
                    background: win ? "rgba(51,214,160,0.14)" : loss ? "rgba(255,107,122,0.14)" : COLORS.bg1,
                    border: `1px solid ${win ? "rgba(51,214,160,0.35)" : loss ? "rgba(255,107,122,0.35)" : COLORS.border}`,
                    outline: isToday(d) ? `1.5px solid ${COLORS.info}` : "none",
                    display: "flex", flexDirection: "column", justifyContent: "space-between",
                  }}>
                    <span style={{ fontSize: 12, fontWeight: isToday(d) ? 700 : 500, color: isToday(d) ? COLORS.info : COLORS.mid }}>{d}</span>
                    {s && (
                      <div>
                        <div style={{ fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, fontSize: 13.5, color: win ? COLORS.long : COLORS.short }}>{fmt$(s.pnl)}</div>
                        <div style={{ fontSize: 10.5, color: COLORS.mid }}>{s.count} trade{s.count === 1 ? "" : "s"}</div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div style={{
                minHeight: 92, borderRadius: 10, padding: "8px 12px", display: "flex", flexDirection: "column", justifyContent: "center",
                background: weekHasData ? (weekPnl >= 0 ? "rgba(51,214,160,0.08)" : "rgba(255,107,122,0.08)") : "transparent",
                border: weekHasData ? `1px solid ${COLORS.border}` : "1px solid transparent",
              }}>
                {weekHasData ? (
                  <>
                    <div style={{ fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, fontSize: 14, color: weekPnl >= 0 ? COLORS.long : COLORS.short }}>{fmt$(weekPnl)}</div>
                    <div style={{ fontSize: 10.5, color: COLORS.mid, marginTop: 2 }}>{weekCount} trade{weekCount === 1 ? "" : "s"}</div>
                  </>
                ) : null}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState({ text }) {
  return <div style={{ color: COLORS.low, fontSize: 13, padding: "24px 0", textAlign: "center" }}>{text}</div>;
}

function TradeLog({ trades, onAdd, onEdit, onDelete, expandedRow, setExpandedRow }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 22, margin: "0 0 4px" }}>Trade Log</h1>
          <p style={{ color: COLORS.mid, margin: 0, fontSize: 13 }}>Every field here — including inducement, FVG, and trend structure — is editable per trade.</p>
        </div>
        <Btn variant="primary" onClick={onAdd}><Plus size={15} /> Log Trade</Btn>
      </div>

      <div style={{ background: COLORS.bg1, border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: "hidden" }}>
        {trades.length === 0 ? <div style={{ padding: 30 }}><EmptyState text="No trades logged yet." /></div> : (
          <table>
            <thead>
              <tr><th></th><th>Date</th><th>Symbol</th><th>Dir</th><th>Entry</th><th>Exit</th><th>Size</th><th>P&L</th><th></th></tr>
            </thead>
            <tbody>
              {trades.map(t => {
                const isOpen = expandedRow === t.id;
                return (
                  <React.Fragment key={t.id}>
                    <tr style={{ cursor: "pointer" }} onClick={() => setExpandedRow(isOpen ? null : t.id)}>
                      <td style={{ width: 24 }}>{isOpen ? <ChevronUp size={14} color={COLORS.mid} /> : <ChevronDown size={14} color={COLORS.mid} />}</td>
                      <td style={{ color: COLORS.mid }}>{fmtDate(t.date)}</td>
                      <td style={{ fontFamily: "IBM Plex Mono, monospace", fontWeight: 600 }}>{t.symbol}</td>
                      <td>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: t.direction === "Long" ? COLORS.long : COLORS.short }}>
                          {t.direction === "Long" ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{t.direction}
                        </span>
                      </td>
                      <td style={{ fontFamily: "IBM Plex Mono, monospace" }}>{t.entryPrice || "—"}</td>
                      <td style={{ fontFamily: "IBM Plex Mono, monospace" }}>{t.exitPrice || "—"}</td>
                      <td style={{ fontFamily: "IBM Plex Mono, monospace" }}>{t.size || "—"}</td>
                      <td style={{ fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, color: parseFloat(t.pnl) >= 0 ? COLORS.long : COLORS.short }}>
                        {t.pnl !== "" ? fmt$(parseFloat(t.pnl)) : "—"}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <Btn onClick={() => onEdit(t)} style={{ padding: "5px 8px" }}>Edit</Btn>
                          <Btn variant="danger" onClick={() => onDelete(t.id)} style={{ padding: "5px 8px" }}><Trash2 size={13} /></Btn>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={9} style={{ background: COLORS.bg0, padding: "16px 22px" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
                            <DetailBlock title="Inducement" color={COLORS.warn}>
                              <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 13, marginBottom: 4 }}>{t.inducementLevel || "—"}</div>
                              <div style={{ color: COLORS.mid, fontSize: 12.5, lineHeight: 1.5 }}>{t.inducementDesc || "No description logged."}</div>
                            </DetailBlock>
                            <DetailBlock title="Fair Value Gap" color={COLORS.info}>
                              <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 13, marginBottom: 4 }}>
                                {t.fvgHigh || t.fvgLow ? `${t.fvgHigh || "?"} — ${t.fvgLow || "?"}` : "—"} <span style={{ color: COLORS.low }}>({t.fvgTf}, filled: {t.fvgFilled})</span>
                              </div>
                              <div style={{ color: COLORS.mid, fontSize: 12.5, lineHeight: 1.5 }}>{t.fvgDesc || "No description logged."}</div>
                            </DetailBlock>
                            <DetailBlock title="Trend Candle Structure" color={COLORS.long}>
                              <div style={{ color: COLORS.mid, fontSize: 12.5, lineHeight: 1.5 }}>{t.trendStructure || "No structure notes logged."}</div>
                            </DetailBlock>
                          </div>
                          {t.notes && (
                            <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${COLORS.border}` }}>
                              <div style={{ fontSize: 11, textTransform: "uppercase", color: COLORS.mid, fontWeight: 600, marginBottom: 4 }}>Trade Notes</div>
                              <div style={{ fontSize: 13, color: COLORS.hi, lineHeight: 1.5 }}>{t.notes}</div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function DetailBlock({ title, color, children }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block" }} />
        <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: COLORS.mid, fontWeight: 600 }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function TradeForm({ trade, onSave, onClose }) {
  const [f, setF] = useState(trade);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={trade?.notes === undefined ? "Log Trade" : "Trade"} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Field label="Date"><input type="date" style={inputStyle} value={f.date} onChange={set("date")} /></Field>
        <Field label="Symbol"><input style={inputStyle} placeholder="EURUSD" value={f.symbol} onChange={set("symbol")} /></Field>
        <Field label="Direction">
          <select style={selectStyle} value={f.direction} onChange={set("direction")}>
            <option>Long</option><option>Short</option>
          </select>
        </Field>
        <Field label="Entry Price"><input style={inputStyle} value={f.entryPrice} onChange={set("entryPrice")} /></Field>
        <Field label="Exit Price"><input style={inputStyle} value={f.exitPrice} onChange={set("exitPrice")} /></Field>
        <Field label="Size / Volume"><input style={inputStyle} value={f.size} onChange={set("size")} /></Field>
        <Field label="Stop Loss"><input style={inputStyle} value={f.stopLoss} onChange={set("stopLoss")} /></Field>
        <Field label="Take Profit"><input style={inputStyle} value={f.takeProfit} onChange={set("takeProfit")} /></Field>
        <Field label="P&L ($)"><input style={inputStyle} placeholder="e.g. 124.50 or -60" value={f.pnl} onChange={set("pnl")} /></Field>
      </div>

      <SectionDivider label="Inducement" color={COLORS.warn} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
        <Field label="Inducement Level (price)"><input style={inputStyle} placeholder="1.08420" value={f.inducementLevel} onChange={set("inducementLevel")} /></Field>
        <Field label="Description"><textarea style={taStyle} placeholder="e.g. Sell-side liquidity swept below equal lows before reversal" value={f.inducementDesc} onChange={set("inducementDesc")} /></Field>
      </div>

      <SectionDivider label="Fair Value Gap (FVG)" color={COLORS.info} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
        <Field label="FVG High"><input style={inputStyle} value={f.fvgHigh} onChange={set("fvgHigh")} /></Field>
        <Field label="FVG Low"><input style={inputStyle} value={f.fvgLow} onChange={set("fvgLow")} /></Field>
        <Field label="Timeframe">
          <select style={selectStyle} value={f.fvgTf} onChange={set("fvgTf")}>
            {["M5", "M15", "H1", "H4", "D1"].map(x => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="Filled?">
          <select style={selectStyle} value={f.fvgFilled} onChange={set("fvgFilled")}>
            <option>No</option><option>Partially</option><option>Yes</option>
          </select>
        </Field>
      </div>
      <div style={{ marginTop: 12 }}>
        <Field label="FVG Description"><textarea style={taStyle} placeholder="e.g. 3-candle imbalance formed on impulsive move away from inducement, price returned to 50% before continuation" value={f.fvgDesc} onChange={set("fvgDesc")} /></Field>
      </div>

      <SectionDivider label="Trend Candle Structure" color={COLORS.long} />
      <Field label="Structure Description" hint="Describe the candle sequence: impulse vs. correction, wick/body ratio, engulfing, momentum shift, etc.">
        <textarea style={{ ...taStyle, minHeight: 90 }} placeholder="e.g. Three consecutive expansion candles with minimal upper wicks, followed by a doji at the FVG midpoint signaling exhaustion before continuation" value={f.trendStructure} onChange={set("trendStructure")} />
      </Field>

      <SectionDivider label="General Notes" />
      <Field label="Trade Notes"><textarea style={taStyle} value={f.notes} onChange={set("notes")} /></Field>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={() => onSave(f)}><Save size={14} /> Save Trade</Btn>
      </div>
    </Modal>
  );
}

function SectionDivider({ label, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "22px 0 12px" }}>
      {color && <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />}
      <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: COLORS.mid }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: COLORS.border }} />
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(4,6,9,0.6)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", zIndex: 50, overflowY: "auto" }}>
      <div style={{ background: COLORS.bg1, border: `1px solid ${COLORS.border}`, borderRadius: 14, width: "100%", maxWidth: 720, padding: "22px 26px 26px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 18, margin: 0 }}>{title}</h2>
          <X size={18} style={{ cursor: "pointer", color: COLORS.mid }} onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}

function AresSettings({ aresKey, setAresKey, onReplay, onClose }) {
  const [draft, setDraft] = useState(aresKey);
  return (
    <Modal title="Ares — Voice Briefing" onClose={onClose}>
      <p style={{ color: COLORS.mid, fontSize: 13, lineHeight: 1.6, margin: "0 0 16px" }}>
        Ares greets you on launch and reads a short market news briefing using your computer's
        built-in voice engine. The voice works with no setup — news needs a free Alpha Vantage API key.
      </p>
      <p style={{ color: COLORS.low, fontSize: 12, lineHeight: 1.6, margin: "0 0 16px", padding: "10px 12px", background: COLORS.bg2, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
        Sound robotic? Windows' default voices are older-generation. For a smoother, natural British voice — free,
        no code needed — open Windows Settings → Time &amp; Language → Speech → Manage voices → Add voices →
        English (United Kingdom), and pick one marked "Natural" (e.g. Libby or Sonia). Restart the app afterward.
      </p>
      <Field label="Alpha Vantage API Key" hint="Free instantly at alphavantage.co/support/#api-key — email only, no card. Left blank, Ares still greets you, just without news.">
        <input style={inputStyle} placeholder="Paste your Alpha Vantage API key" value={draft} onChange={(e) => setDraft(e.target.value)} />
      </Field>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 20 }}>
        <Btn onClick={onReplay}><Volume2 size={14} /> Replay Briefing</Btn>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={() => { setAresKey(draft); onClose(); }}><Save size={14} /> Save</Btn>
        </div>
      </div>
    </Modal>
  );
}

function SetupLibrary({ setups, onAdd, onEdit, onDelete }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 22, margin: "0 0 4px" }}>Setup Library</h1>
          <p style={{ color: COLORS.mid, margin: 0, fontSize: 13 }}>Pre-trade analysis: inducement, FVGs, and trend structure — tracked independently of executed trades.</p>
        </div>
        <Btn variant="primary" onClick={onAdd}><Plus size={15} /> New Setup</Btn>
      </div>

      {setups.length === 0 ? (
        <div style={{ background: COLORS.bg1, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 30 }}>
          <EmptyState text="No setups tracked yet — log a level you're watching before it triggers." />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {setups.map(s => (
            <div key={s.id} style={{ background: COLORS.bg1, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, fontSize: 15 }}>{s.symbol || "—"} <span style={{ color: COLORS.mid, fontWeight: 400, fontSize: 12 }}>{s.timeframe}</span></div>
                  <div style={{ color: COLORS.low, fontSize: 11.5 }}>{fmtDate(s.date)}</div>
                </div>
                <span style={{
                  fontSize: 11, padding: "3px 8px", borderRadius: 20, fontWeight: 600,
                  color: s.status === "Triggered" ? COLORS.long : s.status === "Invalidated" ? COLORS.short : COLORS.info,
                  background: COLORS.bg2, border: `1px solid ${COLORS.border}`,
                }}>{s.status}</span>
              </div>
              <DetailBlock title="Inducement" color={COLORS.warn}>
                <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 13 }}>{s.inducementLevel || "—"}</div>
                <div style={{ color: COLORS.mid, fontSize: 12.5, marginTop: 2 }}>{s.inducementDesc || "—"}</div>
              </DetailBlock>
              <div style={{ height: 10 }} />
              <DetailBlock title="FVG" color={COLORS.info}>
                <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 13 }}>
                  {s.fvgHigh || s.fvgLow ? `${s.fvgHigh || "?"} — ${s.fvgLow || "?"}` : "—"} <span style={{ color: COLORS.low }}>({s.fvgTf}, filled: {s.fvgFilled})</span>
                </div>
                <div style={{ color: COLORS.mid, fontSize: 12.5, marginTop: 2 }}>{s.fvgDesc || "—"}</div>
              </DetailBlock>
              <div style={{ height: 10 }} />
              <DetailBlock title="Trend Structure" color={COLORS.long}>
                <div style={{ color: COLORS.mid, fontSize: 12.5 }}>{s.trendStructure || "—"}</div>
              </DetailBlock>
              <div style={{ display: "flex", gap: 6, marginTop: 14, justifyContent: "flex-end" }}>
                <Btn onClick={() => onEdit(s)} style={{ padding: "5px 8px" }}>Edit</Btn>
                <Btn variant="danger" onClick={() => onDelete(s.id)} style={{ padding: "5px 8px" }}><Trash2 size={13} /></Btn>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SetupForm({ setup, onSave, onClose }) {
  const [f, setF] = useState(setup);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="Setup" onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
        <Field label="Date"><input type="date" style={inputStyle} value={f.date} onChange={set("date")} /></Field>
        <Field label="Symbol"><input style={inputStyle} placeholder="GBPUSD" value={f.symbol} onChange={set("symbol")} /></Field>
        <Field label="Timeframe">
          <select style={selectStyle} value={f.timeframe} onChange={set("timeframe")}>
            {["M5", "M15", "H1", "H4", "D1"].map(x => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select style={selectStyle} value={f.status} onChange={set("status")}>
            <option>Watching</option><option>Triggered</option><option>Invalidated</option>
          </select>
        </Field>
      </div>

      <SectionDivider label="Inducement" color={COLORS.warn} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
        <Field label="Level (price)"><input style={inputStyle} value={f.inducementLevel} onChange={set("inducementLevel")} /></Field>
        <Field label="Description"><textarea style={taStyle} value={f.inducementDesc} onChange={set("inducementDesc")} /></Field>
      </div>

      <SectionDivider label="Fair Value Gap (FVG)" color={COLORS.info} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
        <Field label="FVG High"><input style={inputStyle} value={f.fvgHigh} onChange={set("fvgHigh")} /></Field>
        <Field label="FVG Low"><input style={inputStyle} value={f.fvgLow} onChange={set("fvgLow")} /></Field>
        <Field label="Timeframe">
          <select style={selectStyle} value={f.fvgTf} onChange={set("fvgTf")}>
            {["M5", "M15", "H1", "H4", "D1"].map(x => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="Filled?">
          <select style={selectStyle} value={f.fvgFilled} onChange={set("fvgFilled")}>
            <option>No</option><option>Partially</option><option>Yes</option>
          </select>
        </Field>
      </div>
      <div style={{ marginTop: 12 }}>
        <Field label="FVG Description"><textarea style={taStyle} value={f.fvgDesc} onChange={set("fvgDesc")} /></Field>
      </div>

      <SectionDivider label="Trend Candle Structure" color={COLORS.long} />
      <Field label="Structure Description"><textarea style={{ ...taStyle, minHeight: 90 }} value={f.trendStructure} onChange={set("trendStructure")} /></Field>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={() => onSave(f)}><Save size={14} /> Save Setup</Btn>
      </div>
    </Modal>
  );
}

function ImportPanel({ importText, setImportText, handleCsvText, handleFile, importPreview, importError, commitImport, fileRef }) {
  return (
    <div>
      <h1 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 22, margin: "0 0 4px" }}>Import & Sync</h1>
      <p style={{ color: COLORS.mid, margin: "0 0 20px", fontSize: 13, maxWidth: 640 }}>
        Bring in trades exported from cTrader's history tab, or from a cBot that auto-writes closed trades to CSV. True real-time auto-sync needs a small always-on bridge to cTrader's Open API — ask if you want that built as a separate piece.
      </p>

      <div style={{ background: COLORS.bg1, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <UploadCloud size={16} color={COLORS.info} />
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>Upload CSV</span>
        </div>
        <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} style={{ marginBottom: 14, fontSize: 13 }} />
        <textarea
          style={{ ...taStyle, minHeight: 110, width: "100%" }}
          placeholder="...or paste CSV content here"
          value={importText}
          onChange={(e) => { setImportText(e.target.value); handleCsvText(e.target.value); }}
        />
        {importError && <div style={{ color: COLORS.short, fontSize: 12.5, marginTop: 8 }}>{importError}</div>}
      </div>

      {importPreview.length > 0 && (
        <div style={{ background: COLORS.bg1, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20, marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 13.5 }}>Preview — {importPreview.length} trades detected</span>
            <Btn variant="primary" onClick={commitImport}><Save size={14} /> Import All</Btn>
          </div>
          <table>
            <thead><tr><th>Date</th><th>Symbol</th><th>Dir</th><th>Entry</th><th>Exit</th><th>P&L</th></tr></thead>
            <tbody>
              {importPreview.slice(0, 8).map(t => (
                <tr key={t.id}>
                  <td style={{ color: COLORS.mid }}>{fmtDate(t.date)}</td>
                  <td style={{ fontFamily: "IBM Plex Mono, monospace" }}>{t.symbol}</td>
                  <td style={{ color: t.direction === "Long" ? COLORS.long : COLORS.short }}>{t.direction}</td>
                  <td style={{ fontFamily: "IBM Plex Mono, monospace" }}>{t.entryPrice}</td>
                  <td style={{ fontFamily: "IBM Plex Mono, monospace" }}>{t.exitPrice}</td>
                  <td style={{ fontFamily: "IBM Plex Mono, monospace" }}>{t.pnl}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {importPreview.length > 8 && <div style={{ color: COLORS.low, fontSize: 12, marginTop: 8 }}>+ {importPreview.length - 8} more rows</div>}
        </div>
      )}

      <div style={{ background: COLORS.bg1, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Info size={15} color={COLORS.warn} />
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>Getting trades out of cTrader</span>
        </div>
        <ol style={{ color: COLORS.mid, fontSize: 13, lineHeight: 1.8, paddingLeft: 18, margin: 0 }}>
          <li><b style={{ color: COLORS.hi }}>Manual export (works today):</b> in cTrader, go to History → select date range → Export → CSV, then drop the file above.</li>
          <li><b style={{ color: COLORS.hi }}>Semi-automatic (cBot):</b> a small C# cBot running inside cTrader/cAlgo can write each closed position to a CSV the moment it closes. You'd still drop that file here, but it stays continuously up to date without manual exporting.</li>
          <li><b style={{ color: COLORS.hi }}>Fully automatic:</b> requires a standalone bridge app using cTrader's Open API (your own app ID + OAuth) running at all times to push trades in live. This is a distinct project with its own credentials and hosting — happy to build it as a follow-up if you want it.</li>
        </ol>
      </div>
    </div>
  );
}
