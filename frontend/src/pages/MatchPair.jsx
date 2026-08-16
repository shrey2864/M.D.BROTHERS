import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, RotateCcw, MessageCircle, Gem } from "lucide-react";
import { api } from "@/lib/api";
import { waLink } from "@/lib/config";
import { useAuth } from "@/context/AuthContext";
import { Overline, MaskedLine, Reveal } from "@/components/Reveal";
import { SHAPE_ICONS, ShapeIcon } from "@/pages/SearchSelect";

const COLOR_OPTIONS = ["Any", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O-Z", "Fancy"];
const CLARITY_OPTIONS = ["Any", "FL", "IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2", "SI3", "I1", "I2", "I3"];
const LAB_OPTIONS = ["Any", "GIA", "IGI", "HRD"];

const Gate = ({ user }) => (
  <div className="mx-auto max-w-[1440px] px-6 pb-32 pt-40" data-testid="match-pair-gate">
    <Overline>{!user ? "Members Only" : "Approval Pending"}</Overline>
    <h1 className="mt-4 max-w-2xl font-serif text-5xl font-light leading-tight text-white">
      {!user ? (<>Match pair search is <span className="italic text-gold">members only.</span></>)
        : (<>Your account is <span className="italic text-gold">under review.</span></>)}
    </h1>
    <p className="mt-6 max-w-lg text-sm leading-relaxed text-zinc-400">
      {!user
        ? "Register with your company and KYC details — once approved, match pair search unlocks."
        : "Once our team approves your account, match pair search, the collection and live pricing will unlock."}
    </p>
    {!user && (
      <div className="mt-10 flex flex-wrap gap-4">
        <Link to="/register" data-testid="match-gate-register-button"
          className="bg-gold px-8 py-4 font-mono text-[11px] uppercase tracking-[0.25em] text-black transition-colors hover:bg-gold-light active:scale-95">
          Register for Access
        </Link>
        <Link to="/login" data-testid="match-gate-login-button"
          className="border border-white/20 px-8 py-4 font-mono text-[11px] uppercase tracking-[0.25em] text-white transition-colors hover:border-gold hover:text-gold active:scale-95">
          Sign In
        </Link>
      </div>
    )}
  </div>
);

const PairCard = ({ pair, index }) => {
  const { a, b } = pair;
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.7, delay: (index % 3) * 0.08, ease: [0.22, 1, 0.36, 1] }}
      className="border border-white/10 bg-[#0C1E30]"
      data-testid={`pair-card-${a.sku}-${b.sku}`}
    >
      <div className="grid grid-cols-2">
        {[a, b].map((d) => (
          <Link key={d.diamond_id} to={`/diamonds/${d.diamond_id}`} data-testid={`pair-stone-${d.sku}`} className="group relative block overflow-hidden">
            <img src={d.image} alt={`${d.shape} ${d.sku}`} loading="lazy"
              className="aspect-square w-full object-cover transition-transform duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-black/20 transition-opacity group-hover:opacity-0" />
            <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-3 py-2 backdrop-blur">
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-400">{d.sku}</p>
              <p className="text-sm text-white">{d.carat.toFixed(2)} ct • {d.color} • {d.clarity}</p>
            </div>
          </Link>
        ))}
      </div>
      <div className="border-t border-white/10 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-serif text-xl text-white">Pair Total: {pair.total_carat.toFixed(2)} CT</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              {a.shape} • {a.color} • {a.clarity} • ±{pair.carat_diff.toFixed(2)} ct apart
            </p>
          </div>
          <p className="font-serif text-2xl text-gold" data-testid={`pair-price-${a.sku}`}>${pair.total_price.toLocaleString()}</p>
        </div>
        <a
          href={waLink(`Hello M.D.Brothers, I'm interested in the matched pair ${a.sku} + ${b.sku} — ${pair.total_carat.toFixed(2)} ct total ${a.shape} (${a.color}/${a.clarity}).`)}
          target="_blank" rel="noopener noreferrer" data-testid={`pair-whatsapp-${a.sku}`}
          className="mt-4 flex items-center justify-center gap-2 border border-emerald-500/50 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-400 transition-colors hover:bg-emerald-500 hover:text-black active:scale-95">
          <MessageCircle className="h-4 w-4" strokeWidth={1.5} /> Enquire This Pair
        </a>
      </div>
    </motion.div>
  );
};

export default function MatchPair() {
  const { user } = useAuth();
  const canView = !!user && (user.role === "admin" || user.status === "approved");
  const [shape, setShape] = useState(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [color, setColor] = useState("Any");
  const [clarity, setClarity] = useState("Any");
  const [lab, setLab] = useState("Any");
  const [pairs, setPairs] = useState(null);
  const [loading, setLoading] = useState(false);

  const findPairs = async () => {
    setLoading(true);
    try {
      const params = {};
      if (shape) params.shape = shape;
      if (from) params.min_carat = from;
      if (to) params.max_carat = to;
      if (color !== "Any") params.color = color;
      if (clarity !== "Any") params.clarity = clarity;
      if (lab !== "Any") params.lab = lab;
      const { data } = await api.get("/match-pairs", { params });
      setPairs(data.pairs);
    } catch {
      setPairs([]);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setShape(null); setFrom(""); setTo(""); setColor("Any"); setClarity("Any"); setLab("Any"); setPairs(null);
  };

  if (user === null)
    return <div className="px-6 py-40 font-mono text-xs uppercase tracking-[0.3em] text-zinc-600">Loading…</div>;
  if (!canView) return <Gate user={user} />;

  return (
    <div className="mx-auto max-w-[1440px] px-6 pb-32 pt-32" data-testid="match-pair-page">
      <Overline>Match Pair</Overline>
      <MaskedLine className="mt-4">
        <h1 className="font-serif text-5xl font-light text-white sm:text-6xl">
          Perfect <span className="italic text-gold">pairs.</span>
        </h1>
      </MaskedLine>
      <p className="mt-4 max-w-lg text-sm text-zinc-500">
        Find two stones with identical specs and near-identical carats — ideal for earrings and side stones.
      </p>

      {/* Filters */}
      <div className="mt-12 border border-white/10 bg-[#0C1E30] p-8" data-testid="match-filters">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-gold">Shape</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.keys(SHAPE_ICONS).map((s) => {
            const active = shape === s;
            return (
              <button key={s} onClick={() => setShape(active ? null : s)} data-testid={`match-shape-${s.toLowerCase()}`}
                className={`flex w-[88px] flex-col items-center gap-1.5 border py-3 transition-all duration-300 active:scale-95 ${
                  active ? "border-gold bg-gold text-black" : "border-white/10 text-zinc-400 hover:border-gold/50 hover:text-white"
                }`}>
                <ShapeIcon shape={s} active={active} />
                <span className="font-mono text-[9px] uppercase tracking-[0.15em]">{s}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          <input type="number" step="0.01" placeholder="Carat from" value={from} onChange={(e) => setFrom(e.target.value)}
            className="lux-input" data-testid="match-carat-from" />
          <input type="number" step="0.01" placeholder="Carat to" value={to} onChange={(e) => setTo(e.target.value)}
            className="lux-input" data-testid="match-carat-to" />
          {[
            ["Color", color, setColor, COLOR_OPTIONS, "match-color"],
            ["Clarity", clarity, setClarity, CLARITY_OPTIONS, "match-clarity"],
            ["Lab", lab, setLab, LAB_OPTIONS, "match-lab"],
          ].map(([label, val, setter, opts, tid]) => (
            <label key={label} className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">{label}</span>
              <select value={val} onChange={(e) => setter(e.target.value)} data-testid={`${tid}-select`}
                className="mt-2 w-full border-b border-white/20 bg-transparent py-2 text-sm text-white focus:border-gold focus:outline-none [&>option]:bg-[#07131F]">
                {opts.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          ))}
        </div>

        <div className="mt-8 flex gap-3">
          <button onClick={findPairs} disabled={loading} data-testid="match-find-button"
            className="flex items-center gap-2 bg-gold px-8 py-3 font-mono text-[11px] uppercase tracking-[0.25em] text-black transition-colors hover:bg-gold-light active:scale-95 disabled:opacity-50">
            <Search className="h-4 w-4" strokeWidth={1.5} /> {loading ? "Matching…" : "Find Pairs"}
          </button>
          <button onClick={reset} data-testid="match-reset-button"
            className="flex items-center gap-2 border border-white/20 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-300 transition-colors hover:border-gold hover:text-gold active:scale-95">
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} /> Reset
          </button>
        </div>
      </div>

      {/* Results */}
      {pairs !== null && (
        <div className="mt-14">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-500" data-testid="match-results-count">
            {loading ? "Matching…" : `${pairs.length} matched pair${pairs.length === 1 ? "" : "s"}`}
          </p>
          {pairs.length > 0 ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="match-results-grid">
              {pairs.map((p, i) => <PairCard key={`${p.a.sku}-${p.b.sku}`} pair={p} index={i} />)}
            </div>
          ) : (
            <Reveal className="mt-6 border border-white/10 py-20 text-center" data-testid="match-empty">
              <Gem className="mx-auto h-6 w-6 text-zinc-700" strokeWidth={1} />
              <p className="mt-4 font-serif text-2xl italic text-zinc-500">No matched pairs for this criteria.</p>
              <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-600">Try widening the carat range — or ask us to cut a pair for you</p>
            </Reveal>
          )}
        </div>
      )}
    </div>
  );
}
