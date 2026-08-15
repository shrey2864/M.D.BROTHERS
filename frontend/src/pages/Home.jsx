import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, ArrowDown } from "lucide-react";
import { api } from "@/lib/api";
import { MaskedLine, Reveal, Overline } from "@/components/Reveal";
import { EditorialMarquee } from "@/components/Marquee";
import { DiamondCard } from "@/components/DiamondCard";

const HERO_IMG = "https://images.unsplash.com/photo-1702149001693-67ca09997ecc?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDF8MHwxfHNlYXJjaHw0fHxkaWFtb25kJTIwZ2Vtc3RvbmUlMjBjbG9zZSUyMHVwfGVufDB8fHx8MTc4NjYzODA0MXww&ixlib=rb-4.1.0&q=85&w=1400";
const IMG_1 = "https://images.unsplash.com/photo-1638517747421-a1eb8b4c9828?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzV8MHwxfHNlYXJjaHw0fHxkaWFtb25kJTIwY3V0dGluZyUyMHBvbGlzaGluZ3xlbnwwfHx8fDE3ODY2MzgwNDF8MA&ixlib=rb-4.1.0&q=85&w=1000";
const IMG_2 = "https://images.unsplash.com/photo-1592136184798-ca0d8e17643a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzV8MHwxfHNlYXJjaHwyfHxkaWFtb25kJTIwY3V0dGluZyUyMHBvbGlzaGluZ3xlbnwwfHx8fDE3ODY2MzgwNDF8MA&ixlib=rb-4.1.0&q=85&w=1000";
const IMG_3 = "https://images.unsplash.com/photo-1599707367072-cd6ada2bc375?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDF8MHwxfHNlYXJjaHwxfHxkaWFtb25kJTIwZ2Vtc3RvbmUlMjBjbG9zZSUyMHVwfGVufDB8fHx8MTc4NjYzODA0MXww&ixlib=rb-4.1.0&q=85&w=1000";
const IMG_4 = HERO_IMG;

const CHAPTERS = [
  { n: "01", title: "Handpicked At Origin", img: IMG_1, text: "Every rough crystal is hand-selected from the world's most trusted diamond sources, moving only through Kimberley Process certified channels. We trace origin before we ever touch the wheel — because brilliance without integrity is just glass." },
  { n: "02", title: "The Scaife & The Hand", img: IMG_2, text: "Inside our state-of-the-art cutting atelier, generations of master craftsmen work the polishing disc — the scaife — stone by stone, from delicate 0.18 ct melee to 10 ct+ solitaires. We cut for fire, not for weight: a philosophy that costs us carats and earns us loyalty." },
  { n: "03", title: "Certified, Without Exception", img: IMG_3, text: "GIA, IGI and HRD certificates accompany our stones. What we say a diamond is, the world's strictest laboratories confirm in writing." },
  { n: "04", title: "A Quiet Global Trust", img: IMG_4, text: "From our atelier to maisons and retailers across 50+ countries — buyers build their collections on our consistency. No noise, no shortcuts, only stones that arrive exactly as promised." },
];

const STATS = [
  ["35+", "Years of Craft"],
  ["1,500+", "Stones In Stock"],
  ["0.18–10", "Carat Range We Cut"],
  ["50+", "Export Countries"],
];

export default function Home() {
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const imgY = useTransform(scrollYProgress, [0, 1], [0, 140]);
  const imgScale = useTransform(scrollYProgress, [0, 1], [1, 1.15]);
  const [featured, setFeatured] = useState([]);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    api.get("/diamonds", { params: { sort: "featured", limit: 4 } })
      .then((r) => setFeatured(r.data.items))
      .catch(() => setLocked(true));
  }, []);

  return (
    <div data-testid="home-page">
      {/* HERO */}
      <section ref={heroRef} className="relative min-h-screen overflow-hidden pt-20" data-testid="hero-section">
        <div className="mx-auto grid max-w-[1440px] items-center gap-12 px-6 pb-24 pt-16 lg:grid-cols-2 lg:pt-24">
          <div className="relative z-10">
            <MaskedLine delay={0.1}>
              <Overline>Natural Diamonds • Mumbai → The World</Overline>
            </MaskedLine>
            <h1 className="mt-8 font-serif text-6xl font-light leading-[0.95] tracking-tight text-white sm:text-7xl lg:text-8xl" data-testid="hero-heading">
              <MaskedLine delay={0.25}>Beyond</MaskedLine>
              <MaskedLine delay={0.4}>
                <span className="italic text-gold">Brilliance,</span>
              </MaskedLine>
              <MaskedLine delay={0.55}>Beyond Compare.</MaskedLine>
            </h1>
            <Reveal delay={0.8} className="mt-10 max-w-md">
              <p className="text-base leading-relaxed text-zinc-400">
                Manufacturers of exceptional natural diamonds — from 0.18 to
                10 carats, with over 1,500 certified stones in live inventory.
                Cut in Surat, traded from Mumbai, trusted worldwide.
              </p>
            </Reveal>
            <Reveal delay={1} className="mt-12 flex flex-wrap items-center gap-5">
              <Link to="/collection" data-testid="hero-explore-button"
                className="group flex items-center gap-3 bg-gold px-8 py-4 font-mono text-[11px] uppercase tracking-[0.25em] text-black transition-colors duration-300 hover:bg-gold-light active:scale-95">
                Explore the Collection
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={1.5} />
              </Link>
              <a href="#story" data-testid="hero-story-button"
                className="border border-white/20 px-8 py-4 font-mono text-[11px] uppercase tracking-[0.25em] text-white transition-colors duration-300 hover:border-gold hover:text-gold active:scale-95">
                Our Story
              </a>
            </Reveal>
          </div>

          <motion.div style={{ y: imgY }} className="relative hidden lg:block" aria-hidden="true">
            <div className="absolute -inset-8 border border-gold/15" />
            <motion.div style={{ scale: imgScale }} className="overflow-hidden">
              <motion.img
                src={HERO_IMG}
                alt="Brilliant cut diamond on black"
                className="aspect-[4/5] w-full object-cover"
                initial={{ scale: 1.3, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
              />
            </motion.div>
            <div className="absolute -bottom-6 -left-6 bg-gold px-6 py-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-black">Bharat Diamond Bourse, Mumbai • Mahidharpura, Surat</p>
            </div>
          </motion.div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2" aria-hidden="true">
          <motion.div animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 2 }}>
            <ArrowDown className="h-4 w-4 text-zinc-600" strokeWidth={1.5} />
          </motion.div>
        </div>
      </section>

      <EditorialMarquee />

      {/* MANIFESTO */}
      <section id="story" className="mx-auto max-w-[1440px] px-6 py-32" data-testid="manifesto-section">
        <Overline>The Manifesto</Overline>
        <MaskedLine inView className="mt-6">
          <h2 className="max-w-3xl font-serif text-4xl font-light leading-tight text-white sm:text-5xl">
            Four chapters. <span className="italic text-gold">One obsession.</span>
          </h2>
        </MaskedLine>

        <div className="mt-24 space-y-10">
          {CHAPTERS.map((c, i) => (
            <div key={c.n} className="sticky" style={{ top: `${96 + i * 28}px` }}>
              <div
                className={`grid overflow-hidden border border-white/10 bg-[#0C1E30] md:grid-cols-2 ${i % 2 ? "md:[&>*:first-child]:order-2" : ""}`}
                data-testid={`manifesto-chapter-${c.n}`}
              >
                <div className="relative min-h-[300px] overflow-hidden">
                  <img src={c.img} alt={c.title} loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 hover:scale-105" />
                  <div className="absolute inset-0 bg-black/30" />
                </div>
                <div className="flex flex-col justify-center p-10 md:p-16">
                  <span className="font-serif text-7xl font-light text-outline">{c.n}</span>
                  <h3 className="mt-6 font-serif text-3xl font-light text-white">{c.title}</h3>
                  <p className="mt-5 max-w-md text-sm leading-relaxed text-zinc-400">{c.text}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURED */}
      <section className="border-t border-white/10 bg-[#0A1A2B]" data-testid="featured-section">
        <div className="mx-auto max-w-[1440px] px-6 py-32">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <Overline>Selected Stones</Overline>
              <MaskedLine inView className="mt-6">
                <h2 className="font-serif text-4xl font-light text-white sm:text-5xl">
                  The <span className="italic text-gold">Featured</span> Four
                </h2>
              </MaskedLine>
            </div>
            <Link to="/collection" data-testid="featured-view-all-link"
              className="group flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-gold">
              View full collection
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={1.5} />
            </Link>
          </div>
          {locked ? (
            <div className="mt-16 border border-gold/30 bg-[#0C1E30] p-14" data-testid="featured-locked">
              <p className="font-serif text-3xl font-light italic text-gold">The collection is members only.</p>
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-zinc-400">
                Register with your company and KYC details — once our team
                approves your account, the full inventory and live pricing unlock.
              </p>
              <Link to="/register" data-testid="featured-register-button"
                className="mt-8 inline-block bg-gold px-8 py-4 font-mono text-[11px] uppercase tracking-[0.25em] text-black transition-colors hover:bg-gold-light active:scale-95">
                Register for Access
              </Link>
            </div>
          ) : (
            <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="featured-grid">
              {featured.map((d, i) => (
                <DiamondCard key={d.diamond_id} diamond={d} index={i} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* STATS */}
      <section className="border-t border-white/10" data-testid="stats-section">
        <div className="mx-auto grid max-w-[1440px] grid-cols-2 lg:grid-cols-4">
          {STATS.map(([num, label], i) => (
            <Reveal key={label} delay={i * 0.1} className={`border-white/10 px-8 py-14 ${i % 2 ? "border-l" : ""} ${i > 1 ? "border-t lg:border-t-0 lg:border-l" : ""}`}>
              <p className="font-serif text-5xl font-light text-gold">{num}</p>
              <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-500">{label}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-white/10 bg-[#0C1E30]" data-testid="cta-section">
        <div className="mx-auto max-w-[1440px] px-6 py-32">
          <Overline>Private Enquiries</Overline>
          <MaskedLine inView className="mt-6">
            <h2 className="max-w-2xl font-serif text-4xl font-light leading-tight text-white sm:text-6xl">
              Looking for something <span className="italic text-gold">specific?</span>
            </h2>
          </MaskedLine>
          <Reveal delay={0.2} className="mt-8 max-w-lg">
            <p className="text-sm leading-relaxed text-zinc-400">
              Tell us the shape, carat and budget — our sourcing desk will
              respond within 24 hours with matched stones and certificates.
            </p>
          </Reveal>
          <Reveal delay={0.3} className="mt-10">
            <Link to="/contact" data-testid="cta-enquire-button"
              className="group inline-flex items-center gap-3 border border-gold px-10 py-4 font-mono text-[11px] uppercase tracking-[0.25em] text-gold transition-colors duration-300 hover:bg-gold hover:text-black active:scale-95">
              Send an Enquiry
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={1.5} />
            </Link>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
