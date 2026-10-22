import { Fragment, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Download, ChevronLeft, Printer } from "lucide-react";
import { api, formatApiError, API_BASE } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Overline } from "@/components/Reveal";

// What can be printed on the slip (Plan no and a total per plan are always printed)
const SLIP_OPTIONS = [
  ["carat", "Size (carat)"],
  ["rough_weight", "Rough weight (at the top)"],
  ["shape", "Shape"],
  ["color", "Colour"],
  ["clarity", "Clarity"],
  ["fluorescence", "Fluorescence"],
  ["cut", "Cut"],
  ["polish", "Polish"],
  ["symmetry", "Symmetry"],
  ["rapaport", "Rapaport"],
  ["discount", "Discount %"],
  ["gross", "Gross value"],
  ["net", "Net value (total)"],
];
const SLIP_DEFAULT = [
  "carat", "rough_weight", "color", "clarity", "fluorescence",
  "cut", "polish", "symmetry", "discount", "net",
];

export default function PricingDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [packets, setPackets] = useState([]);
  const [loadingPackets, setLoadingPackets] = useState(true);
  const [selectedPacket, setSelectedPacket] = useState(null); // null = list view
  const [search, setSearch] = useState("");

  const [items, setItems] = useState([]);
  const [discounts, setDiscounts] = useState({});
  const [saving, setSaving] = useState({});

  // print slip options (remembered in this browser)
  const [showSlip, setShowSlip] = useState(false);
  const [slipPaper, setSlipPaper] = useState(() => {
    try {
      return localStorage.getItem("slipPaper") || "4x6";
    } catch (e) {
      return "4x6";
    }
  });
  const [slipFields, setSlipFields] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("slipFields"));
      if (Array.isArray(saved) && saved.length) return saved;
    } catch (e) {
      /* ignore */
    }
    return SLIP_DEFAULT;
  });

  const [slipOnlyFinal, setSlipOnlyFinal] = useState(false);
  const [slipFinalColour, setSlipFinalColour] = useState("both");
  const handleLogout = async () => {
    await logout();
    navigate("/portal-access", { replace: true });
  };

  const loadPackets = () => {
    setLoadingPackets(true);
    api
      .get("/pricing/quote-stones/packets")
      .then((r) => setPackets(r.data.items))
      .catch(() => {})
      .finally(() => setLoadingPackets(false));
  };

  const loadPacketItems = (packetNo) =>
    api
      .get("/pricing/quote-stones", { params: { packet_no: packetNo } })
      .then((r) => setItems(r.data.items))
      .catch(() => {});

  useEffect(() => {
    if (user && ["pricing_manager", "admin"].includes(user.role)) loadPackets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (selectedPacket && user && ["pricing_manager", "admin"].includes(user.role)) {
      loadPacketItems(selectedPacket);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPacket, user]);

  if (user === null)
    return (
      <div className="px-6 py-40 font-mono text-xs uppercase tracking-[0.3em] text-zinc-600">
        Loading…
      </div>
    );

  if (!user || !["pricing_manager", "admin"].includes(user.role))
    return (
      <div className="mx-auto max-w-[1440px] px-6 py-40" data-testid="pricing-dashboard-denied">
        <p className="font-serif text-3xl italic text-zinc-500">Not authorized.</p>
      </div>
    );

  const setDiscount = async (stoneId) => {
    const val = parseFloat(discounts[stoneId]);
    if (isNaN(val) || val < 0 || val > 100) {
      toast.error("Enter a valid discount between 0 and 100");
      return;
    }
    setSaving((s) => ({ ...s, [stoneId]: true }));
    try {
      await api.post(`/pricing/quote-stones/${stoneId}/discount`, { discount_percent: val });
      toast.success("Discount saved — pricing updated");
      loadPacketItems(selectedPacket);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setSaving((s) => ({ ...s, [stoneId]: false }));
    }
  };

  // Mark (or unmark) a plan as the FINAL plan of this packet.
  // Plan 1 and Plan 1A count as one plan, so marking either marks both.
  const toggleFinal = async (planNo, makeFinal) => {
    try {
      await api.post("/pricing/final-plan", {
        packet_no: selectedPacket,
        plan_no: planNo,
        final: makeFinal,
      });
      toast.success(makeFinal ? `Plan ${planNo} marked as final` : "Final mark removed");
      loadPacketItems(selectedPacket);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const deleteStone = async (s) => {
    const label = s.color_range ? `${s.color_range} (both colour rows)` : s.color;
    if (!window.confirm(`Delete this stone (Plan ${s.plan_no}, ${label}, ${s.pol_cts?.toFixed(2)} ct)?`)) return;
    try {
      await api.delete(`/pricing/quote-stones/${s.quote_stone_id}`);
      toast.success("Stone deleted");
      loadPacketItems(selectedPacket);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const deletePlan = async (planNo) => {
    if (!window.confirm(`Delete ALL stones in Plan ${planNo} of Packet ${selectedPacket}? This cannot be undone.`)) return;
    try {
      await api.delete("/pricing/plans", { params: { packet_no: selectedPacket, plan_no: planNo } });
      toast.success(`Plan ${planNo} deleted`);
      loadPacketItems(selectedPacket);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const deletePacket = async (packetNo) => {
    if (!window.confirm(`Delete Packet ${packetNo} with ALL its plans and stones? This cannot be undone.`)) return;
    try {
      await api.delete("/pricing/packets", { params: { packet_no: packetNo } });
      toast.success(`Packet ${packetNo} deleted`);
      if (selectedPacket === packetNo) backToPackets();
      else loadPackets();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const fmt = (n) =>
    n == null ? "—" : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const backToPackets = () => {
    setSelectedPacket(null);
    setItems([]);
    setDiscounts({});
    loadPackets(); // refresh counts in case anything changed
  };

  // ---- print slip helpers ----
  const toggleSlipField = (key) => {
    setSlipFields((cur) => {
      const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
      try {
        localStorage.setItem("slipFields", JSON.stringify(next));
      } catch (e) {
        /* ignore */
      }
      return next;
    });
  };

  const changeSlipPaper = (value) => {
    setSlipPaper(value);
    try {
      localStorage.setItem("slipPaper", value);
    } catch (e) {
      /* ignore */
    }
  };

  const slipUrl = (packetNo) => {
    const params = new URLSearchParams();
    if (packetNo) params.set("packet_no", packetNo);
    params.set("fields", slipFields.join(","));
    params.set("paper", slipPaper);
    if (slipOnlyFinal) {
      params.set("only_final", "true");
      if (slipFinalColour !== "both") params.set("final_colour", slipFinalColour);
    }
    return `${API_BASE}/pricing/quote-stones/export-print?${params.toString()}`;
  };

  const finalRangeColours = [
    ...new Set(items.filter((s) => s.is_final && s.color_range).map((s) => s.color)),
  ].sort();

  const SlipPanel = showSlip ? (
    <div className="mt-6 border border-white/10 bg-[#0C1E30] p-6" data-testid="slip-options">
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-gold">What to print on the slip</p>
      <p className="mt-2 text-xs text-zinc-500">
        Plan no is always printed, with a total row for each plan. Tick what else you want.
      </p>
      <div className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        {SLIP_OPTIONS.map(([key, label]) => (
          <label
            key={key}
            className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.1em] text-zinc-300"
          >
            <input
              type="checkbox"
              checked={slipFields.includes(key)}
              onChange={() => toggleSlipField(key)}
              data-testid={`slip-field-${key}`}
            />
            {label}
          </label>
        ))}
      </div>
      <label className="mt-6 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.1em] text-gold">
        <input
          type="checkbox"
          checked={slipOnlyFinal}
          onChange={(e) => setSlipOnlyFinal(e.target.checked)}
          data-testid="slip-only-final"
        />
        Only the final plan (leave out all other plans)
      </label>
      {slipOnlyFinal && (selectedPacket ? finalRangeColours.length > 0 : true) && (
        <label className="mt-4 flex flex-wrap items-center gap-3 font-mono text-xs uppercase tracking-[0.1em] text-zinc-300">
          Colour ranges in the final plan
          <select
            value={slipFinalColour}
            onChange={(e) => setSlipFinalColour(e.target.value)}
            data-testid="slip-final-colour"
            className="border-b border-white/20 bg-transparent py-1 text-sm text-white focus:border-gold focus:outline-none [&>option]:bg-black"
          >
            <option value="both">Print both colours</option>
            {selectedPacket ? (
              finalRangeColours.map((c) => (
                <option key={c} value={c}>
                  Only colour {c}
                </option>
              ))
            ) : (
              <>
                <option value="first">First colour only (e.g. D of D-E)</option>
                <option value="second">Second colour only (e.g. E of D-E)</option>
              </>
            )}
          </select>
        </label>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-6">
        <label className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.1em] text-zinc-300">
          Paper
          <select
            value={slipPaper}
            onChange={(e) => changeSlipPaper(e.target.value)}
            data-testid="slip-paper-select"
            className="border-b border-white/20 bg-transparent py-1 text-sm text-white focus:border-gold focus:outline-none [&>option]:bg-black"
          >
            <option value="a4">A4 (normal)</option>
            <option value="a5">A5 (small)</option>
            <option value="a6">A6 (tiny)</option>
            <option value="4x6">4 × 6 inch portrait (packet size)</option>
          </select>
        </label>
        <button
          onClick={() => {
            setSlipFields(SLIP_DEFAULT);
            try {
              localStorage.setItem("slipFields", JSON.stringify(SLIP_DEFAULT));
            } catch (e) {
              /* ignore */
            }
          }}
          className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400 hover:text-gold"
        >
          Reset
        </button>
        <a
          href={slipUrl(selectedPacket)}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="slip-download"
          className="flex items-center gap-2 border border-gold px-6 py-2 font-mono text-[11px] uppercase tracking-[0.25em] text-gold transition-colors hover:bg-gold hover:text-black"
        >
          <Printer className="h-4 w-4" strokeWidth={1.5} />
          {selectedPacket ? "Download slip" : "Download all slips"}
        </a>
      </div>
    </div>
  ) : null;

  // Search on the packet list: type a rough name (CS) to list its packets.
  // An exact rough name shows only that rough name; otherwise it matches any
  // part of the rough name or packet number (so "CS-" shows CS-1, CS-2 ...).
  const q = search.trim().toLowerCase();
  const exactRough = q && packets.some((p) => (p.rough_name || "").toLowerCase() === q);
  const shownPackets = !q
    ? packets
    : packets.filter((p) => {
        const rough = (p.rough_name || "").toLowerCase();
        if (exactRough) return rough === q;
        return rough.includes(q) || String(p.packet_no).toLowerCase().includes(q);
      });

  // ---- totals: one block per plan (Plan 1 + Plan 1A together), with a separate
  // total for each colour option. A colour-range stone (D-E) has one row per
  // colour: option 1 counts the D rows, option 2 the E rows. Single-colour
  // stones count in every option.
  const planGroupOf = (planNo) => {
    const m = String(planNo || "").match(/\d+/);
    return m ? String(parseInt(m[0], 10)) : String(planNo || "").trim().toUpperCase();
  };
  const sumOf = (rows, key) => rows.reduce((a, s) => a + (Number(s[key]) || 0), 0);

  const groups = (() => {
    const map = new Map();
    items.forEach((s) => {
      const k = planGroupOf(s.plan_no);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(s);
    });
    return [...map.entries()].map(([key, stones]) => {
      const singles = stones.filter((s) => !s.color_range);
      const ranges = stones.filter((s) => s.color_range);
      const makeTotal = (rows, label) => ({
        label,
        carat: sumOf(rows, "pol_cts"),
        gross: sumOf(rows, "gross_value"),
        labour: sumOf(rows, "labour"),
        net: sumOf(rows, "net_value"),
        pending: rows.some((s) => s.gross_value == null),
      });
      // sections: each ends with a total sitting directly under its rows
      const sections = [];
      if (!ranges.length) {
        sections.push({ rows: stones, total: makeTotal(stones, "") });
      } else {
        // single-colour stones first (no total of their own, counted in every colour's total)
        if (singles.length) sections.push({ rows: singles, total: null });
        const maxIdx = Math.max(...ranges.map((s) => s.range_index ?? 0));
        for (let k = 0; k <= maxIdx; k += 1) {
          const chosen = ranges.filter((s) => (s.range_index ?? 0) === k);
          if (!chosen.length) continue;
          const label = [...new Set(chosen.map((s) => s.color))].join("/");
          sections.push({ rows: chosen, total: makeTotal([...singles, ...chosen], label) });
        }
      }
      return {
        key,
        sections,
        plans: [...new Set(stones.map((s) => s.plan_no))],
        isFinal: stones.some((s) => s.is_final),
      };
    });
  })();

  // the plan option with the HIGHEST total value (needs two or more fully priced totals)
  const bestTotalId = (() => {
    let best = null;
    let count = 0;
    groups.forEach((g) =>
      g.sections.forEach((sec, si) => {
        if (sec.total && !sec.total.pending) {
          count += 1;
          if (best === null || sec.total.net > best.net) best = { net: sec.total.net, id: `${g.key}-${si}` };
        }
      })
    );
    return count >= 2 && best ? best.id : null;
  })();

  const LogoutButton = (
    <button
      onClick={handleLogout}
      data-testid="pricing-logout-button"
      className="border border-white/20 px-6 py-2 font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-400 transition-colors hover:border-gold hover:text-gold"
    >
      Log out
    </button>
  );

  // ---------------- Packet list view ----------------
  if (!selectedPacket) {
    return (
      <div className="mx-auto max-w-[1440px] px-6 pb-32 pt-24" data-testid="pricing-dashboard-page">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Overline>Pricing</Overline>
            <h1 className="mt-4 font-serif text-5xl font-light text-white">
              Quote <span className="italic text-gold">packets.</span>
            </h1>
            <p className="mt-3 text-sm text-zinc-500">
              {q ? `${shownPackets.length} of ${packets.length} packets` : `${packets.length} packets`}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowSlip((v) => !v)}
              data-testid="pricing-print-all-button"
              className="flex items-center gap-2 border border-white/30 px-6 py-2 font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-300 transition-colors hover:border-gold hover:text-gold"
            >
              <Printer className="h-4 w-4" strokeWidth={1.5} /> Print all slips
            </button>
            {LogoutButton}
          </div>
        </div>

        {SlipPanel}

        <div className="mt-10 flex items-center gap-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rough name or packet no (e.g. CS, CS-1, 100)"
            className="lux-input w-full max-w-xl"
            data-testid="packet-search-input"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              data-testid="packet-search-clear"
              className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold hover:underline"
            >
              Clear
            </button>
          )}
        </div>

        <div className="mt-8 overflow-x-auto border border-white/10" data-testid="packets-table">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
                <th className="px-5 py-4">Packet</th>
                <th className="px-5 py-4">Rough</th>
                <th className="px-5 py-4">Plans</th>
                <th className="px-5 py-4">Stones</th>
                <th className="px-5 py-4">Priced</th>
                <th className="px-5 py-4">Pending</th>
                <th className="px-5 py-4"></th>
                <th className="px-5 py-4"></th>
              </tr>
            </thead>
            <tbody>
              {shownPackets.map((p) => (
                <tr
                  key={p.packet_no}
                  onClick={() => setSelectedPacket(p.packet_no)}
                  className="cursor-pointer border-b border-white/5 text-zinc-300 transition-colors hover:bg-white/5"
                  data-testid={`packet-row-${p.packet_no}`}
                >
                  <td className="px-5 py-4 font-mono text-xs text-gold">{p.packet_no}</td>
                  <td className="px-5 py-4 font-mono text-xs">{p.rough_name ?? "—"}</td>
                  <td className="px-5 py-4 font-mono text-xs">{p.plan_count}</td>
                  <td className="px-5 py-4 font-mono text-xs">{p.stone_count}</td>
                  <td className="px-5 py-4 font-mono text-xs text-emerald-400">{p.priced_count}</td>
                  <td className="px-5 py-4 font-mono text-xs text-gold">{p.pending_count}</td>
                  <td className="px-5 py-4 font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500">
                    View →
                  </td>
                  <td className="px-5 py-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deletePacket(p.packet_no);
                      }}
                      data-testid={`packet-delete-${p.packet_no}`}
                      className="font-mono text-[10px] uppercase tracking-[0.15em] text-red-400 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {!loadingPackets && shownPackets.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center font-mono text-xs uppercase tracking-[0.2em] text-zinc-600">
                    {q ? "No packets match your search" : "No packets yet"}
                  </td>
                </tr>
              )}
              {loadingPackets && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center font-mono text-xs uppercase tracking-[0.2em] text-zinc-600">
                    Loading…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ---------------- Packet detail view ----------------
  return (
    <div className="mx-auto max-w-[1440px] px-6 pb-32 pt-24" data-testid="pricing-dashboard-page">
      <button
        onClick={backToPackets}
        data-testid="pricing-back-to-packets"
        className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-500 transition-colors hover:text-gold"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={1.5} /> All packets
      </button>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
        <div>
          <Overline>Pricing</Overline>
          <h1 className="mt-4 font-serif text-5xl font-light text-white">
            Packet <span className="italic text-gold">{selectedPacket}</span>
          </h1>
          <p className="mt-3 text-sm text-zinc-500">{items.length} stones</p>
        </div>
        <div className="flex items-center gap-4">
          {LogoutButton}
          <a
            href={`${API_BASE}/pricing/quote-stones/export?packet_no=${encodeURIComponent(selectedPacket)}`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="pricing-export-button"
            className="flex items-center gap-2 border border-gold px-6 py-3 font-mono text-[11px] uppercase tracking-[0.25em] text-gold transition-colors hover:bg-gold hover:text-black active:scale-95"
          >
            <Download className="h-4 w-4" strokeWidth={1.5} /> Export Excel
          </a>
          <button
            onClick={() => setShowSlip((v) => !v)}
            data-testid="pricing-print-button"
            className="flex items-center gap-2 border border-white/30 px-6 py-3 font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-300 transition-colors hover:border-gold hover:text-gold active:scale-95"
          >
            <Printer className="h-4 w-4" strokeWidth={1.5} /> Print Slip
          </button>
        </div>
      </div>

      {SlipPanel}

      {items.length > 0 && (
        <div className="mt-8 flex flex-wrap items-center gap-3" data-testid="plan-chips">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">Plans</span>
          {[...new Set(items.map((s) => s.plan_no))].map((planNo) => {
            const isFinal = items.some((s) => s.plan_no === planNo && s.is_final);
            return (
              <span
                key={planNo}
                className={`flex items-center gap-3 border px-3 py-1 font-mono text-xs ${
                  isFinal
                    ? "border-emerald-400 bg-emerald-500/10 text-emerald-300"
                    : "border-white/10 text-zinc-300"
                }`}
              >
                Plan {planNo}
                {isFinal && " ★ FINAL"}
                <button
                  onClick={() => toggleFinal(planNo, !isFinal)}
                  title={isFinal ? "Remove the final mark" : "Mark this plan as final"}
                  data-testid={`plan-final-${planNo}`}
                  className="text-[10px] uppercase tracking-[0.15em] text-gold hover:underline"
                >
                  {isFinal ? "Unmark" : "Mark final"}
                </button>
                <button
                  onClick={() => deletePlan(planNo)}
                  title={`Delete Plan ${planNo}`}
                  data-testid={`plan-delete-${planNo}`}
                  className="text-red-400 hover:text-red-300"
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-xs text-zinc-500" data-testid="pricing-legend">
        <span className="text-emerald-300">Green</span> = final plan ·{" "}
        <span className="text-amber-300">Amber ▲</span> = highest total value
      </p>

      <div className="mt-4 overflow-x-auto border border-white/10" data-testid="pricing-table">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
              <th className="px-5 py-4">Packet</th>
              <th className="px-5 py-4">Plan</th>
              <th className="px-5 py-4">Planner</th>
              <th className="px-5 py-4">Rough wt</th>
              <th className="px-5 py-4">Shape</th>
              <th className="px-5 py-4">Carat</th>
              <th className="px-5 py-4">Color/Clarity</th>
              <th className="px-5 py-4">Fls</th>
              <th className="px-5 py-4">Table %</th>
              <th className="px-5 py-4">TD</th>
              <th className="px-5 py-4">Ratio</th>
              <th className="px-5 py-4">Rapaport</th>
              <th className="px-5 py-4">Discount %</th>
              <th className="px-5 py-4">Gross</th>
              <th className="px-5 py-4">Labour</th>
              <th className="px-5 py-4">Net</th>
              <th className="px-5 py-4">Entered by</th>
              <th className="px-5 py-4">Priced by</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4"></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.key}>
            {g.sections.map((sec, si) => (
              <Fragment key={`${g.key}-${si}`}>
            {sec.rows.map((s) => (
              <tr
                key={s.quote_stone_id}
                className={`border-b border-white/5 text-zinc-300 ${s.is_final ? "bg-emerald-500/10" : ""}`}
                data-testid={`pricing-row-${s.quote_stone_id}`}
              >
                <td className="px-5 py-4 font-mono text-xs">{s.packet_no}</td>
                <td className="px-5 py-4 font-mono text-xs">
                  {s.plan_no}
                  {s.is_final && (
                    <span className="ml-2 border border-emerald-400 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.15em] text-emerald-300">
                      Final
                    </span>
                  )}
                </td>
                <td className="px-5 py-4 text-xs">{s.planner_name ?? "—"}</td>
                <td className="px-5 py-4 font-mono text-xs">{s.rough_weight ?? "—"}</td>
                <td className="px-5 py-4">{s.shape_display ?? s.shape}</td>
                <td className="px-5 py-4 font-mono text-xs">{s.pol_cts?.toFixed(2)}</td>
                <td className="px-5 py-4 font-mono text-xs">{s.color}{s.color_range ? ` (${s.color_range})` : ""} • {s.clarity}</td>
                <td className="px-5 py-4 font-mono text-xs">{s.fluorescence ?? "—"}</td>
                <td className="px-5 py-4 font-mono text-xs">{s.table_pct ?? "—"}</td>
                <td className="px-5 py-4 font-mono text-xs">{s.td ?? "—"}</td>
                <td className="px-5 py-4 font-mono text-xs">{s.ratio ?? "—"}</td>
                <td className="px-5 py-4 font-mono text-xs">{s.rapaport_rate ?? "—"}</td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      placeholder={s.discount_percent ?? "e.g. 45"}
                      value={discounts[s.quote_stone_id] ?? ""}
                      onChange={(e) => setDiscounts((d) => ({ ...d, [s.quote_stone_id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !saving[s.quote_stone_id]) setDiscount(s.quote_stone_id);
                      }}
                      className="w-20 border-b border-white/20 bg-transparent py-1 font-mono text-xs text-white focus:border-gold focus:outline-none"
                      data-testid={`pricing-discount-input-${s.quote_stone_id}`}
                    />
                    <button
                      onClick={() => setDiscount(s.quote_stone_id)}
                      disabled={saving[s.quote_stone_id]}
                      data-testid={`pricing-discount-save-${s.quote_stone_id}`}
                      className="font-mono text-[10px] uppercase tracking-[0.15em] text-gold hover:underline disabled:opacity-50"
                    >
                      Set
                    </button>
                  </div>
                </td>
                <td className="px-5 py-4 font-mono text-xs text-gold">{fmt(s.gross_value)}</td>
                <td className="px-5 py-4 font-mono text-xs">{fmt(s.labour)}</td>
                <td className="px-5 py-4 font-mono text-xs text-emerald-400">{fmt(s.net_value)}</td>
                <td className="px-5 py-4 text-xs">{s.entered_by ?? "—"}</td>
                <td className="px-5 py-4 text-xs">{s.priced_by_name ?? "—"}</td>
                <td className="px-5 py-4">
                  <span className={`font-mono text-[10px] uppercase tracking-[0.15em] ${s.status === "priced" ? "text-emerald-400" : "text-gold"}`}>
                    {s.status}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <button
                    onClick={() => deleteStone(s)}
                    data-testid={`pricing-delete-${s.quote_stone_id}`}
                    className="font-mono text-[10px] uppercase tracking-[0.15em] text-red-400 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {(sec.total ? [sec.total] : []).map((t, i) => (
              <tr
                key={`${g.key}-total-${i}`}
                className={`border-b border-white/10 font-mono text-xs ${
                  bestTotalId === `${g.key}-${si}`
                    ? "bg-amber-500/30 text-amber-200"
                    : g.isFinal
                    ? "bg-emerald-500/20 text-emerald-200"
                    : "bg-white/5 text-zinc-200"
                }`}
                data-testid={`pricing-total-${g.key}-${i}`}
              >
                <td colSpan={5} className="px-5 py-3 uppercase tracking-[0.15em]">
                  Total · Plan {g.plans.join(" + ")}
                  {t.label ? ` · colour ${t.label}` : ""}
                  {g.isFinal ? " ★ FINAL" : ""}
                  {bestTotalId === `${g.key}-${si}` ? " ▲ HIGHEST" : ""}
                </td>
                <td className="px-5 py-3">{t.carat.toFixed(2)}</td>
                <td colSpan={7} className="px-5 py-3"></td>
                <td className="px-5 py-3 text-gold">{t.pending ? "Pending" : fmt(t.gross)}</td>
                <td className="px-5 py-3">{t.pending ? "—" : fmt(t.labour)}</td>
                <td className="px-5 py-3 text-emerald-400">{t.pending ? "Pending" : fmt(t.net)}</td>
                <td colSpan={4} className="px-5 py-3"></td>
              </tr>
            ))}
              </Fragment>
            ))}
              </Fragment>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={20} className="px-5 py-10 text-center font-mono text-xs uppercase tracking-[0.2em] text-zinc-600">
                  No stones in this packet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
