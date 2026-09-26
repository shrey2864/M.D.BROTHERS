import React, { useEffect, useState, useCallback } from "react";

// Adjust this to match how your app builds API URLs elsewhere (e.g. process.env.REACT_APP_BACKEND_URL)
const API_BASE = process.env.REACT_APP_BACKEND_URL || "";

const COLOR_BAND_LABELS = {
  DEF: "D-E-F (Colorless)",
  GHI: "G-H-I (Near Colorless)",
};

const CLARITY_BAND_LABELS = {
  "VVS-VS": "VVS-VS",
  SI: "SI",
  I1: "I1",
};

export default function JewelleryCatalog() {
  const [availableGroups, setAvailableGroups] = useState([]);
  const [colorBand, setColorBand] = useState(null);
  const [clarityBand, setClarityBand] = useState(null);
  const [minCarat, setMinCarat] = useState("");
  const [maxCarat, setMaxCarat] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load which color/clarity groupings actually have enough stock to show
  useEffect(() => {
    fetch(`${API_BASE}/api/jewellery/bands`)
      .then((r) => r.json())
      .then((data) => setAvailableGroups(data.groups || []))
      .catch(() => setAvailableGroups([]));
  }, []);

  const fetchItems = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (colorBand) params.set("color_band", colorBand);
    if (clarityBand) params.set("clarity_band", clarityBand);
    if (minCarat) params.set("min_carat", minCarat);
    if (maxCarat) params.set("max_carat", maxCarat);

    fetch(`${API_BASE}/api/jewellery?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [colorBand, clarityBand, minCarat, maxCarat]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const availableColorBands = [...new Set(availableGroups.map((g) => g.color_band))];
  const availableClarityBands = [...new Set(availableGroups.map((g) => g.clarity_band))];

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Jewellery Collection</h1>
        <p style={styles.subtitle}>Browse by colour, clarity, and size</p>
      </div>

      {/* Filters */}
      <div style={styles.filterBar}>
        <div style={styles.filterGroup}>
          <span style={styles.filterLabel}>Colour</span>
          <div style={styles.pillRow}>
            {availableColorBands.map((band) => (
              <button
                key={band}
                onClick={() => setColorBand(colorBand === band ? null : band)}
                style={colorBand === band ? styles.pillActive : styles.pill}
              >
                {COLOR_BAND_LABELS[band] || band}
              </button>
            ))}
            {availableColorBands.length === 0 && (
              <span style={styles.emptyNote}>No groupings available yet</span>
            )}
          </div>
        </div>

        <div style={styles.filterGroup}>
          <span style={styles.filterLabel}>Clarity</span>
          <div style={styles.pillRow}>
            {availableClarityBands.map((band) => (
              <button
                key={band}
                onClick={() => setClarityBand(clarityBand === band ? null : band)}
                style={clarityBand === band ? styles.pillActive : styles.pill}
              >
                {CLARITY_BAND_LABELS[band] || band}
              </button>
            ))}
          </div>
        </div>

        <div style={styles.filterGroup}>
          <span style={styles.filterLabel}>Size (ct)</span>
          <div style={styles.sizeRow}>
            <input
              type="number"
              step="0.01"
              placeholder="Min"
              value={minCarat}
              onChange={(e) => setMinCarat(e.target.value)}
              style={styles.sizeInput}
            />
            <span style={{ color: "#888" }}>–</span>
            <input
              type="number"
              step="0.01"
              placeholder="Max"
              value={maxCarat}
              onChange={(e) => setMaxCarat(e.target.value)}
              style={styles.sizeInput}
            />
          </div>
        </div>

        {(colorBand || clarityBand || minCarat || maxCarat) && (
          <button
            onClick={() => {
              setColorBand(null);
              setClarityBand(null);
              setMinCarat("");
              setMaxCarat("");
            }}
            style={styles.clearBtn}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <p style={styles.emptyNote}>Loading...</p>
      ) : items.length === 0 ? (
        <p style={styles.emptyNote}>No pieces match these filters yet.</p>
      ) : (
        <div style={styles.grid}>
          {items.map((item) => (
            <div key={item.id} style={styles.card}>
              <div style={styles.imageWrap}>
                {item.images && item.images[0] ? (
                  <img src={item.images[0]} alt={item.name} style={styles.image} />
                ) : (
                  <div style={styles.imagePlaceholder}>No Image</div>
                )}
              </div>
              <div style={styles.cardBody}>
                <h3 style={styles.cardTitle}>{item.name}</h3>
                <div style={styles.specRow}>
                  <span style={styles.spec}>Colour {item.color}</span>
                  <span style={styles.spec}>Clarity {item.clarity}</span>
                  <span style={styles.spec}>{item.carat} ct</span>
                </div>
                <div style={styles.price}>
                  {item.price ? `₹${item.price.toLocaleString("en-IN")}` : "Enquire for price"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Inline styles for a drop-in component — replace with your Tailwind classes
// if your project uses Tailwind throughout (recommended for consistency).
const styles = {
  page: { background: "#0b0b0d", minHeight: "100vh", padding: "48px 24px", color: "#eee" },
  header: { textAlign: "center", marginBottom: 40 },
  title: { fontSize: 36, fontWeight: 700, color: "#d4af37", letterSpacing: 1, margin: 0 },
  subtitle: { color: "#999", marginTop: 8 },
  filterBar: {
    display: "flex", flexWrap: "wrap", gap: 24, justifyContent: "center",
    alignItems: "flex-end", marginBottom: 40, padding: "20px 24px",
    background: "#141416", borderRadius: 12, border: "1px solid #262626",
  },
  filterGroup: { display: "flex", flexDirection: "column", gap: 8 },
  filterLabel: { fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "#888" },
  pillRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  pill: {
    padding: "8px 16px", borderRadius: 999, border: "1px solid #333",
    background: "transparent", color: "#ccc", cursor: "pointer", fontSize: 13,
  },
  pillActive: {
    padding: "8px 16px", borderRadius: 999, border: "1px solid #d4af37",
    background: "#d4af37", color: "#0b0b0d", cursor: "pointer", fontSize: 13, fontWeight: 600,
  },
  sizeRow: { display: "flex", alignItems: "center", gap: 8 },
  sizeInput: {
    width: 70, padding: "8px 10px", borderRadius: 8, border: "1px solid #333",
    background: "#0b0b0d", color: "#eee", fontSize: 13,
  },
  clearBtn: {
    padding: "8px 16px", borderRadius: 8, border: "1px solid #555",
    background: "transparent", color: "#aaa", cursor: "pointer", fontSize: 13, height: 36,
  },
  emptyNote: { textAlign: "center", color: "#777", marginTop: 40 },
  grid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: 24, maxWidth: 1200, margin: "0 auto",
  },
  card: {
    background: "#141416", border: "1px solid #262626", borderRadius: 14,
    overflow: "hidden", transition: "transform 0.15s",
  },
  imageWrap: { width: "100%", aspectRatio: "1 / 1", background: "#1c1c1f" },
  image: { width: "100%", height: "100%", objectFit: "cover" },
  imagePlaceholder: {
    width: "100%", height: "100%", display: "flex", alignItems: "center",
    justifyContent: "center", color: "#555", fontSize: 13,
  },
  cardBody: { padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: 600, margin: "0 0 8px", color: "#f0f0f0" },
  specRow: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 },
  spec: {
    fontSize: 11, color: "#aaa", background: "#1c1c1f",
    padding: "3px 8px", borderRadius: 6, border: "1px solid #2a2a2a",
  },
  price: { fontSize: 15, fontWeight: 700, color: "#d4af37" },
};
