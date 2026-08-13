import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Overline, Reveal } from "@/components/Reveal";
import { EnquiryForm } from "@/components/EnquiryForm";

const SPEC_LABELS = [
  ["shape", "Shape"],
  ["carat", "Carat Weight"],
  ["cut", "Cut Grade"],
  ["color", "Color"],
  ["clarity", "Clarity"],
  ["polish", "Polish"],
  ["symmetry", "Symmetry"],
  ["fluorescence", "Fluorescence"],
  ["certification", "Certificate"],
];

export default function DiamondDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [diamond, setDiamond] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api.get(`/diamonds/${id}`)
      .then((r) => setDiamond(r.data))
      .catch(() => setNotFound(true));
  }, [id]);

  if (notFound)
    return (
      <div className="mx-auto max-w-[1440px] px-6 py-40" data-testid="diamond-not-found">
        <p className="font-serif text-3xl italic text-zinc-500">This stone is no longer available.</p>
        <Link to="/collection" className="mt-6 inline-block font-mono text-[11px] uppercase tracking-[0.25em] text-gold">
          ← Back to collection
        </Link>
      </div>
    );

  if (!diamond)
    return (
      <div className="mx-auto max-w-[1440px] px-6 py-40" data-testid="diamond-loading">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-zinc-600">Loading…</p>
      </div>
    );

  return (
    <div className="mx-auto max-w-[1440px] px-6 pb-32 pt-28" data-testid="diamond-detail-page">
      <Link to="/collection" data-testid="diamond-back-link"
        className="group inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-500 transition-colors hover:text-gold">
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" strokeWidth={1.5} />
        Collection
      </Link>

      <div className="mt-10 grid gap-16 lg:grid-cols-2">
        {/* Sticky image */}
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Reveal>
            <div className="relative overflow-hidden border border-white/10">
              <img src={diamond.image} alt={`${diamond.shape} diamond ${diamond.sku}`}
                className="aspect-square w-full object-cover" data-testid="diamond-image" />
              <div className="absolute inset-0 bg-black/20" />
              <span className="absolute left-4 top-4 border border-white/20 bg-black/60 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.25em] text-white backdrop-blur">
                {diamond.certification} Certified
              </span>
            </div>
          </Reveal>
        </div>

        {/* Specs + enquiry */}
        <div>
          <Overline>{diamond.sku}</Overline>
          <h1 className="mt-4 font-serif text-5xl font-light text-white" data-testid="diamond-title">
            {diamond.carat.toFixed(2)} ct {diamond.shape}
          </h1>

          <div className="mt-8 border-y border-white/10 py-6">
            {diamond.price != null ? (
              <div>
                <p className="font-serif text-4xl text-gold" data-testid="diamond-price">${diamond.price.toLocaleString()}</p>
                <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
                  ${Math.round(diamond.price / diamond.carat).toLocaleString()} per carat
                </p>
              </div>
            ) : (
              <div data-testid="diamond-price-locked">
                <p className="font-serif text-2xl italic text-zinc-500">Price available to trade clients</p>
                <Link to="/login" data-testid="diamond-login-for-price-link"
                  className="mt-4 inline-block border border-gold px-6 py-2 font-mono text-[11px] uppercase tracking-[0.25em] text-gold transition-colors hover:bg-gold hover:text-black active:scale-95">
                  Login to view price
                </Link>
              </div>
            )}
          </div>

          <div className="mt-8 grid grid-cols-2 gap-x-8" data-testid="diamond-specs">
            {SPEC_LABELS.map(([key, label]) => (
              <div key={key} className="flex justify-between border-b border-white/5 py-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">{label}</span>
                <span className="font-mono text-xs tracking-[0.1em] text-white">
                  {key === "carat" ? `${diamond.carat.toFixed(2)} CT` : diamond[key]}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-16">
            <Overline>Enquire About This Stone</Overline>
            <div className="mt-8">
              <EnquiryForm diamondSku={diamond.sku} testIdPrefix="diamond-enquiry" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
