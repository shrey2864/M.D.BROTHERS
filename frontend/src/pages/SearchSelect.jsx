import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, RotateCcw } from "lucide-react";
import { Overline, MaskedLine } from "@/components/Reveal";
import { useAuth } from "@/context/AuthContext";

export const SHAPE_ICONS = {
  Round: { outline: "M12,2 A10,10 0 1,1 11.99,2 Z" },
  Oval: { outline: "M12,1.5 C17.5,1.5 21,6 21,12 C21,18 17.5,22.5 12,22.5 C6.5,22.5 3,18 3,12 C3,6 6.5,1.5 12,1.5 Z" },
  Pear: { outline: "M12,1.5 C15,5 19,10.5 19,14.5 A7,7 0 1,1 5,14.5 C5,10.5 9,5 12,1.5 Z" },
  Marquise: { outline: "M12,1 C16,5.5 19,9 19,12 C19,15 16,18.5 12,23 C8,18.5 5,15 5,12 C5,9 8,5.5 12,1 Z" },
  Heart: { outline: "M12,21 C3,14.5 2,8.5 6.3,5.5 C9,3.7 12,5.5 12,8.2 C12,5.5 15,3.7 17.7,5.5 C22,8.5 21,14.5 12,21 Z" },
  Cushion: { outline: "M4,4 Q4,12 4,20 Q12,20 20,20 Q20,12 20,4 Q12,4 4,4 Z", rx: 6 },
  "Cushion B": { outline: "M3.5,3.5 Q3.5,12 3.5,20.5 Q12,20.5 20.5,20.5 Q20.5,12 20.5,3.5 Q12,3.5 3.5,3.5 Z", rx: 7 },
  Emerald: { outline: "M8,3 H16 L21,8 V16 L16,21 H8 L3,16 V8 Z" },
  "Sq.emerald": { outline: "M7,3 H17 L21,7 V17 L17,21 H7 L3,17 V7 Z" },
  Princess: { outline: "M4,4 H20 V20 H4 Z" },
  Square: { outline: "M4,4 H20 V20 H4 Z" },
  Radiant: { outline: "M7.5,3 H16.5 L21,7.5 V16.5 L16.5,21 H7.5 L3,16.5 V7.5 Z" },
  "L Radiant": { outline: "M6.5,3 H14.5 L18.5,7 V21 L9.5,20.5 L5.5,17 V7 Z" },
  "Other Cuts": { outline: "M12,1.5 L20.5,8 L17.5,19 L6.5,19 L3.5,8 Z" },
  Pair: { isPair: true },
};

export const ShapeIcon = ({ shape, active }) => {
  const data = SHAPE_ICONS[shape];
  if (!data) return null;

  const fill = active ? "#D4AF37" : "#e4e4e7";
  const stroke = active ? "#0C1E30" : "#71717a";

  if (data.isPair) {
    return (
      <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true">
        <circle cx="8" cy="12" r="6" fill={fill} stroke={stroke} strokeWidth="0.7" />
        <circle cx="16" cy="12" r="6" fill={fill} stroke={stroke} strokeWidth="0.7" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true">
      <path d={data.outline} fill={fill} stroke={stroke} strokeWidth="0.7" strokeLinejoin="round" />
    </svg>
  );
};

const CARAT_PRESETS = [
  { label: "All", range: null },
  { label: "30s Down", range: [0.18, 0.29] },
  { label: "30s", range: [0.3, 0.39] },
  { label: "40s", range: [0.4, 0.49] },
  { label: "50s - 60s", range: [0.5, 0.69] },
  { label: "70s - 80s", range: [0.7, 0.89] },
  { label: "90s", range: [0.9, 0.99] },
  { label: "1 ct", range: [1.0, 1.49] },
  { label: "1.5 ct", range: [1.5, 1.99] },
  { label: "2 ct", range: [2.0, 2.99] },
  { label: "3 ct - 4 ct", range: [3.0, 4.99] },
  { label: "5 ct +", range: [5.0, 10] },
];

const WHITE_COLORS = ["D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O-Z"];
const FANCY_COLORS = [
  { value: "Fancy", label: "Fancy" },
  { value: "Fancy Purplish", label: "Purplish" },
  { value: "Fancy Yellow", label: "Yellow" },
  { value: "Fancy Orange", label: "Orange" },
  { value: "Fancy Blue", label: "Blue" },
  { value: "Fancy Pink", label: "Pink" },
  { value: "Fancy Brown", label: "Brown" },
  { value: "Fancy Gray", label: "Gray" },
  { value: "Fancy Green", label: "Green" },
];

const CLARITY_OPTIONS = ["FL", "IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2", "SI3", "I1", "I2", "I3"];

const PILL_GROUPS = [
  { key: "clarity", label: "Clarity", options: CLARITY_OPTIONS },
  { key: "fluorescence", label: "Fluorescence", options: ["None", "Faint", "Medium", "Strong"] },
  { key: "lab", label: "Lab", options: ["GIA", "IGI", "HRD"] },
  { key: "cut", label: "Cut", options: ["Excellent", "Very Good", "Good"] },
  { key: "polish", label: "Polish", options: ["Excellent", "Very Good", "Good"] },
  { key: "symmetry", label: "Symmetry", options: ["Excellent", "Very Good", "Good"] },
];

const QUICK_TOGGLES = [
  { key: "3ex", label: "3EX", pills: { cut: ["Excellent"], polish: ["Excellent"], symmetry: ["Excellent"] } },
  { key: "2ex", label: "2EX", pills: { cut: ["Excellent"], polish: ["Excellent", "Very Good"], symmetry: ["Excellent", "Very Good"] } },
  { key: "3vg", label: "3VG+", pills: { cut: ["Excellent", "Very Good"], polish: ["Excellent", "Very Good"], symmetry: ["Excellent", "Very Good"] } },
  { key: "nobgm", label: "NO BGM", pills: { fluorescence: ["None"] } },
];

const Gate = ({ user }) => (
  <div className="mx-auto max-w-[1440px] px-6 pb-32 pt-40" data-testid="search-gate">
    <Overline>{!user ? "Members Only" : "Approval Pending"}</Overline>
    <h1 className="mt-4 max-w-2xl font-serif text-5xl font-light leading-tight text-white">
      {!user ? (<>Diamond search is <span className="italic text-gold">members only.</span></>)
        : (<>Your account is <span className="italic text-gold">under review.</span></>)}
    </h1>
    <p className="mt-6 max-w-lg text-sm leading-relaxed text-zinc-400">
      {!user
        ? "Register with your company and KYC details — once approved, the full diamond search unlocks."
        : "Once our team approves your account, the diamond search, collection and live pricing will unlock."}
    </p>
    {!user && (
      <div className="mt-10 flex flex-wrap gap-4">
        <Link to="/register" data-testid="search-gate-register-button"
          className="bg-gold px-8 py-4 font-mono text-[11px] uppercase tracking-[0.25em] text-black transition-colors hover:bg-gold-light active:scale-95">
          Register for Access
        </Link>
        <Link to="/login" data-testid="search-gate-login-button"
          className="border border-white/20 px-8 py-4 font-mono text-[11px] uppercase tracking-[0.25em] text-white transition-colors hover:border-gold hover:text-gold active:scale-95">
          Sign In
        </Link>
      </div>
    )}
  </div>
);

export default function SearchSelect() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canView = !!user && (user.role === "admin" || user.status === "approved");
  const [searchParams] = useSearchParams();
  const initArr = (k) => searchParams.get(k)?.split(",").filter(Boolean) || [];
  const initMinCarat = searchParams.get("min_carat");
  const initMaxCarat = searchParams.get("max_carat");
  const initCarat = initMinCarat && initMaxCarat ? [parseFloat(initMinCarat), parseFloat(initMaxCarat)] : null;

  const [shapes, setShapes] = useState(initArr("shape"));
  const [caratRanges, setCaratRanges] = useState(initCarat ? [initCarat] : []);
  const [caratFrom, setCaratFrom] = useState("");
  const [caratTo, setCaratTo] = useState("");
  const [colors, setColors] = useState(initArr("color"));
  const [quick, setQuick] = useState([]);
  const [pills, setPills] = useState({
    clarity: initArr("clarity"),
    fluorescence: initArr("fluorescence"),
    lab: initArr("lab"),
    cut: initArr("cut"),
    polish: initArr("polish"),
    symmetry: initArr("symmetry"),
  });
  const toggleShape = (s) =>
    setShapes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const toggleColor = (v) =>
    setColors((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  const togglePill = (key, v) =>
    setPills((p) => ({ ...p, [key]: p[key].includes(v) ? p[key].filter((x) => x !== v) : [...p[key], v] }));

  const applyCustomCarat = () => {
    const from = parseFloat(caratFrom);
    const to = parseFloat(caratTo);
    let range = null;
    if (!isNaN(from) && !isNaN(to) && to >= from) range = [from, to];
    else if (!isNaN(from)) range = [from, 10];
    else if (!isNaN(to)) range = [0.18, to];
    if (range) setCaratRanges((prev) => [...prev, range]);
  };

const toggleCaratRange = (range) => {
  if (range === null) {
    setCaratRanges([]);
    return;
  }
  setCaratRanges((prev) => {
    const exists = prev.some((r) => r[0] === range[0] && r[1] === range[1]);
    return exists
      ? prev.filter((r) => !(r[0] === range[0] && r[1] === range[1]))
      : [...prev, range];
  });
};


  const toggleQuick = (qt) => {
    if (quick.includes(qt.key)) {
      setQuick(quick.filter((k) => k !== qt.key));
      setPills((p) => {
        const next = { ...p };
        Object.entries(qt.pills).forEach(([k, vals]) => {
          next[k] = next[k].filter((v) => !vals.includes(v));
        });
        return next;
      });
    } else {
      setQuick([...quick, qt.key]);
      setPills((p) => {
        const next = { ...p };
        Object.entries(qt.pills).forEach(([k, vals]) => {
          next[k] = [...new Set([...next[k], ...vals])];
        });
        return next;
      });
    }
  };

  const reset = () => {
    setShapes([]);
    setCarat(null);
    setCaratFrom("");
    setCaratTo("");
    setColors([]);
    setQuick([]);
    setPills({ clarity: [], fluorescence: [], lab: [], cut: [], polish: [], symmetry: [] });
  };

  const filterCount =
    shapes.length + colors.length + caratRanges.length + Object.values(pills).reduce((a, b) => a + b.length, 0);
  const search = () => {
    const params = new URLSearchParams();
    if (shapes.length) params.set("shape", shapes.join(","));
    if (colors.length) params.set("color", colors.join(","));
          if (caratRanges.length) {
        params.set("carat_ranges", caratRanges.map((r) => `${r[0]}-${r[1]}`).join(","));
      }
    Object.entries(pills).forEach(([k, v]) => {
      if (v.length) params.set(k, v.join(","));
    });
    navigate(`/collection?${params.toString()}`);
  };

  if (user !== null && !canView) return <Gate user={user} />;

  return (
    <div className="mx-auto max-w-[1440px] px-6 pb-40 pt-32" data-testid="search-select-page">
      <Overline>Diamond Search</Overline>
      <MaskedLine className="mt-4">
        <h1 className="font-serif text-5xl font-light text-white sm:text-6xl">
          Find your <span className="italic text-gold">stone.</span>
        </h1>
      </MaskedLine>
      <p className="mt-4 max-w-lg text-sm text-zinc-500">
        Select shapes, carat range and the four Cs — we'll show you matching stones from live inventory.
      </p>

{/* Shapes */}
<div className="mt-14" data-testid="search-shapes">
  <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-gold">Shapes</p>
  <div className="mt-5 flex flex-wrap gap-2">
    <button
      onClick={() => setShapes([])}
      data-testid="search-shape-all"
      className={`flex w-[76px] flex-col items-center justify-center gap-1 border py-3 transition-all duration-300 active:scale-95 ${
        shapes.length === 0 ? "border-gold bg-gold text-black" : "border-white/10 text-zinc-400 hover:border-gold/50 hover:text-white"
      }`}
    >
      <span className="font-mono text-[9px] uppercase tracking-[0.1em]">All Shapes</span>
    </button>
    {Object.keys(SHAPE_ICONS).map((s) => {
      const active = shapes.includes(s);
      return (
        <button key={s} onClick={() => toggleShape(s)} data-testid={`search-shape-${s.toLowerCase().replace(/\s/g, "-")}`}
          className={`flex w-[76px] flex-col items-center gap-1 border py-3 transition-all duration-300 active:scale-95 ${
            active ? "border-gold bg-gold text-black" : "border-white/10 text-zinc-400 hover:border-gold/50 hover:text-white"
          }`}>
          <ShapeIcon shape={s} active={active} />
          <span className="font-mono text-[9px] uppercase tracking-[0.1em]">{s}</span>
        </button>
      );
    })}
  </div>
</div>

      {/* Carat: custom From/To + presets */}
      <div className="mt-12" data-testid="search-carat">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-gold">Carat Range</p>
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <input type="number" step="0.01" min="0.18" placeholder="From" value={caratFrom}
            onChange={(e) => setCaratFrom(e.target.value)} data-testid="search-carat-from-input"
            className="w-28 border border-white/20 bg-transparent px-4 py-2.5 font-mono text-xs text-white placeholder:text-zinc-600 focus:border-gold focus:outline-none" />
          <input type="number" step="0.01" max="10" placeholder="To" value={caratTo}
            onChange={(e) => setCaratTo(e.target.value)} data-testid="search-carat-to-input"
            className="w-28 border border-white/20 bg-transparent px-4 py-2.5 font-mono text-xs text-white placeholder:text-zinc-600 focus:border-gold focus:outline-none" />
          <button onClick={applyCustomCarat} data-testid="search-carat-apply-button"
            className="border border-gold/50 px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-gold transition-colors hover:bg-gold hover:text-black active:scale-95">
            Apply
          </button>
          {caratRanges.length > 0 && (
                         <span className="py-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-400" data-testid="search-carat-selected">
                {caratRanges.length} range{caratRanges.length > 1 ? "s" : ""} selected
              </span>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {CARAT_PRESETS.map((c) => {
              const active = c.range === null
                ? caratRanges.length === 0
                : caratRanges.some((r) => r[0] === c.range[0] && r[1] === c.range[1]);
              return (
                <button key={c.label} onClick={() => toggleCaratRange(c.range)}
                  data-testid={`search-carat-${c.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  className={`border px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.15em] transition-all duration-300 active:scale-95 ${
                    active ? "border-gold bg-gold text-black" : "border-white/10 text-zinc-400 hover:border-gold/50 hover:text-white"
                  }`}>
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

      {/* Color: white D-N + O-Z | Fancy colour */}
      <div className="mt-12" data-testid="search-group-color">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em]">
          <span className="text-gold">Colour</span>
          <span className="mx-3 text-zinc-600">|</span>
          <span className="text-white">Fancy Colour</span>
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {WHITE_COLORS.map((c) => {
            const active = colors.includes(c);
            return (
              <button key={c} onClick={() => toggleColor(c)} data-testid={`search-color-${c.toLowerCase()}`}
                className={`border px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.15em] transition-all duration-300 active:scale-95 ${
                  active ? "border-gold bg-gold text-black" : "border-white/10 text-zinc-400 hover:border-gold/50 hover:text-white"
                }`}>
                {c}
              </button>
            );
          })}
        </div>
        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">Fancy</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {FANCY_COLORS.map((f) => {
            const active = colors.includes(f.value);
            return (
              <button key={f.value} onClick={() => toggleColor(f.value)} data-testid={`search-color-${f.value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={`border px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.15em] transition-all duration-300 active:scale-95 ${
                  active ? "border-gold bg-gold text-black" : "border-white/10 text-zinc-400 hover:border-gold/50 hover:text-white"
                }`}>
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pill groups */}
      {PILL_GROUPS.map((g) => (
        <div key={g.key} className="mt-12" data-testid={`search-group-${g.key}`}>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-gold">{g.label}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {g.options.map((o) => {
              const active = pills[g.key].includes(o);
              return (
                <button key={o} onClick={() => togglePill(g.key, o)} data-testid={`search-${g.key}-${o.toLowerCase().replace(/\s/g, "-")}`}
                  className={`border px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.15em] transition-all duration-300 active:scale-95 ${
                    active ? "border-gold bg-gold text-black" : "border-white/10 text-zinc-400 hover:border-gold/50 hover:text-white"
                  }`}>
                  {o}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Action bar with quick toggles */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-2" data-testid="search-quick-toggles">
            {QUICK_TOGGLES.map((qt) => (
              <button key={qt.key} onClick={() => toggleQuick(qt)} data-testid={`search-quick-${qt.key}`}
                className={`border px-4 py-2 font-mono text-[10px] uppercase tracking-[0.15em] transition-all duration-300 active:scale-95 ${
                  quick.includes(qt.key) ? "border-gold bg-gold text-black" : "border-white/15 text-zinc-400 hover:border-gold/50 hover:text-white"
                }`}>
                {qt.label}
              </button>
            ))}
            <span className="ml-3 hidden font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500 sm:inline" data-testid="search-filter-count">
              {filterCount === 0 ? "No filters — shows everything" : `${filterCount} filters selected`}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={reset} data-testid="search-reset-button"
              className="flex items-center gap-2 border border-white/20 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-300 transition-colors hover:border-gold hover:text-gold active:scale-95">
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} /> Reset
            </button>
            <button onClick={search} data-testid="search-submit-button"
              className="flex items-center gap-2 bg-gold px-8 py-3 font-mono text-[11px] uppercase tracking-[0.25em] text-black transition-colors hover:bg-gold-light active:scale-95">
              <Search className="h-4 w-4" strokeWidth={1.5} /> Search Diamonds
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
