import { Gem } from "lucide-react";
import { Link } from "react-router-dom";

export const Footer = () => (
  <footer className="border-t border-white/10 bg-[#050505]" data-testid="footer">
    <div className="mx-auto grid max-w-[1440px] gap-12 px-6 py-16 md:grid-cols-4">
      <div className="md:col-span-2">
        <div className="flex items-center gap-2">
          <Gem className="h-4 w-4 text-gold" strokeWidth={1.5} />
          <span className="font-serif text-lg tracking-[0.18em] text-white">
            M.D.<span className="text-gold">BROTHERS</span>
          </span>
        </div>
        <p className="mt-6 max-w-sm text-sm leading-relaxed text-zinc-500">
          Manufacturers and exporters of finest natural diamonds. From the
          heart of Surat to maisons across the world — every stone cut with
          intent, certified with integrity.
        </p>
      </div>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-gold">Explore</p>
        <div className="mt-5 flex flex-col gap-3 text-sm text-zinc-400">
          <Link to="/collection" data-testid="footer-collection-link" className="transition-colors hover:text-gold">Collection</Link>
          <a href="/#story" data-testid="footer-story-link" className="transition-colors hover:text-gold">Our Story</a>
          <Link to="/contact" data-testid="footer-contact-link" className="transition-colors hover:text-gold">Contact</Link>
          <Link to="/login" data-testid="footer-login-link" className="transition-colors hover:text-gold">Client Login</Link>
        </div>
      </div>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-gold">Atelier</p>
        <div className="mt-5 flex flex-col gap-3 text-sm text-zinc-400">
          <span><span className="text-zinc-500">Head Office:</span> Bharat Diamond Bourse, Bandra Kurla Complex, Mumbai</span>
          <span><span className="text-zinc-500">Manufacturing Unit:</span> Mahidharpura, Surat, Gujarat</span>
          <span data-testid="footer-email">shreydoshi16@gmail.com</span>
          <span>+91 261 000 0000</span>
        </div>
      </div>
    </div>
    <div className="border-t border-white/10">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-6 py-6 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-600 sm:flex-row sm:justify-between">
        <span>© {new Date().getFullYear()} M.D.Brothers</span>
        <span>GIA • IGI • HRD Certified Stones</span>
      </div>
    </div>
  </footer>
);
