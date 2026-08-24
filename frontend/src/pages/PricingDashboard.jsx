import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { api, formatApiError, API_BASE } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Overline } from "@/components/Reveal";

export default function PricingDashboard() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [discounts, setDiscounts] = useState({}); // quote_stone_id -> input value
  const [saving, setSaving] = useState({});
  const [packetFilter, setPacketFilter] = useState("");

  const load = () =>
    api
      .get("/pricing/quote-stones", { params: packetFilter ? { packet_no: packetFilter } : {} })
      .then((r) => setItems(r.data.items))
      .catch(() => {});

  useEffect(() => {
    if (user && ["pricing_manager", "admin"].includes(user.role)) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, packetFilter]);

  if (user === null)
    return <div className="px-6 py-40 font-mono text-xs uppercase tracking-[0.3em] text-zinc-600">Loading…</div>;

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
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setSaving((s) => ({ ...s, [stoneId]: false }));
    }
  };

  const fmt = (n) => (n == null ? "—" : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`);

  return (
    <div className="mx-auto max-w-[1440px] px-6 pb-32 pt-24" data-testid="pricing-dashboard-page">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Overline>Pricing</Overline>
          <h1 className="mt-4 font-serif text-5xl font-light text-white">
            Quote <span className="italic text-gold">requests.</span>
          </h1>
          <p className="mt-3 text-sm text-zinc-500">{items.length} stones</p>
        </div>
        <div className="flex items-center gap-4">
          <input
            placeholder="Filter by Packet No"
            value={packetFilter}
            onChange={(e) => setPacketFilter(e.target.value)}
            className="lux-input"
            data-testid="pricing-packet-filter-input"
          />
          <a
            href={`${API_BASE}/pricing/quote-stones/export${packetFilter ? `?packet_no=${encodeURIComponent(packetFilter)}` : ""}`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="pricing-export-button"
            className="flex items-center gap-2 border border-gold px-6 py-3 font-mono text-[11px] uppercase tracking-[0.25em] text-gold transition-colors hover:bg-gold hover:text-black active:scale-95"
          >
            <Download className="h-4 w-4" strokeWidth={1.5} /> Export Excel
          </a>
        </div>
      </div>

      <div className="mt-12 overflow-x-auto border border-white/10" data-testid="pricing-table">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
              <th className="px-5 py-4">Packet</th><th className="px-5 py-4">Plan</th><th className="px-5 py-4">Shape</th>
              <th className="px-5 py-4">Carat</th><th className="px-5 py-4">Color/Clarity</th>
              <th className="px-5 py-4">Rapaport</th><th className="px-5 py-4">Discount %</th>
              <th className="px-5 py-4">Gross</th><th className="px-5 py-4">Labour</th><th className="px-5 py-4">Net</th>
              <th className="px-5 py-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.quote_stone_id} className="border-b border-white/5 text-zinc-300" data-testid={`pricing-row-${s.quote_stone_id}`}>
                <td className="px-5 py-4 font-mono text-xs">{s.packet_no}</td>
                <td className="px-5 py-4 font-mono text-xs">{s.plan_no}</td>
                <td className="px-5 py-4">{s.shape}</td>
                <td className="px-5 py-4 font-mono text-xs">{s.pol_cts?.toFixed(2)}</td>
                <td className="px-5 py-4 font-mono text-xs">{s.color} • {s.clarity}</td>
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
                <td className="px-5 py-4">
                  <span className={`font-mono text-[10px] uppercase tracking-[0.15em] ${s.status === "priced" ? "text-emerald-400" : "text-gold"}`}>
                    {s.status}
                  </span>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={11} className="px-5 py-10 text-center font-mono text-xs uppercase tracking-[0.2em] text-zinc-600">No quote requests yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
