import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Gem, Package, MessageSquare, Star, ArrowRight, MessageCircle, Mail } from "lucide-react";
import { api } from "@/lib/api";
import { waLink } from "@/lib/config";
import { useAuth } from "@/context/AuthContext";
import { Overline, MaskedLine, Reveal } from "@/components/Reveal";
import { DiamondCard } from "@/components/DiamondCard";

const Gate = ({ user }) => (
  <div className="mx-auto max-w-[1440px] px-6 pb-32 pt-40" data-testid="dashboard-gate">
    <Overline>{!user ? "Members Only" : "Approval Pending"}</Overline>
    <h1 className="mt-4 max-w-2xl font-serif text-5xl font-light leading-tight text-white">
      {!user ? (<>Your dashboard is <span className="italic text-gold">private.</span></>)
        : (<>Your account is <span className="italic text-gold">under review.</span></>)}
    </h1>
    <p className="mt-6 max-w-lg text-sm leading-relaxed text-zinc-400">
      {!user
        ? "Register with your company and KYC details — once approved, your personal dashboard unlocks."
        : "Once our team approves your account, your dashboard, the collection and live pricing will unlock."}
    </p>
    {!user && (
      <div className="mt-10 flex flex-wrap gap-4">
        <Link to="/register" data-testid="dashboard-gate-register-button"
          className="bg-gold px-8 py-4 font-mono text-[11px] uppercase tracking-[0.25em] text-black transition-colors hover:bg-gold-light active:scale-95">
          Register for Access
        </Link>
        <Link to="/login" data-testid="dashboard-gate-login-button"
          className="border border-white/20 px-8 py-4 font-mono text-[11px] uppercase tracking-[0.25em] text-white transition-colors hover:border-gold hover:text-gold active:scale-95">
          Sign In
        </Link>
      </div>
    )}
  </div>
);

export default function Dashboard() {
  const { user } = useAuth();
  const canView = !!user && (user.role === "admin" || user.status === "approved");
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!canView) return;
    api.get("/dashboard").then((r) => setData(r.data)).catch(() => {});
  }, [canView]);

  if (user === null)
    return <div className="px-6 py-40 font-mono text-xs uppercase tracking-[0.3em] text-zinc-600">Loading…</div>;
  if (!canView) return <Gate user={user} />;

  const tiles = data ? [
    { icon: Package, label: "New Goods (7 days)", value: data.new_goods, testId: "tile-new-goods" },
    { icon: Gem, label: "Total Stones", value: data.total_stones, testId: "tile-total-stones" },
    { icon: Star, label: "Featured Stones", value: data.featured_count, testId: "tile-featured" },
    { icon: MessageSquare, label: "My Enquiries", value: data.my_enquiries, testId: "tile-enquiries" },
  ] : [];

  return (
    <div className="mx-auto max-w-[1440px] px-6 pb-32 pt-32" data-testid="dashboard-page">
      <Overline>Dashboard</Overline>
      <MaskedLine className="mt-4">
        <h1 className="font-serif text-5xl font-light text-white">
          Welcome, <span className="italic text-gold">{user.name.split(" ")[0]}.</span>
        </h1>
      </MaskedLine>
      <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-500">{user.company || "Trade Client"}</p>

      {/* Stat tiles */}
      <div className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="dashboard-tiles">
        {tiles.map(({ icon: Icon, label, value, testId }, i) => (
          <Reveal key={label} delay={i * 0.08}>
            <div className="border border-white/10 bg-[#0C1E30] p-6 transition-colors duration-300 hover:border-gold/40" data-testid={testId}>
              <Icon className="h-4 w-4 text-gold" strokeWidth={1.5} />
              <p className="mt-6 font-serif text-4xl font-light text-white">{value.toLocaleString()}</p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">{label}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* Featured stones */}
        <div>
          <div className="flex items-end justify-between">
            <Overline>Featured Stones</Overline>
            <Link to="/search" data-testid="dashboard-search-link"
              className="group flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-gold">
              Diamond Search <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" strokeWidth={1.5} />
            </Link>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-3" data-testid="dashboard-featured">
            {(data?.featured || []).map((d, i) => (
              <Link key={d.diamond_id} to={`/diamonds/${d.diamond_id}`} data-testid={`dashboard-featured-${d.sku}`}
                className="group relative block overflow-hidden border border-white/10">
                <img src={d.image} alt={`${d.shape} ${d.sku}`} loading="lazy"
                  className="aspect-[4/3] w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-black/30" />
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-4 backdrop-blur">
                  <p className="font-serif text-lg text-white">{d.carat.toFixed(2)} ct {d.shape}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
                    {d.color} • {d.clarity} • {d.certification}
                  </p>
                </div>
              </Link>
            ))}
          </div>

          {/* Latest uploads */}
          <div className="mt-14 flex items-end justify-between">
            <Overline>Just Uploaded</Overline>
            <Link to="/collection?sort=newest" data-testid="dashboard-newest-link"
              className="group flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-gold">
              View all <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" strokeWidth={1.5} />
            </Link>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="dashboard-latest">
            {(data?.latest || []).map((d, i) => (
              <DiamondCard key={d.diamond_id} diamond={d} index={i} />
            ))}
          </div>
        </div>

        {/* Personal desk card */}
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Reveal className="border border-gold/30 bg-[#0C1E30] p-8" data-testid="dashboard-desk-card">
            <Overline>Your M.D.Brothers Desk</Overline>
            <p className="mt-4 font-serif text-2xl font-light text-white">Direct line to our sales team</p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              Need a specific stone, a matched pair, or a parcel quote? Reach us
              directly — we reply within 24 hours.
            </p>
            <div className="mt-8 space-y-3">
              <a href={waLink("Hello M.D.Brothers, I need assistance with stone selection.")}
                target="_blank" rel="noopener noreferrer" data-testid="dashboard-whatsapp-button"
                className="flex items-center gap-3 border border-emerald-500/50 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-400 transition-colors hover:bg-emerald-500 hover:text-black active:scale-95">
                <MessageCircle className="h-4 w-4" strokeWidth={1.5} /> WhatsApp Us
              </a>
              <a href="mailto:shreydoshi16@gmail.com" data-testid="dashboard-email-link"
                className="flex items-center gap-3 border border-white/20 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-300 transition-colors hover:border-gold hover:text-gold active:scale-95">
                <Mail className="h-4 w-4" strokeWidth={1.5} /> shreydoshi16@gmail.com
              </a>
            </div>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
