import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Menu, X, Gem, Search } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
const LINKS = [
  { to: "/dashboard", label: "Dashboard", authOnly: true },
  { to: "/search", label: "Search", authOnly: true },
  { to: "/match-pair", label: "Match Pair", authOnly: true },
  { to: "/#story", label: "Our Story", anchor: true, adminHide: true },
  { to: "/contact", label: "Contact", adminHide: true },
];

export const Header = () => {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [quickQ, setQuickQ] = useState("");
  const navigate = useNavigate();

  const handleQuickSearch = async (e) => {
    e.preventDefault();
    if (!quickQ.trim()) return;
    try {
      const r = await api.get("/diamonds", { params: { q: quickQ.trim(), limit: 1 } });
      const hit = r.data?.items?.[0];
      if (hit) {
        navigate(`/diamonds/${hit.diamond_id}`);
        setQuickQ("");
      }
    } catch {
      // ignore — no match found
    }
  };

  const handleLogout = async () => {
    await logout();
    setOpen(false);
    navigate("/");
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-black/60 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-4">
        <Link to="/" data-testid="header-logo-link" className="flex items-center gap-3 group">
          <img src="/logo.png" alt="M.D.Brothers logo" className="h-10 w-auto object-contain transition-transform duration-500 group-hover:scale-105" />
          <span className="font-serif text-lg tracking-[0.18em] text-white">
            M.D.<span className="text-gold">BROTHERS</span>
          </span>
        </Link>

        {user && (
          <form onSubmit={handleQuickSearch} className="relative mx-6 hidden max-w-[220px] flex-1 md:block">
            <Search className="pointer-events-none absolute left-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" strokeWidth={1.5} />
            <input
              value={quickQ}
              onChange={(e) => setQuickQ(e.target.value)}
              placeholder="SKU or certificate no."
              data-testid="header-quick-search-input"
              className="w-full border-b border-white/15 bg-transparent py-1 pl-5 font-mono text-[11px] tracking-[0.05em] text-zinc-300 placeholder:text-zinc-600 focus:border-gold focus:outline-none"
            />
          </form>
        )}
        <nav className="hidden items-center gap-10 md:flex" data-testid="header-nav">
          {LINKS.filter((l) => (!l.authOnly || user) && !(l.adminHide && user?.role === "admin")).map((l) =>
            l.anchor ? (
              <a
                key={l.label}
                href={l.to}
                data-testid={`nav-${l.label.toLowerCase().replace(/\s/g, "-")}-link`}
                className="font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-400 transition-colors duration-300 hover:text-gold"
              >
                {l.label}
              </a>
            ) : (
              <Link
                key={l.label}
                to={l.to}
                data-testid={`nav-${l.label.toLowerCase().replace(/\s/g, "-")}-link`}
                className="font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-400 transition-colors duration-300 hover:text-gold"
              >
                {l.label}
              </Link>
            )
          )}
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          {user ? (
            <>
              {user.role === "admin" && (
                <Link to="/admin" data-testid="header-admin-link"
                  className="font-mono text-[11px] uppercase tracking-[0.2em] text-gold transition-colors hover:text-gold-light">
                  Inventory
                </Link>
              )}
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-400" data-testid="header-user-name">
                {user.name}
              </span>
              <button
                onClick={handleLogout}
                data-testid="header-logout-button"
                className="border border-white/20 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white transition-colors duration-300 hover:border-gold hover:text-gold active:scale-95"
              >
                Logout
              </button>
            </>
          ) : (
            <Link
              to="/login"
              data-testid="header-login-button"
              className="border border-gold/60 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-gold transition-colors duration-300 hover:bg-gold hover:text-black active:scale-95"
            >
              Client Login
            </Link>
          )}
        </div>

        <button
          className="text-white md:hidden"
          onClick={() => setOpen(!open)}
          data-testid="header-mobile-menu-button"
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" strokeWidth={1.5} /> : <Menu className="h-5 w-5" strokeWidth={1.5} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-white/10 bg-black px-6 py-6 md:hidden" data-testid="header-mobile-menu">
          <div className="flex flex-col gap-5">
            {LINKS.filter((l) => (!l.authOnly || user) && !(l.adminHide && user?.role === "admin")).map((l) => (
              <Link
                key={l.label}
                to={l.to}
                onClick={() => setOpen(false)}
                data-testid={`mobile-nav-${l.label.toLowerCase().replace(/\s/g, "-")}-link`}
                className="font-mono text-xs uppercase tracking-[0.25em] text-zinc-300"
              >
                {l.label}
              </Link>
            ))}
            {user?.role === "admin" && (
             <Link
               to="/admin"
               onClick={() => setOpen(false)}
               data-testid="mobile-admin-link"
               className="font-mono text-xs uppercase tracking-[0.25em] text-gold"
             >
    Inventory
  </Link>
)}
            {user ? (
              <button onClick={handleLogout} data-testid="mobile-logout-button" className="text-left font-mono text-xs uppercase tracking-[0.25em] text-gold">
                Logout ({user.name})
              </button>
            ) : (
              <Link to="/login" onClick={() => setOpen(false)} data-testid="mobile-login-button" className="font-mono text-xs uppercase tracking-[0.25em] text-gold">
                Client Login
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
