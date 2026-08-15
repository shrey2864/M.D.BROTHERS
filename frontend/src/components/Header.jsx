import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Menu, X, Gem } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const LINKS = [
  { to: "/dashboard", label: "Dashboard", authOnly: true },
  { to: "/search", label: "Search", authOnly: true },
  { to: "/collection", label: "Collection" },
  { to: "/#story", label: "Our Story", anchor: true },
  { to: "/contact", label: "Contact" },
];

export const Header = () => {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

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

        <nav className="hidden items-center gap-10 md:flex" data-testid="header-nav">
          {LINKS.filter((l) => !l.authOnly || user).map((l) =>
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
            {LINKS.filter((l) => !l.authOnly || user).map((l) => (
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
