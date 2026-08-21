import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { DiamondCard } from "@/components/DiamondCard";
import { Overline, MaskedLine, Reveal } from "@/components/Reveal";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";

const GROUPS = [
  { key: "shape", label: "Shape", options: ["Round", "Princess", "Oval", "Cushion", "Emerald", "Pear", "Marquise", "Radiant"] },
  { key: "color", label: "Color", options: ["D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O-Z", "Fancy", "Fancy Purplish", "Fancy Yellow", "Fancy Orange", "Fancy Blue", "Fancy Pink", "Fancy Brown", "Fancy Gray", "Fancy Green"] },
  { key: "clarity", label: "Clarity", options: ["FL", "IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2", "SI3", "I1", "I2", "I3"] },
  { key: "cut", label: "Cut", options: ["Excellent", "Very Good", "Good"] },
  { key: "polish", label: "Polish", options: ["Excellent", "Very Good", "Good"] },
  { key: "symmetry", label: "Symmetry", options: ["Excellent", "Very Good", "Good"] },
  { key: "fluorescence", label: "Fluorescence", options: ["None", "Faint", "Medium", "Strong"] },
  { key: "lab", label: "Lab", options: ["GIA", "IGI", "HRD"] },
];

export default function Catalog() {
  const { user } = useAuth();
  const canView = !!user && (user.role === "admin" || user.status === "approved");
  const [searchParams] = useSearchParams();
  const initArr = (k) => searchParams.get(k)?.split(",").filter(Boolean) || [];
  const [filters, setFilters] = useState({
    shape: initArr("shape"), color: initArr("color"), clarity: initArr("clarity"),
    cut: initArr("cut"), polish: initArr("polish"), symmetry: initArr("symmetry"),
    fluorescence: initArr("fluorescence"), lab: initArr("lab"),
  });
  const [carat, setCarat] = useState([
    parseFloat(searchParams.get("min_carat")) || 0.18,
    parseFloat(searchParams.get("max_carat")) || 10,
  ]);
  const [sort, setSort] = useState("featured");
  const [q, setQ] = useState("");
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  const toggle = (key, value) =>
    setFilters((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const params = {
      sort,
      min_carat: carat[0],
      max_carat: carat[1],
      ...(q && { q }),
    };
    ["shape", "color", "clarity", "cut", "polish", "symmetry", "fluorescence", "lab"].forEach((k) => {
      if (filters[k].length) params[k] = filters[k].join(",");
    });
    const t = setTimeout(() => {
      api.get("/diamonds", { params })
        .then((r) => setData(r.data))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [filters, carat, sort, q, canView]);

  if (user === null)
    return (
      <div className="px-6 py-40 font-mono text-xs uppercase tracking-[0.3em] text-zinc-600">Loading…</div>
    );

  if (!user || !canView)
    return (
      <div className="mx-auto max-w-[1440px] px-6 pb-32 pt-40" data-testid="catalog-gate">
        <Overline>{!user ? "Members Only" : "Approval Pending"}</Overline>
        <h1 className="mt-4 max-w-2xl font-serif text-5xl font-light leading-tight text-white">
          {!user ? (
            <>The collection is <span className="italic text-gold">private.</span></>
          ) : (
            <>Your account is <span className="italic text-gold">under review.</span></>
          )}
        </h1>
        <p className="mt-6 max-w-lg text-sm leading-relaxed text-zinc-400">
          {!user
            ? "Our live inventory and pricing are available exclusively to verified trade clients. Register with your company and KYC details — access is approved personally by our team."
            : "Thank you for registering. Our team is verifying your company and KYC details. Once approved, the full collection and live pricing will unlock here."}
        </p>
        {!user && (
          <div className="mt-10 flex flex-wrap gap-4">
            <Link to="/register" data-testid="gate-register-button"
              className="bg-gold px-8 py-4 font-mono text-[11px] uppercase tracking-[0.25em] text-black transition-colors hover:bg-gold-light active:scale-95">
              Register for Access
            </Link>
            <Link to="/login" data-testid="gate-login-button"
              className="border border-white/20 px-8 py-4 font-mono text-[11px] uppercase tracking-[0.25em] text-white transition-colors hover:border-gold hover:text-gold active:scale-95">
              Sign In
            </Link>
          </div>
        )}
      </div>
    );

  return (
    <div className="mx-auto max-w-[1440px] px-6 pb-32 pt-32" data-testid="catalog-page">
      <Overline>The Collection</Overline>
      <MaskedLine className="mt-4">
        <h1 className="font-serif text-5xl font-light text-white sm:text-6xl">
          Every stone, <span className="italic text-gold">accounted for.</span>
        </h1>
      </MaskedLine>
      <Reveal delay={0.2} className="mt-6 max-w-xl">
        <p className="text-sm leading-relaxed text-zinc-400">
          Filter our live inventory by the four Cs. Prices are visible to
          registered trade clients only.
        </p>
      </Reveal>

       <div className={`mt-16 grid gap-12 ${showFilters ? "lg:grid-cols-[260px_1fr]" : "grid-cols-1"}`}>
        {/* Filters */}
         {showFilters && (
      <aside className="lg:sticky lg:top-28 lg:self-start" data-testid="catalog-filters">
          <div className="relative mb-8">
            <Search className="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" strokeWidth={1.5} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search SKU…"
              data-testid="catalog-search-input"
              className="lux-input pl-7"
            />
          </div>

          <Accordion type="multiple" defaultValue={["shape", "carat", "color", "clarity", "cut"]}>
            {GROUPS.map((g) => (
              <AccordionItem key={g.key} value={g.key} className="border-white/10">
                <AccordionTrigger className="font-mono text-[11px] uppercase tracking-[0.25em] text-white hover:text-gold hover:no-underline">
                  {g.label}
                </AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-col gap-3 pt-1">
                    {g.options.map((opt) => (
                      <label key={opt} className="flex cursor-pointer items-center gap-3 text-sm text-zinc-400 transition-colors hover:text-white">
                        <Checkbox
                          checked={filters[g.key].includes(opt)}
                          onCheckedChange={() => toggle(g.key, opt)}
                          data-testid={`filter-${g.key}-${opt.toLowerCase().replace(/\s/g, "-")}-checkbox`}
                          className="rounded-none border-white/30 data-[state=checked]:border-gold data-[state=checked]:bg-gold data-[state=checked]:text-black"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
            <AccordionItem value="carat" className="border-white/10">
              <AccordionTrigger className="font-mono text-[11px] uppercase tracking-[0.25em] text-white hover:text-gold hover:no-underline">
                Carat
              </AccordionTrigger>
              <AccordionContent>
                <div className="px-1 pt-2">
                  <Slider min={0.18} max={10} step={0.01} value={carat} onValueChange={setCarat} data-testid="filter-carat-slider" />
                  <div className="mt-3 flex justify-between font-mono text-[10px] tracking-[0.2em] text-zinc-500">
                    <span data-testid="carat-min-label">{carat[0].toFixed(2)} CT</span>
                    <span data-testid="carat-max-label">{carat[1].toFixed(2)} CT</span>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </aside>
        )}
 {/* Results */}
<div>
  <div className="mb-8 flex items-center justify-between">
    <div className="flex items-center gap-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-500" data-testid="catalog-results-count">
        {loading ? "Searching…" : `${data.total} stones`}
      </p>
      <button
        onClick={() => setShowFilters((s) => !s)}
        data-testid="modify-search-button"
        className="border border-white/20 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-300 transition-colors hover:border-gold hover:text-gold active:scale-95"
      >
        {showFilters ? "Hide Filters" : "Modify Search"}
      </button>
    </div>
    <Select value={sort} onValueChange={setSort}>
              <SelectTrigger data-testid="catalog-sort-select" className="w-[180px] rounded-none border-white/20 bg-transparent font-mono text-[11px] uppercase tracking-[0.15em] text-zinc-300">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-none border-white/10 bg-[#0C1E30]">
                <SelectItem value="featured">Featured</SelectItem>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="carat_desc">Carat: High → Low</SelectItem>
                <SelectItem value="carat_asc">Carat: Low → High</SelectItem>
                <SelectItem value="price_asc">Price: Low → High</SelectItem>
                <SelectItem value="price_desc">Price: High → Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="catalog-grid">
            {data.items.map((d, i) => (
              <DiamondCard key={d.diamond_id} diamond={d} index={i} />
            ))}
          </div>

          {!loading && data.items.length === 0 && (
            <div className="border border-white/10 py-24 text-center" data-testid="catalog-empty-state">
              <p className="font-serif text-2xl italic text-zinc-500">No stones match your criteria.</p>
              <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-600">Loosen a filter or two</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
