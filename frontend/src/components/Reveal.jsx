import { motion } from "framer-motion";

export const MaskedLine = ({ children, delay = 0, inView = false, className = "" }) => (
  <span className={`block overflow-hidden ${className}`}>
    <motion.span
      className="block will-change-transform"
      initial={{ y: "110%" }}
      {...(inView
        ? { whileInView: { y: "0%" }, viewport: { once: true, margin: "-80px" } }
        : { animate: { y: "0%" } })}
      transition={{ duration: 1, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.span>
  </span>
);

export const Reveal = ({ children, delay = 0, className = "", y = 32 }) => (
  <motion.div
    className={className}
    initial={{ opacity: 0, y }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-60px" }}
    transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}
  >
    {children}
  </motion.div>
);

export const Overline = ({ children, className = "" }) => (
  <p
    className={`font-mono text-[11px] uppercase tracking-[0.3em] text-gold ${className}`}
  >
    {children}
  </p>
);
