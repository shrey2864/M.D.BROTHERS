import Marquee from "react-fast-marquee";

const ITEMS = [
  "Beyond Brilliance",
  "M.D. Brothers",
  "Ethically Sourced",
  "Kimberley Process Certified",
  "Cut With Intent",
];

export const EditorialMarquee = () => (
  <div className="border-y border-white/10 bg-[#050505] py-8" aria-hidden="true">
    <Marquee speed={30} gradient={false}>
      {ITEMS.concat(ITEMS).map((item, i) => (
        <span key={i} className="mx-8 flex items-center gap-16">
          <span className="font-serif text-3xl font-light italic tracking-wide text-white/25 sm:text-4xl">
            {item}
          </span>
          <span className="text-xl text-gold/50">✦</span>
        </span>
      ))}
    </Marquee>
  </div>
);
