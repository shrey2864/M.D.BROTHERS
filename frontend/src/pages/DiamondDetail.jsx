import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, MessageCircle, Download, FileBadge, Play, ImageIcon } from "lucide-react";
import { api } from "@/lib/api";
import { waLink } from "@/lib/config";
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
  const canView = !!user && (user.role === "admin" || user.status === "approved");
  const [diamond, setDiamond] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!canView) return;
    api.get(`/diamonds/${id}`)
      .then((r) => setDiamond(r.data))
      .catch(() => setNotFound(true));
  }, [id, canView]);

  if (user !== null && !canView)
    return (
      <div className="mx-auto max-w-[1440px] px-6 pb-32 pt-40" data-testid="diamond-gate">
        <Overline>{!user ? "Members Only" : "Approval Pending"}</Overline>
        <h1 className="mt-4 max-w-2xl font-serif text-5xl font-light leading-tight text-white">
          {!user ? (
            <>This stone is <span className="italic text-gold">members only.</span></>
          ) : (
            <>Your account is <span className="italic text-gold">under review.</span></>
          )}
        </h1>
        <p className="mt-6 max-w-lg text-sm leading-relaxed text-zinc-400">
          {!user
            ? "Register with your company and KYC details to view our stones and live pricing — access is approved personally by our team."
            : "Once our team approves your account, this stone and its pricing will unlock here."}
        </p>
        {!user && (
          <div className="mt-10 flex flex-wrap gap-4">
            <Link to="/register" data-testid="diamond-gate-register-button"
              className="bg-gold px-8 py-4 font-mono text-[11px] uppercase tracking-[0.25em] text-black transition-colors hover:bg-gold-light active:scale-95">
              Register for Access
            </Link>
            <Link to="/login" data-testid="diamond-gate-login-button"
              className="border border-white/20 px-8 py-4 font-mono text-[11px] uppercase tracking-[0.25em] text-white transition-colors hover:border-gold hover:text-gold active:scale-95">
              Sign In
            </Link>
          </div>
        )}
      </div>
    );

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
            <a
              href={waLink(`Hello M.D.Brothers, I'm interested in ${diamond.sku} — ${diamond.carat.toFixed(2)} ct ${diamond.shape} (${diamond.color}/${diamond.clarity}, ${diamond.cut} cut). Please share more details.`)}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="diamond-whatsapp-button"
              className="mt-6 inline-flex items-center gap-3 border border-emerald-500/50 px-8 py-3 font-mono text-[11px] uppercase tracking-[0.25em] text-emerald-400 transition-colors duration-300 hover:bg-emerald-500 hover:text-black active:scale-95"
            >
              <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
              Chat on WhatsApp
            </a>
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

          {/* Downloads */}
          <div className="mt-10" data-testid="diamond-downloads">
            <Overline>Downloads</Overline>
            <div className="mt-5 flex flex-wrap gap-3">
              <a href={diamond.certificate_url || diamond.image} target="_blank" rel="noopener noreferrer"
                download data-testid="download-certificate-button"
                className="flex items-center gap-2 border border-gold/50 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-gold transition-colors duration-300 hover:bg-gold hover:text-black active:scale-95">
                <FileBadge className="h-4 w-4" strokeWidth={1.5} />
                Certificate {diamond.certificate_url ? "PDF" : ""}
              </a>
              {diamond.video_url ? (
                <a href={diamond.video_url} target="_blank" rel="noopener noreferrer"
                  download data-testid="download-video-button"
                  className="flex items-center gap-2 border border-white/20 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-white transition-colors duration-300 hover:border-gold hover:text-gold active:scale-95">
                  <Play className="h-4 w-4" strokeWidth={1.5} />
                  360° Video
                </a>
              ) : (
                <span className="flex items-center gap-2 border border-white/5 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-700" data-testid="download-video-unavailable">
                  <Play className="h-4 w-4" strokeWidth={1.5} />
                  Video on request
                </span>
              )}
              <a href={diamond.image} target="_blank" rel="noopener noreferrer"
                download data-testid="download-image-button"
                className="flex items-center gap-2 border border-white/20 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-white transition-colors duration-300 hover:border-gold hover:text-gold active:scale-95">
                <ImageIcon className="h-4 w-4" strokeWidth={1.5} />
                Image
              </a>
            </div>
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
