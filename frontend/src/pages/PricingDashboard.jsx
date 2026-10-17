import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Download, ChevronLeft, Printer } from "lucide-react";
import { api, formatApiError, API_BASE } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Overline } from "@/components/Reveal";

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
            <a
              href={`${API_BASE}/pricing/quote-stones/export-print`}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="pricing-print-all-button"
              className="flex items-center gap-2 border border-white/30 px-6 py-2 font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-300 transition-colors hover:border-gold hover:text-gold"
            >
              <Printer className="h-4 w-4" strokeWidth={1.5} /> Print all slips
            </a>
            {LogoutButton}
          </div>
        </div>

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
          <a
            href={`${API_BASE}/pricing/quote-stones/export-print?packet_no=${encodeURIComponent(selectedPacket)}`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="pricing-print-button"
            className="flex items-center gap-2 border border-white/30 px-6 py-3 font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-300 transition-colors hover:border-gold hover:text-gold active:scale-95"
          >
            <Printer className="h-4 w-4" strokeWidth={1.5} /> Print Slip
          </a>
        </div>
      </div>

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

      <div className="mt-12 overflow-x-auto border border-white/10" data-testid="pricing-table">
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
            {items.map((s) => (
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
