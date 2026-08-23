import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, RotateCcw } from "lucide-react";
import { Overline, MaskedLine } from "@/components/Reveal";
import { useAuth } from "@/context/AuthContext";

export const SHAPE_ICONS = {
  Round: {
    outline: "M12 2 A10 10 0 1 1 11.99 2 Z",
    facets: ["M12 2 L12 22", "M2 12 L22 12", "M4.93 4.93 L19.07 19.07", "M19.07 4.93 L4.93 19.07", "M12 2 L19.07 4.93 L22 12 L19.07 19.07 L12 22 L4.93 19.07 L2 12 L4.93 4.93 Z"],
  },
  Oval: {
    outline: "M12 2 C18 2 21 6.5 21 12 C21 17.5 18 22 12 22 C6 22 3 17.5 3 12 C3 6.5 6 2 12 2 Z",
    facets: ["M12 2 L12 22", "M3 12 L21 12", "M12 2 C16 5 18 8.5 18 12 C18 15.5 16 19 12 22", "M12 2 C8 5 6 8.5 6 12 C6 15.5 8 19 12 22"],
  },
  Pear: {
    outline: "M12 2.5 C16.5 7.5 18.5 11 18.5 14.5 A6.5 6.5 0 1 1 5.5 14.5 C5.5 11 7.5 7.5 12 2.5 Z",
    facets: ["M12 2.5 L12 21", "M8.2 14.5 L15.8 14.5", "M12 2.5 C14.6 5.8 16.2 8.6 17 11.3 L15.8 14.5", "M12 2.5 C9.4 5.8 7.8 8.6 7 11.3 L8.2 14.5"],
  },
  Marquise: {
    outline: "M12 2.5 C16.5 6.5 16.5 17.5 12 21.5 C7.5 17.5 7.5 6.5 12 2.5 Z",
    facets: ["M12 2.5 L12 21.5", "M12 2.5 C14.4 6 15.3 9.5 15.3 12 C15.3 14.5 14.4 18 12 21.5", "M12 2.5 C9.6 6 8.7 9.5 8.7 12 C8.7 14.5 9.6 18 12 21.5"],
  },
  Heart: {
    outline: "M12 20.5 C4.5 14.5 3.5 9 7.3 6.3 C9.5 4.8 12 6.3 12 8.5 C12 6.3 14.5 4.8 16.7 6.3 C20.5 9 19.5 14.5 12 20.5 Z",
    facets: ["M12 8.5 L12 20.5", "M12 8.5 C9.4 10 8 11.8 8 13.6 L12 20.5", "M12 8.5 C14.6 10 16 11.8 16 13.6 L12 20.5"],
  },
  Cushion: {
    outline: "M4.5 4.5 H19.5 V19.5 H4.5 Z",
    facets: ["M4.5 4.5 L19.5 19.5", "M19.5 4.5 L4.5 19.5", "M8.3 8.3 L15.7 8.3 L15.7 15.7 L8.3 15.7 Z"],
  },
  "Cushion B": {
    outline: "M4.5 4.5 H19.5 V19.5 H4.5 Z",
    facets: ["M4.5 4.5 L8.3 8.3", "M19.5 4.5 L15.7 8.3", "M4.5 19.5 L8.3 15.7", "M19.5 19.5 L15.7 15.7", "M12 4.5 L12 19.5", "M4.5 12 L19.5 12", "M8.3 8.3 H15.7 V15.7 H8.3 Z"],
  },
  Emerald: {
    outline: "M8 3.5 H16 L20.5 8 V16 L16 20.5 H8 L3.5 16 V8 Z",
    facets: ["M8 3.5 L8.3 8.3", "M16 3.5 L15.7 8.3", "M3.5 8 L8.3 8.3", "M3.5 16 L8.3 15.7", "M20.5 8 L15.7 8.3", "M20.5 16 L15.7 15.7", "M8 20.5 L8.3 15.7", "M16 20.5 L15.7 15.7", "M8.3 8.3 H15.7 V15.7 H8.3 Z"],
  },
  "Sq.emerald": {
    outline: "M6.5 3.5 H17.5 L20.5 6.5 V17.5 L17.5 20.5 H6.5 L3.5 17.5 V6.5 Z",
    facets: ["M6.5 3.5 L8.3 8.3", "M17.5 3.5 L15.7 8.3", "M3.5 6.5 L8.3 8.3", "M3.5 17.5 L8.3 15.7", "M20.5 6.5 L15.7 8.3", "M20.5 17.5 L15.7 15.7", "M6.5 20.5 L8.3 15.7", "M17.5 20.5 L15.7 15.7", "M8.3 8.3 H15.7 V15.7 H8.3 Z"],
  },
  Princess: {
    outline: "M4.5 4.5 H19.5 V19.5 H4.5 Z",
    facets: ["M4.5 4.5 L19.5 19.5", "M19.5 4.5 L4.5 19.5"],
  },
  Square: {
    outline: "M4.5 4.5 H19.5 V19.5 H4.5 Z",
    facets: ["M4.5 4.5 L19.5 19.5", "M19.5 4.5 L4.5 19.5", "M12 4.5 L12 19.5", "M4.5 12 L19.5 12"],
  },
  Radiant: {
    outline: "M7 3.5 H17 L20.5 7 V17 L17 20.5 H7 L3.5 17 V7 Z",
    facets: ["M7 3.5 L8.3 8.3", "M17 3.5 L15.7 8.3", "M3.5 7 L8.3 8.3", "M3.5 17 L8.3 15.7", "M20.5 7 L15.7 8.3", "M20.5 17 L15.7 15.7", "M7 20.5 L8.3 15.7", "M17 20.5 L15.7 15.7", "M8.3 8.3 H15.7 V15.7 H8.3 Z"],
  },
  "L Radiant": {
    outline: "M6 3.5 H14 L18.5 7 V21 L10 20.5 L5.5 17 V7 Z",
    facets: ["M6 3.5 L7.6 8.2", "M14 3.5 L12.8 8.2", "M5.5 7 L7.6 8.2", "M5.5 17 L7.6 15.8", "M18.5 7 L12.8 8.2", "M18.5 21 L12.8 15.8", "M7.6 8.2 H12.8 V15.8 H7.6 Z"],
  },
  "Other Cuts": {
    outline: "M12 2.5 L20 8 L17.5 18.5 L6.5 18.5 L4 8 Z",
    facets: ["M12 2.5 L12 18.5", "M4 8 L20 8", "M12 2.5 L20 8", "M12 2.5 L4 8", "M6.5 18.5 L12 8", "M17.5 18.5 L12 8"],
  },
  Pair: {
    outline: "M4 12 A5 5 0 1 1 3.99 12 Z M13 12 A5 5 0 1 1 12.99 12 Z",
    facets: ["M4 7 L4 17", "M20 7 L20 17"],
    isPair: true,
  },
};

export const ShapeIcon = ({ shape, active }) => {
  const data = SHAPE_ICONS[shape];
  const id = `diamond-grad-${shape.replace(/\s/g, "")}-${active ? "on" : "off"}`;
  if (!data) return null;

  const gradientStops = active ? (
    <>
      <stop offset="0%" stopColor="#3a3120" />
      <stop offset="45%" stopColor="#000000" />
      <stop offset="100%" stopColor="#3a3120" />
    </>
  ) : (
    <>
      <stop offset="0%" stopColor="#4b5563" />
      <stop offset="45%" stopColor="#18181b" />
      <stop offset="100%" stopColor="#3f3f46" />
    </>
  );

  if (data.isPair) {
    return (
      <svg viewBox="0 0 24 24" className="h-9 w-9" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
            {gradientStops}
          </linearGradient>
        </defs>
        <circle cx="8" cy="12" r="5.5" fill={`url(#${id})`} stroke={active ? "#000" : "#71717a"} strokeWidth="0.6" />
        <circle cx="16" cy="12" r="5.5" fill={`url(#${id})`} stroke={active ? "#000" : "#71717a"} strokeWidth="0.6" />
        <ellipse cx="6" cy="9.5" rx="1.6" ry="0.9" fill="rgba(255,255,255,0.28)" transform="rotate(-25 6 9.5)" />
        <ellipse cx="14" cy="9.5" rx="1.6" ry="0.9" fill="rgba(255,255,255,0.28)" transform="rotate(-25 14 9.5)" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-9 w-9" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          {gradientStops}
        </linearGradient>
      </defs>
      <path d={data.outline} fill={`url(#${id})`} stroke={active ? "#000" : "#71717a"} strokeWidth="0.6" />
      {data.facets.map((f, i) => (
        <path key={i} d={f} fill="none" stroke={active ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.25)"} strokeWidth="0.5" />
      ))}
      <ellipse cx="9.5" cy="7" rx="3.2" ry="1.6" fill="rgba(255,255,255,0.28)" transform="rotate(-25 9.5 7)" />
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
