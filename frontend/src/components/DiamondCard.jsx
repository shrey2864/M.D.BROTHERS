import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";

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
        <div className="mt-4 border-t border-white/10 pt-4">
          {diamond.price != null ? (
            <p className="font-serif text-2xl text-gold" data-testid={`diamond-price-${diamond.sku}`}>
              ${diamond.price.toLocaleString()}
            </p>
          ) : (
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500" data-testid={`diamond-price-hidden-${diamond.sku}`}>
              Login to view price
            </p>
          )}
        </div>
      </Link>
    </motion.div>
  );
};
