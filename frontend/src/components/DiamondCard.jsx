import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { MessageCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { waLink } from "@/lib/config";

export const DiamondCard = ({ diamond, index = 0 }) => {
  const { user } = useAuth();
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.7, delay: (index % 4) * 0.08, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        to={`/diamonds/${diamond.diamond_id}`}
        data-testid={`diamond-card-${diamond.sku}`}
        className="group block border border-white/10 bg-[#0A0A0A] p-4 transition-colors duration-500 hover:border-gold/50"
      >
        <div className="relative overflow-hidden">
          <img
            src={diamond.image}
            alt={`${diamond.shape} diamond ${diamond.sku}`}
            loading="lazy"
            className="aspect-square w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-black/20 transition-opacity duration-500 group-hover:opacity-0" />
        </div>
        <div className="mt-5 flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">{diamond.sku}</p>
            <h3 className="mt-1 font-serif text-xl text-white">{diamond.shape}</h3>
          </div>
          <span className="border border-white/10 px-2 py-1 font-mono text-[10px] tracking-[0.15em] text-zinc-400">
            {diamond.certification}
          </span>
        </div>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-400">
          {diamond.carat.toFixed(2)} CT • {diamond.color} • {diamond.clarity} • {diamond.cut}
        </p>
        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
          {diamond.price != null ? (
            <p className="font-serif text-2xl text-gold" data-testid={`diamond-price-${diamond.sku}`}>
              ${diamond.price.toLocaleString()}
            </p>
          ) : (
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500" data-testid={`diamond-price-hidden-${diamond.sku}`}>
              Login to view price
            </p>
          )}
          <button
            onClick={(e) => {
              e.preventDefault();
              window.open(
                waLink(`Hello M.D.Brothers, I'm interested in ${diamond.sku} — ${diamond.carat.toFixed(2)} ct ${diamond.shape}.`),
                "_blank",
                "noopener,noreferrer"
              );
            }}
            data-testid={`diamond-whatsapp-${diamond.sku}`}
            aria-label={`Chat about ${diamond.sku} on WhatsApp`}
            className="border border-emerald-500/40 p-2 text-emerald-400 transition-colors duration-300 hover:bg-emerald-500 hover:text-black active:scale-95"
          >
            <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </Link>
    </motion.div>
  );
};
