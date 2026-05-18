import { useCallback, useEffect, useMemo, useState } from "react";
import CalculatorLock from "./CalculatorLock.jsx";
import {
  isSessionUnlocked,
  loadAppState,
  saveAppState,
  setCalculatorWindowMode,
  setInventoryWindowMode,
  setSessionUnlocked,
} from "./desktopBridge.js";

// ─── THEME ────────────────────────────────────────────────────────────────────
const C = {
  bg: "#0d1117",
  surface: "#161b22",
  card: "#1c2333",
  border: "#30363d",
  accent: "#f0a500",
  accentBg: "#f0a50015",
  text: "#e6edf3",
  muted: "#7d8590",
  subtle: "#3d444d",
  green: "#3fb950",
  greenBg: "#3fb95015",
  red: "#f85149",
  redBg: "#f8514915",
  blue: "#58a6ff",
  blueBg: "#58a6ff15",
  orange: "#f0a500",
  orangeBg: "#f0a50015",
  teal: "#2dd4bf",
  tealBg: "#2dd4bf15",
  purple: "#bc8cff",
  purpleBg: "#bc8cff15",
};

const STAGE_COLORS = {
  "Raw Material": C.blue,
  Cutting: C.orange,
  Pressing: C.teal,
  Polishing: C.purple,
  Done: C.green,
};

const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: ${C.bg}; color: ${C.text}; font-size: 14px; line-height: 1.5; }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
  input, select, textarea {
    background: ${C.surface}; border: 1px solid ${C.border}; color: ${C.text};
    padding: 8px 12px; border-radius: 6px; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 13px; outline: none; width: 100%; transition: border-color .15s;
  }
  input:focus, select:focus { border-color: ${C.accent}; box-shadow: 0 0 0 3px ${C.accent}20; }
  select option { background: ${C.card}; }
  button { cursor: pointer; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-weight: 600; transition: all .15s; }
  button:active { transform: scale(0.97); }
  table { width: 100%; border-collapse: collapse; }
  th { color: ${C.muted}; font-size: 11px; font-weight: 600; letter-spacing: .6px;
       text-transform: uppercase; padding: 8px 12px; text-align: left;
       border-bottom: 1px solid ${C.border}; white-space: nowrap; }
  td { padding: 10px 12px; border-bottom: 1px solid ${C.border}22; font-size: 13px; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: ${C.border}18; }
  .inventory-shell {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 232px minmax(0, 1fr);
    background: ${C.bg};
  }
  .side-nav {
    min-height: 100vh;
    background: #111722;
    border-right: 1px solid ${C.border};
    padding: 18px 14px;
    position: sticky;
    top: 0;
    align-self: start;
  }
  .brand-block {
    padding: 4px 6px 18px;
    margin-bottom: 10px;
    border-bottom: 1px solid ${C.border};
  }
  .nav-button {
    width: 100%;
    height: 42px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 11px;
    border-radius: 6px;
    border: 1px solid transparent;
    background: transparent;
    color: ${C.muted};
    text-align: left;
    font-size: 13px;
  }
  .nav-button:hover { background: ${C.border}24; color: ${C.text}; }
  .nav-button.active {
    background: ${C.accentBg};
    border-color: ${C.accent}55;
    color: ${C.accent};
  }
  .app-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .app-header {
    min-height: 76px;
    background: ${C.surface};
    border-bottom: 1px solid ${C.border};
    padding: 14px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    position: sticky;
    top: 0;
    z-index: 50;
  }
  .content-wrap {
    width: 100%;
    max-width: 1560px;
    padding: 22px 24px 34px;
  }
  .dashboard-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(320px, .8fr);
    gap: 16px;
    align-items: start;
  }
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }
  .quick-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 16px;
  }
  .quick-action {
    min-height: 76px;
    border-radius: 8px;
    padding: 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
  }
  @media (max-width: 1100px) {
    .inventory-shell { grid-template-columns: 76px minmax(0, 1fr); }
    .brand-subtitle, .nav-label, .nav-badge { display: none; }
    .nav-button { justify-content: center; padding: 0; }
    .dashboard-grid { grid-template-columns: 1fr; }
    .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .quick-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
`;

// ─── DATA ─────────────────────────────────────────────────────────────────────
const today = new Date().toISOString().split("T")[0];
const r2 = (n) => Math.round(n * 100) / 100;
const fmtR = (n) =>
  n == null
    ? "—"
    : `₹${r2(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtKg = (n) =>
  !n || n === 0
    ? "—"
    : `${r2(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })} kg`;
const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) + "%" : "—");

const initVendors = [
  {
    id: "V-001",
    type: "rm",
    name: "Tata Steel",
    contact: "9800011111",
    city: "Mumbai",
  },
  {
    id: "V-002",
    type: "rm",
    name: "Shiv Steel",
    contact: "9800022222",
    city: "Pune",
  },
  {
    id: "V-003",
    type: "rm",
    name: "JSW Steel",
    contact: "9800033333",
    city: "Mumbai",
  },
  {
    id: "V-004",
    type: "rm",
    name: "Mehta Metals",
    contact: "9800044444",
    city: "Surat",
  },
  {
    id: "V-005",
    type: "cutting",
    name: "Raj Cutters",
    contact: "9800055555",
    city: "Bhiwandi",
  },
  {
    id: "V-006",
    type: "cutting",
    name: "Prakash Cutters",
    contact: "9800066666",
    city: "Bhiwandi",
  },
  {
    id: "V-007",
    type: "cutting",
    name: "Suresh Circle Works",
    contact: "9800077777",
    city: "Thane",
  },
  {
    id: "V-008",
    type: "polishing",
    name: "Sharma Polishing",
    contact: "9800088888",
    city: "Mumbai",
  },
  {
    id: "V-009",
    type: "polishing",
    name: "Gupta Buffing",
    contact: "9800099999",
    city: "Mumbai",
  },
  {
    id: "V-010",
    type: "polishing",
    name: "Anand Polish",
    contact: "9800010101",
    city: "Thane",
  },
  {
    id: "V-011",
    type: "polishing",
    name: "Kumar Buffing",
    contact: "9800012121",
    city: "Navi Mumbai",
  },
  {
    id: "V-012",
    type: "pressing",
    name: "Kapoor Press",
    contact: "9800013131",
    city: "Bhiwandi",
  },
];

const initData = {
  rawMaterials: [
    {
      id: "RM-001",
      date: "10 Mar",
      supplier: "Tata Steel",
      matType: "Coil",
      grade: "DD",
      gauge: "20g",
      purchaseKg: 950,
      ratePerKg: 98,
      vendor: "Raj Cutters",
      status: "Issued",
    },
    {
      id: "RM-002",
      date: "08 Mar",
      supplier: "Shiv Steel",
      matType: "Patta",
      grade: "J/5",
      gauge: "22g",
      purchaseKg: 840,
      ratePerKg: 102,
      vendor: "Prakash Cutters",
      status: "Issued",
    },
    {
      id: "RM-003",
      date: "06 Mar",
      supplier: "JSW Steel",
      matType: "Coil",
      grade: "SDM",
      gauge: "20g",
      purchaseKg: 720,
      ratePerKg: 95,
      vendor: "Raj Cutters",
      status: "Issued",
    },
    {
      id: "RM-004",
      date: "05 Mar",
      supplier: "Mehta Metals",
      matType: "Patta",
      grade: "J/6",
      gauge: "22g",
      purchaseKg: 1100,
      ratePerKg: 100,
      vendor: "Suresh Circle Works",
      status: "Issued",
    },
  ],
  cuttingJobs: [
    {
      id: "CJ-001",
      dispatchDate: "10 Mar",
      vendor: "Raj Cutters",
      rmId: "RM-001",
      sentKg: 950,
      cuttingFactor: 1.17,
      status: "Completed",
    },
    {
      id: "CJ-002",
      dispatchDate: "08 Mar",
      vendor: "Prakash Cutters",
      rmId: "RM-002",
      sentKg: 840,
      cuttingFactor: 1.15,
      status: "Completed",
    },
    {
      id: "CJ-003",
      dispatchDate: "06 Mar",
      vendor: "Raj Cutters",
      rmId: "RM-003",
      sentKg: 720,
      cuttingFactor: 1.17,
      status: "In Progress",
    },
    {
      id: "CJ-004",
      dispatchDate: "05 Mar",
      vendor: "Suresh Circle Works",
      rmId: "RM-004",
      sentKg: 1100,
      cuttingFactor: 1.18,
      status: "Completed",
    },
  ],
  circleReceipts: [
    {
      id: "CR-001",
      jobId: "CJ-001",
      date: "11 Mar",
      size: '14"',
      receivedKg: 380,
    },
    {
      id: "CR-002",
      jobId: "CJ-001",
      date: "12 Mar",
      size: '12"',
      receivedKg: 320,
    },
    {
      id: "CR-003",
      jobId: "CJ-001",
      date: "13 Mar",
      size: '16"',
      receivedKg: 162,
    },
    {
      id: "CR-004",
      jobId: "CJ-002",
      date: "09 Mar",
      size: '14"',
      receivedKg: 400,
    },
    {
      id: "CR-005",
      jobId: "CJ-002",
      date: "10 Mar",
      size: '12"',
      receivedKg: 369,
    },
    {
      id: "CR-006",
      jobId: "CJ-003",
      date: "08 Mar",
      size: '11"',
      receivedKg: 280,
    },
    {
      id: "CR-007",
      jobId: "CJ-004",
      date: "06 Mar",
      size: '16"',
      receivedKg: 340,
    },
    {
      id: "CR-008",
      jobId: "CJ-004",
      date: "07 Mar",
      size: '14"',
      receivedKg: 380,
    },
    {
      id: "CR-009",
      jobId: "CJ-004",
      date: "08 Mar",
      size: '12"',
      receivedKg: 265,
    },
  ],
  pressing: [
    {
      id: "PR-208",
      dispatchDate: "12 Mar",
      receivedDate: "13 Mar",
      vendor: "Self",
      ccJobId: "CJ-001",
      circleSize: '14"',
      sentKg: 380,
      receivedKg: 368,
      pressRate: 12,
      utensil: "Plate",
      status: "Done",
    },
    {
      id: "PR-207",
      dispatchDate: "11 Mar",
      receivedDate: "12 Mar",
      vendor: "Kapoor Press",
      ccJobId: "CJ-002",
      circleSize: '14"',
      sentKg: 400,
      receivedKg: 388,
      pressRate: 15,
      utensil: "Bowl",
      status: "Done",
    },
    {
      id: "PR-206",
      dispatchDate: "10 Mar",
      receivedDate: "11 Mar",
      vendor: "Self",
      ccJobId: "CJ-004",
      circleSize: '16"',
      sentKg: 340,
      receivedKg: 330,
      pressRate: 12,
      utensil: "Thali",
      status: "Done",
    },
    {
      id: "PR-205",
      dispatchDate: "11 Mar",
      receivedDate: "",
      vendor: "Self",
      ccJobId: "CJ-001",
      circleSize: '12"',
      sentKg: 320,
      receivedKg: 0,
      pressRate: 12,
      utensil: "Plate",
      status: "Dispatched",
    },
  ],
  polishing: [
    {
      id: "PL-031",
      dispatchDate: "12 Mar",
      receivedDate: "",
      vendor: "Sharma Polishing",
      prId: "PR-208",
      sentKg: 368,
      returnedKg: 200,
      polishRate: 18,
      status: "Partial",
    },
    {
      id: "PL-030",
      dispatchDate: "11 Mar",
      receivedDate: "13 Mar",
      vendor: "Gupta Buffing",
      prId: "PR-207",
      sentKg: 388,
      returnedKg: 380,
      polishRate: 20,
      status: "Done",
    },
    {
      id: "PL-029",
      dispatchDate: "10 Mar",
      receivedDate: "",
      vendor: "Anand Polish",
      prId: "PR-206",
      sentKg: 330,
      returnedKg: 200,
      polishRate: 18,
      status: "Partial",
    },
  ],
};

// ─── COST HELPERS ─────────────────────────────────────────────────────────────
function jobStats(data, jobId) {
  const job = data.cuttingJobs.find((j) => j.id === jobId);
  if (!job) return null;
  const rm = data.rawMaterials.find((r) => r.id === job.rmId);
  if (!rm) return null;
  const receipts = data.circleReceipts.filter((r) => r.jobId === jobId);
  const totalCirclesKg = receipts.reduce((s, r) => s + r.receivedKg, 0);
  const scrapKg =
    job.status === "Completed"
      ? Math.max(0, job.sentKg - totalCirclesKg)
      : null;
  const rateWithCutting = rm.ratePerKg * job.cuttingFactor;
  const rmTotalCost = job.sentKg * rm.ratePerKg;
  const circlesValue = totalCirclesKg * rateWithCutting;
  const settlement =
    job.status === "Completed" && totalCirclesKg > 0
      ? rmTotalCost - circlesValue
      : null;
  const costPerKg =
    job.status === "Completed" && totalCirclesKg > 0 ? rateWithCutting : null;
  return {
    job,
    rm,
    receipts,
    totalCirclesKg,
    scrapKg,
    rateWithCutting,
    rmTotalCost,
    circlesValue,
    settlement,
    costPerKg,
  };
}
function getCircleCostPerKg(data, jobId) {
  return jobStats(data, jobId)?.costPerKg ?? null;
}
function getPressedCostPerKg(data, prId) {
  const pr = data.pressing.find((p) => p.id === prId);
  if (!pr || pr.status !== "Done" || !pr.receivedKg) return null;
  const circleCost = getCircleCostPerKg(data, pr.ccJobId);
  if (circleCost == null) return null;
  const lossKg = Math.max(0, pr.sentKg - pr.receivedKg);
  return (
    circleCost +
    (pr.receivedKg * pr.pressRate + lossKg * circleCost) / pr.receivedKg
  );
}
function getPolishedCostPerKg(data, plId) {
  const pl = data.polishing.find((p) => p.id === plId);
  if (!pl || !pl.returnedKg || pl.returnedKg <= 0) return null;
  const pressedCost = getPressedCostPerKg(data, pl.prId);
  if (pressedCost == null) return null;
  const lossKg = Math.max(0, pl.sentKg - pl.returnedKg);
  return (
    pressedCost +
    (pl.returnedKg * pl.polishRate + lossKg * pressedCost) / pl.returnedKg
  );
}

// ─── UI PRIMITIVES ────────────────────────────────────────────────────────────
function Pill({ label, color = "muted", dot }) {
  const map = {
    green: [C.greenBg, C.green, C.green + "44"],
    red: [C.redBg, C.red, C.red + "44"],
    orange: [C.orangeBg, C.orange, C.orange + "44"],
    blue: [C.blueBg, C.blue, C.blue + "44"],
    teal: [C.tealBg, C.teal, C.teal + "44"],
    purple: [C.purpleBg, C.purple, C.purple + "44"],
    muted: [C.border + "44", C.muted, C.border],
  };
  const [bg, fg, bd] = map[color] || map.muted;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 10px",
        borderRadius: 20,
        background: bg,
        color: fg,
        border: `1px solid ${bd}`,
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {dot && (
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: fg,
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </span>
  );
}

function Btn({
  children,
  onClick,
  variant = "primary",
  size = "md",
  disabled,
  full,
}) {
  const vs =
    {
      primary: { background: C.accent, color: "#000", border: "none" },
      outline: {
        background: "transparent",
        color: C.accent,
        border: `1px solid ${C.accent}`,
      },
      ghost: {
        background: "transparent",
        color: C.muted,
        border: `1px solid ${C.border}`,
      },
      danger: {
        background: "transparent",
        color: C.red,
        border: `1px solid ${C.red}55`,
      },
      success: { background: C.green, color: "#000", border: "none" },
    }[variant] || {};
  const sz =
    {
      sm: { padding: "5px 12px", fontSize: 12 },
      md: { padding: "8px 16px", fontSize: 13 },
      lg: { padding: "11px 22px", fontSize: 15 },
    }[size] || {};
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...vs,
        ...sz,
        borderRadius: 7,
        opacity: disabled ? 0.4 : 1,
        width: full ? "100%" : undefined,
      }}
    >
      {children}
    </button>
  );
}

function Modal({ title, onClose, children, width = 480 }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#000000aa",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          width: "100%",
          maxWidth: width,
          maxHeight: "90vh",
          overflow: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "18px 20px",
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: C.muted,
              fontSize: 20,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: "20px" }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label
        style={{
          display: "block",
          fontSize: 12,
          fontWeight: 600,
          color: C.muted,
          marginBottom: 5,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </label>
      {children}
      {hint && (
        <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{hint}</div>
      )}
    </div>
  );
}

function KV({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontWeight: 600, color: color || C.text }}>{value}</div>
    </div>
  );
}

function Section({ title, action, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      {(title || action) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          {title && (
            <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>
              {title}
            </div>
          )}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

function Box({ children, color, style }) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${color ? color + "33" : C.border}`,
        borderRadius: 10,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "16px 18px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: C.muted,
            fontWeight: 500,
            marginBottom: 8,
          }}
        >
          {label}
        </div>
        {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: color || C.text,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: C.muted, marginTop: 5 }}>{sub}</div>
      )}
    </div>
  );
}

function EmptyState({ icon, text }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px", color: C.muted }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>{icon || "📭"}</div>
      <div style={{ fontSize: 14 }}>{text || "Nothing here yet"}</div>
    </div>
  );
}

function AlertBanner({ items }) {
  if (!items?.length) return null;
  return (
    <div
      style={{
        background: C.orangeBg,
        border: `1px solid ${C.orange}44`,
        borderRadius: 8,
        padding: "12px 16px",
        marginBottom: 20,
      }}
    >
      <div
        style={{
          fontWeight: 600,
          fontSize: 13,
          color: C.orange,
          marginBottom: 6,
        }}
      >
        ⚠ Action Needed
      </div>
      {items.map((item, i) => (
        <div key={i} style={{ fontSize: 13, color: C.text, marginBottom: 3 }}>
          • {item}
        </div>
      ))}
    </div>
  );
}

// ─── PIPELINE FLOW BAR ────────────────────────────────────────────────────────
function PipelineBar({ active }) {
  const stages = ["Raw Material", "Cutting", "Pressing", "Polishing", "Done"];
  const idx = stages.indexOf(active);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        background: C.surface,
        borderRadius: 8,
        padding: "6px 8px",
        border: `1px solid ${C.border}`,
        marginBottom: 0,
      }}
    >
      {stages.map((s, i) => {
        const isActive = i === idx;
        const isDone = i < idx;
        const col = STAGE_COLORS[s] || C.muted;
        return (
          <div
            key={s}
            style={{ display: "flex", alignItems: "center", flex: 1 }}
          >
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "6px 4px",
                background: isActive ? col + "22" : "transparent",
                borderRadius: 6,
                border: isActive
                  ? `1px solid ${col}55`
                  : "1px solid transparent",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? col : isDone ? C.green : C.muted,
                }}
              >
                {isDone ? "✓ " : ""}
                {s}
              </span>
            </div>
            {i < stages.length - 1 && (
              <div
                style={{
                  width: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 1,
                    background: i < idx ? C.green + "66" : C.border,
                  }}
                />
                <span
                  style={{ fontSize: 8, color: i < idx ? C.green : C.border }}
                >
                  ▶
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── COST CHIP ────────────────────────────────────────────────────────────────
function CostChip({ label, cost, color }) {
  if (cost == null)
    return <span style={{ fontSize: 12, color: C.muted }}>—</span>;
  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "flex-end",
      }}
    >
      {label && <div style={{ fontSize: 10, color: C.muted }}>{label}</div>}
      <div style={{ fontWeight: 700, fontSize: 14, color: color || C.accent }}>
        {fmtR(cost)}/kg
      </div>
    </div>
  );
}

function PanelHeader({ title, subtitle, action }) {
  return (
    <div
      style={{
        padding: "14px 16px",
        borderBottom: `1px solid ${C.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            {subtitle}
          </div>
        )}
      </div>
      {action}
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ data, setPage }) {
  const completedJobs = data.cuttingJobs.filter(
    (j) => j.status === "Completed",
  );
  const totalCirclesKg = useMemo(
    () =>
      completedJobs.reduce((s, j) => {
        const recs = data.circleReceipts.filter((r) => r.jobId === j.id);
        return s + recs.reduce((ss, r) => ss + r.receivedKg, 0);
      }, 0),
    [data],
  );

  const pendingPress = data.pressing.filter((p) => p.status === "Dispatched");
  const pendingPolish = data.polishing.filter((p) => p.status !== "Done");
  const inProgressCutting = data.cuttingJobs.filter(
    (j) => j.status === "In Progress",
  );
  const polishedReady = data.polishing
    .filter((p) => p.returnedKg > 0)
    .reduce((s, p) => s + p.returnedKg, 0);
  const totalPurchasedKg = data.rawMaterials.reduce((s, r) => s + r.purchaseKg, 0);
  const activeWorkCount =
    inProgressCutting.length + pendingPress.length + pendingPolish.length;

  const alerts = [
    ...inProgressCutting.map((j) => ({
      id: j.id,
      stage: "Cutting",
      title: `${j.vendor} needs circle receipts`,
      detail: `${fmtKg(j.sentKg)} dispatched from ${j.rmId}`,
      page: "cutting",
      color: C.orange,
    })),
    ...pendingPress.map((p) => ({
      id: p.id,
      stage: "Pressing",
      title: `${p.utensil} awaiting return`,
      detail: `${fmtKg(p.sentKg)} at ${p.vendor}`,
      page: "pressing",
      color: C.teal,
    })),
    ...pendingPolish.map((p) => {
      const pending = p.sentKg - (p.returnedKg || 0);
      return {
        id: p.id,
        stage: "Polishing",
        title: `${fmtKg(pending)} pending from ${p.vendor}`,
        detail: `${fmtKg(p.returnedKg || 0)} returned from ${fmtKg(p.sentKg)} sent`,
        page: "polishing",
        color: C.purple,
      };
    }),
  ];

  // pipeline kg flow
  const pipeline = [
    {
      stage: "Purchased",
      kg: totalPurchasedKg,
      color: C.blue,
    },
    {
      stage: "At Cutter",
      kg: data.cuttingJobs
        .filter((j) => j.status === "In Progress")
        .reduce((s, j) => s + j.sentKg, 0),
      color: C.orange,
    },
    { stage: "Circles", kg: totalCirclesKg, color: C.accent },
    {
      stage: "Pressed",
      kg: data.pressing
        .filter((p) => p.status === "Done")
        .reduce((s, p) => s + (p.receivedKg || 0), 0),
      color: C.teal,
    },
    {
      stage: "Polishing",
      kg: data.polishing.reduce(
        (s, p) => s + Math.max(0, p.sentKg - (p.returnedKg || 0)),
        0,
      ),
      color: C.purple,
    },
    { stage: "Ready", kg: polishedReady, color: C.green },
  ];
  const maxKg = Math.max(...pipeline.map((p) => p.kg), 1);

  const rm0 = data.rawMaterials[0] ?? {};
  const cj0 = rm0.id
    ? data.cuttingJobs.find((j) => j.rmId === rm0.id && j.status === "Completed")
    : null;
  const pr0 = cj0
    ? data.pressing.find((p) => p.ccJobId === cj0.id && p.status === "Done")
    : null;
  const pl0 = pr0
    ? data.polishing.find((p) => p.prId === pr0.id && p.returnedKg > 0)
    : null;
  const costChain = rm0.id ? [
    { label: "Raw Material", cost: rm0.ratePerKg, color: C.blue },
    {
      label: "After Cutting",
      cost: cj0 ? rm0.ratePerKg * cj0.cuttingFactor : null,
      color: C.orange,
    },
    {
      label: "After Pressing",
      cost: pr0 ? getPressedCostPerKg(data, pr0.id) : null,
      color: C.teal,
    },
    {
      label: "After Polishing",
      cost: pl0 ? getPolishedCostPerKg(data, pl0.id) : null,
      color: C.green,
    },
  ] : [];
  const recentLots = data.rawMaterials.slice(0, 4);
  const recentReturns = data.polishing
    .filter((p) => p.returnedKg > 0)
    .slice(0, 4);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="kpi-grid">
        <StatCard
          label="RM Purchased"
          value={fmtKg(totalPurchasedKg)}
          icon="RM"
          color={C.blue}
        />
        <StatCard
          label="Circles in Stock"
          value={fmtKg(totalCirclesKg)}
          sub="Completed jobs"
          icon="CC"
          color={C.accent}
        />
        <StatCard
          label="Polished Ready"
          value={fmtKg(polishedReady)}
          sub="For packaging"
          icon="OK"
          color={C.green}
        />
        <StatCard
          label="Needs Attention"
          value={activeWorkCount}
          sub="Across all stages"
          icon="!"
          color={C.orange}
        />
      </div>

      <div className="quick-grid">
        {[
          { label: "New Purchase", meta: "Buy and dispatch RM", page: "raw", color: C.blue },
          { label: "Circle Receipt", meta: "Receive cutting output", page: "cutting", color: C.orange },
          { label: "Pressing Return", meta: "Close pressing batch", page: "pressing", color: C.teal },
          { label: "Polish Return", meta: "Record final stock", page: "polishing", color: C.purple },
          { label: "Review Costs", meta: "Check per-kg movement", page: "costs", color: C.green },
        ].map((q) => (
          <button
            className="quick-action"
            key={q.label}
            onClick={() => setPage(q.page)}
            style={{
              background: q.color + "12",
              border: `1px solid ${q.color}44`,
              color: C.text,
            }}
          >
            <span
              style={{
                width: 10,
                alignSelf: "stretch",
                borderRadius: 8,
                background: q.color,
                flexShrink: 0,
              }}
            />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 700, fontSize: 13 }}>
                {q.label}
              </span>
              <span style={{ display: "block", color: C.muted, fontSize: 11, marginTop: 2 }}>
                {q.meta}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="dashboard-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Box>
            <PanelHeader title="Material Flow" subtitle="Live kg movement through production" />
            <div style={{ padding: "16px 18px 18px" }}>
              {pipeline.map((p) => (
                <div
                  key={p.stage}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "96px minmax(0, 1fr) 86px",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 12,
                  }}
                >
                  <div style={{ fontSize: 12, color: C.muted }}>{p.stage}</div>
                  <div
                    style={{
                      height: 18,
                      background: C.surface,
                      border: `1px solid ${C.border}`,
                      borderRadius: 999,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.max(2, (p.kg / maxKg) * 100)}%`,
                        height: "100%",
                        background: p.color,
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: p.color, textAlign: "right" }}>
                    {fmtKg(p.kg)}
                  </div>
                </div>
              ))}
            </div>
          </Box>

          <Box>
            <PanelHeader title="Recent Raw Material" subtitle="Latest purchases and cutter dispatches" />
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Lot</th>
                    <th>Supplier</th>
                    <th>Grade</th>
                    <th>Weight</th>
                    <th>Cutter</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLots.map((lot) => (
                    <tr key={lot.id}>
                      <td><strong>{lot.id}</strong></td>
                      <td>{lot.supplier}</td>
                      <td>{lot.grade} {lot.gauge}</td>
                      <td>{fmtKg(lot.purchaseKg)}</td>
                      <td>{lot.vendor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Box>

          <Box>
            <PanelHeader title="Latest Finished Movement" subtitle="Polishing returns ready for next step" />
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Batch</th>
                    <th>Vendor</th>
                    <th>Returned</th>
                    <th>Status</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {recentReturns.length === 0 ? (
                    <tr><td colSpan={5}><EmptyState text="No polishing returns yet" /></td></tr>
                  ) : (
                    recentReturns.map((pl) => (
                      <tr key={pl.id}>
                        <td><strong>{pl.id}</strong></td>
                        <td>{pl.vendor}</td>
                        <td>{fmtKg(pl.returnedKg)}</td>
                        <td><Pill label={pl.status} color={pl.status === "Done" ? "green" : "orange"} /></td>
                        <td><CostChip cost={getPolishedCostPerKg(data, pl.id)} color={C.green} /></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Box>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Box color={alerts.length ? C.orange : C.green}>
            <PanelHeader
              title="Today's Work"
              subtitle={alerts.length ? `${alerts.length} item${alerts.length > 1 ? "s" : ""} need action` : "No pending production returns"}
            />
            <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              {alerts.length === 0 ? (
                <EmptyState text="Production flow is clear" />
              ) : (
                alerts.slice(0, 6).map((item) => (
                  <button
                    key={`${item.stage}-${item.id}`}
                    onClick={() => setPage(item.page)}
                    style={{
                      textAlign: "left",
                      background: C.surface,
                      border: `1px solid ${item.color}33`,
                      borderLeft: `4px solid ${item.color}`,
                      borderRadius: 8,
                      padding: "10px 12px",
                      color: C.text,
                    }}
                  >
                    <div style={{ fontSize: 11, color: item.color, fontWeight: 700, marginBottom: 3 }}>
                      {item.stage} - {item.id}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{item.detail}</div>
                  </button>
                ))
              )}
            </div>
          </Box>

          <Box>
            <PanelHeader
              title={rm0.id ? `Cost Chain - ${rm0.grade} ${rm0.gauge}` : "Cost Chain"}
              subtitle={rm0.id ? rm0.id : "No raw material recorded"}
            />
            <div style={{ padding: "14px 16px" }}>
              {costChain.map((cc) => (
                <div
                  key={cc.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 0",
                    borderBottom: `1px solid ${C.border}66`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 99, background: cc.cost != null ? cc.color : C.border }} />
                    <span style={{ fontSize: 13, color: cc.cost != null ? C.text : C.muted }}>{cc.label}</span>
                  </div>
                  <CostChip cost={cc.cost} color={cc.color} />
                </div>
              ))}
              {costChain[3]?.cost && costChain[0]?.cost && (
                <div style={{ marginTop: 12, textAlign: "right", fontSize: 12, color: C.muted }}>
                  Total added <strong style={{ color: C.accent }}>{fmtR(costChain[3].cost - costChain[0].cost)}/kg</strong>
                </div>
              )}
            </div>
          </Box>
        </div>
      </div>
    </div>
  );
}

// ─── RAW MATERIAL ─────────────────────────────────────────────────────────────
function RawMaterial({ data, setData, vendors }) {
  const [modal, setModal] = useState(false);
  const [error, setError] = useState("");
  const GAUGES = ["18g", "20g", "22g", "24g", "26g"];
  const COIL_GRADES = ["DD", "SDM", "EDD", "HDD", "CQ"];
  const PATTA_GRADES = ["J/4", "J/5", "J/6", "J/7", "J/8"];
  const rmVendors = vendors.filter((v) => v.type === "rm");
  const cutVendors = vendors.filter((v) => v.type === "cutting");

  const [form, setForm] = useState({
    matType: "Coil",
    supplier: "",
    grade: "DD",
    gauge: "18g",
    purchaseKg: "",
    ratePerKg: "",
    date: today,
    cuttingVendor: "",
    cuttingFactor: "",
  });
  const F = (k) => ({
    value: form[k],
    onChange: (e) => {
      setError("");
      setForm((f) => ({ ...f, [k]: e.target.value }));
    },
  });

  const preview =
    form.ratePerKg && form.cuttingFactor
      ? +form.ratePerKg * +form.cuttingFactor
      : null;

  const save = () => {
    if (!form.supplier) return setError("Select a supplier");
    if (!form.purchaseKg) return setError("Enter weight purchased");
    if (!form.ratePerKg) return setError("Enter purchase rate");
    if (!form.cuttingVendor) return setError("Select cutting vendor");
    if (!form.cuttingFactor)
      return setError("Enter cutting factor (e.g. 1.17)");
    const rmId = `RM-${String(data.rawMaterials.length + 1).padStart(3, "0")}`;
    const cjId = `CJ-${String(data.cuttingJobs.length + 1).padStart(3, "0")}`;
    setData((d) => ({
      ...d,
      rawMaterials: [
        {
          id: rmId,
          date: form.date,
          supplier: form.supplier,
          matType: form.matType,
          grade: form.grade,
          gauge: form.gauge,
          purchaseKg: +form.purchaseKg,
          ratePerKg: +form.ratePerKg,
          vendor: form.cuttingVendor,
          status: "Issued",
        },
        ...d.rawMaterials,
      ],
      cuttingJobs: [
        {
          id: cjId,
          dispatchDate: form.date,
          vendor: form.cuttingVendor,
          rmId,
          sentKg: +form.purchaseKg,
          cuttingFactor: +form.cuttingFactor,
          status: "In Progress",
        },
        ...d.cuttingJobs,
      ],
    }));
    setModal(false);
    setForm((f) => ({
      ...f,
      supplier: "",
      purchaseKg: "",
      ratePerKg: "",
      cuttingFactor: "",
      date: today,
    }));
  };

  return (
    <div>
      <Section
        title="Raw Material Lots"
        action={<Btn onClick={() => setModal(true)}>+ New Purchase</Btn>}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3,1fr)",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <StatCard
            label="Total Purchased"
            value={fmtKg(
              data.rawMaterials.reduce((s, r) => s + r.purchaseKg, 0),
            )}
            color={C.blue}
          />
          <StatCard
            label="Total Lots"
            value={data.rawMaterials.length}
            color={C.accent}
          />
          <StatCard
            label="Avg Rate"
            value={
              fmtR(
                data.rawMaterials.reduce((s, r) => s + r.ratePerKg, 0) /
                  data.rawMaterials.length,
              ) + "/kg"
            }
            color={C.muted}
          />
        </div>

        <Box>
          {data.rawMaterials.length === 0 ? (
            <EmptyState icon="📦" text="No raw material lots yet" />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Lot</th>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th>Type</th>
                  <th>Grade</th>
                  <th>Gauge</th>
                  <th>Quantity</th>
                  <th>RM Rate</th>
                  <th>Cutting Job</th>
                  <th>Circle Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.rawMaterials.map((rm, i) => {
                  const cj = data.cuttingJobs.find((j) => j.rmId === rm.id);
                  const circleRate = cj
                    ? rm.ratePerKg * cj.cuttingFactor
                    : null;
                  return (
                    <tr key={i}>
                      <td>
                        <span style={{ fontWeight: 700, color: C.accent }}>
                          {rm.id}
                        </span>
                      </td>
                      <td style={{ color: C.muted }}>{rm.date}</td>
                      <td style={{ fontWeight: 500 }}>{rm.supplier}</td>
                      <td>
                        <Pill label={rm.matType} color="blue" />
                      </td>
                      <td>{rm.grade}</td>
                      <td style={{ color: C.muted }}>{rm.gauge}</td>
                      <td style={{ fontWeight: 600 }}>
                        {fmtKg(rm.purchaseKg)}
                      </td>
                      <td style={{ color: C.blue }}>{fmtR(rm.ratePerKg)}/kg</td>
                      <td>
                        {cj ? (
                          <span style={{ color: C.orange, fontWeight: 600 }}>
                            {cj.id}{" "}
                            <span style={{ color: C.muted, fontWeight: 400 }}>
                              ×{cj.cuttingFactor}
                            </span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <CostChip cost={circleRate} color={C.orange} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Box>
      </Section>

      {modal && (
        <Modal
          title="Record Purchase & Dispatch to Cutter"
          onClose={() => {
            setModal(false);
            setError("");
          }}
        >
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            <Field label="Material Type">
              <select
                value={form.matType}
                onChange={(e) => {
                  const t = e.target.value;
                  setForm((f) => ({
                    ...f,
                    matType: t,
                    grade: t === "Coil" ? "DD" : "J/5",
                  }));
                }}
              >
                <option>Coil</option>
                <option>Patta</option>
              </select>
            </Field>
            <Field label="Purchase Date">
              <input type="date" {...F("date")} />
            </Field>
            <Field label="Supplier">
              <select {...F("supplier")}>
                <option value="">— Select —</option>
                {rmVendors.map((v) => (
                  <option key={v.id} value={v.name}>
                    {v.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Grade">
              <select {...F("grade")}>
                {(form.matType === "Coil" ? COIL_GRADES : PATTA_GRADES).map(
                  (g) => (
                    <option key={g}>{g}</option>
                  ),
                )}
              </select>
            </Field>
            <Field label="Gauge">
              <select {...F("gauge")}>
                {GAUGES.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </Field>
            <Field label="Weight Purchased (kg)">
              <input type="number" {...F("purchaseKg")} />
            </Field>
            <Field label="Purchase Rate (₹/kg)" hint="This is Stage 1 cost/kg">
              <input
                type="number"
                {...F("ratePerKg")}
                style={{ borderColor: C.blue + "88" }}
              />
            </Field>
            <Field label="Cutting Vendor">
              <select {...F("cuttingVendor")}>
                <option value="">— Select —</option>
                {cutVendors.map((v) => (
                  <option key={v.id} value={v.name}>
                    {v.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Cutting Factor"
              hint="e.g. 1.17 means circles cost 17% more"
            >
              <input
                type="number"
                step="0.01"
                min="1"
                {...F("cuttingFactor")}
                style={{ borderColor: C.orange + "88" }}
              />
            </Field>
            {preview && (
              <Field label="Circle Rate Preview">
                <div
                  style={{
                    padding: "9px 12px",
                    background: C.surface,
                    border: `1px solid ${C.accent}44`,
                    borderRadius: 6,
                    fontWeight: 700,
                    color: C.accent,
                  }}
                >
                  {fmtR(+form.ratePerKg)} × {form.cuttingFactor} ={" "}
                  {fmtR(preview)}/kg
                </div>
              </Field>
            )}
          </div>
          {error && (
            <div
              style={{
                marginTop: 10,
                padding: "8px 12px",
                background: C.redBg,
                border: `1px solid ${C.red}44`,
                borderRadius: 6,
                color: C.red,
                fontSize: 13,
              }}
            >
              ⚠ {error}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <Btn onClick={save} full>
              Save & Dispatch to Cutter
            </Btn>
            <Btn
              variant="ghost"
              onClick={() => {
                setModal(false);
                setError("");
              }}
            >
              Cancel
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── CUTTING ──────────────────────────────────────────────────────────────────
function Cutting({ data, setData }) {
  const [view, setView] = useState("jobs"); // "jobs" | "receipts"
  const [selectedJob, setSelectedJob] = useState(null);
  const [receiptModal, setReceiptModal] = useState(false);
  const [recForm, setRecForm] = useState({
    jobId: "",
    size: '14"',
    receivedKg: "",
    date: today,
  });
  const SIZES = [
    '10"',
    '11"',
    '12"',
    '13"',
    '14"',
    '15"',
    '16"',
    '17"',
    '18"',
    '20"',
    '22"',
    '24"',
  ];

  const saveReceipt = () => {
    if (!recForm.jobId || !recForm.receivedKg) return;
    const job = data.cuttingJobs.find((j) => j.id === recForm.jobId);
    if (!job) return;
    const got = data.circleReceipts
      .filter((r) => r.jobId === recForm.jobId)
      .reduce((s, r) => s + r.receivedKg, 0);
    if (got + +recForm.receivedKg > job.sentKg) {
      alert(`Cannot exceed sent weight (${job.sentKg}kg)`);
      return;
    }
    const id = `CR-${String(data.circleReceipts.length + 1).padStart(3, "0")}`;
    setData((d) => ({
      ...d,
      circleReceipts: [
        ...d.circleReceipts,
        { ...recForm, id, receivedKg: +recForm.receivedKg },
      ],
    }));
    setRecForm((f) => ({ ...f, receivedKg: "", date: today }));
    setReceiptModal(false);
  };

  const markComplete = (jobId) =>
    setData((d) => ({
      ...d,
      cuttingJobs: d.cuttingJobs.map((j) =>
        j.id === jobId ? { ...j, status: "Completed" } : j,
      ),
    }));

  // circle stock by size (completed jobs only)
  const stockBySizeMap = useMemo(() => {
    const map = {};
    data.circleReceipts.forEach((r) => {
      const job = data.cuttingJobs.find((j) => j.id === r.jobId);
      if (job?.status === "Completed")
        map[r.size] = (map[r.size] || 0) + r.receivedKg;
    });
    return map;
  }, [data]);

  return (
    <div>
      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 20,
          background: C.surface,
          borderRadius: 8,
          padding: 4,
          border: `1px solid ${C.border}`,
          width: "fit-content",
        }}
      >
        {["jobs", "receipts", "stock"].map((t) => (
          <button
            key={t}
            onClick={() => setView(t)}
            style={{
              padding: "6px 18px",
              borderRadius: 6,
              border: "none",
              background: view === t ? C.card : "transparent",
              color: view === t ? C.text : C.muted,
              fontWeight: 600,
              fontSize: 13,
              boxShadow: view === t ? `0 1px 3px #00000044` : "none",
            }}
          >
            {t === "jobs"
              ? "Dispatch Jobs"
              : t === "receipts"
                ? "Circle Receipts"
                : "Stock by Size"}
          </button>
        ))}
      </div>

      {/* JOBS */}
      {view === "jobs" && (
        <Section
          title="Cutting Dispatch Jobs"
          action={
            <Pill label="Created from Raw Material entry" color="muted" />
          }
        >
          <div
            style={{
              background: C.orangeBg,
              border: `1px solid ${C.orange}33`,
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 14,
              fontSize: 13,
              color: C.text,
            }}
          >
            💡 Cutting jobs are auto-created when you record a Raw Material
            purchase. Use <strong>"+ Add Circle Receipt"</strong> to log
            incoming circle batches.
          </div>
          <Box>
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Date</th>
                  <th>RM Lot</th>
                  <th>Vendor</th>
                  <th>Sent</th>
                  <th>Received</th>
                  <th>Pending</th>
                  <th>Scrap</th>
                  <th>Factor</th>
                  <th>Circle Rate</th>
                  <th>Settlement</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.cuttingJobs.map((job, i) => {
                  const js = jobStats(data, job.id);
                  const pending = job.sentKg - (js?.totalCirclesKg || 0);
                  return (
                    <tr key={i}>
                      <td>
                        <span style={{ fontWeight: 700, color: C.orange }}>
                          {job.id}
                        </span>
                      </td>
                      <td style={{ color: C.muted }}>{job.dispatchDate}</td>
                      <td style={{ color: C.blue, fontWeight: 600 }}>
                        {job.rmId}
                      </td>
                      <td>{job.vendor}</td>
                      <td style={{ fontWeight: 600 }}>{fmtKg(job.sentKg)}</td>
                      <td style={{ color: C.green }}>
                        {js?.totalCirclesKg > 0
                          ? fmtKg(js.totalCirclesKg)
                          : "—"}
                      </td>
                      <td style={{ color: pending > 0 ? C.orange : C.muted }}>
                        {pending > 0 ? fmtKg(pending) : "—"}
                      </td>
                      <td style={{ color: C.muted }}>
                        {job.status === "Completed" ? fmtKg(js?.scrapKg) : "—"}
                      </td>
                      <td>
                        <Pill label={"×" + job.cuttingFactor} color="orange" />
                      </td>
                      <td>
                        <CostChip cost={js?.costPerKg} color={C.orange} />
                      </td>
                      <td>
                        {js?.settlement != null ? (
                          <span
                            style={{
                              fontWeight: 700,
                              color: js.settlement >= 0 ? C.green : C.red,
                            }}
                          >
                            {js.settlement >= 0
                              ? `+${fmtR(js.settlement)} refund`
                              : `${fmtR(Math.abs(js.settlement))} pay`}
                          </span>
                        ) : (
                          <span style={{ color: C.muted, fontSize: 12 }}>
                            on completion
                          </span>
                        )}
                      </td>
                      <td>
                        <Pill
                          label={job.status}
                          color={
                            job.status === "Completed" ? "green" : "orange"
                          }
                          dot
                        />
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 5 }}>
                          <Btn
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setRecForm((f) => ({ ...f, jobId: job.id }));
                              setReceiptModal(true);
                              setView("receipts");
                            }}
                          >
                            + Receipt
                          </Btn>
                          {job.status === "In Progress" && (
                            <Btn
                              size="sm"
                              variant="ghost"
                              onClick={() => markComplete(job.id)}
                            >
                              ✓ Complete
                            </Btn>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Box>
        </Section>
      )}

      {/* RECEIPTS */}
      {view === "receipts" && (
        <Section
          title="Circle Receipts"
          action={
            <Btn onClick={() => setReceiptModal(true)}>+ Add Receipt</Btn>
          }
        >
          {data.cuttingJobs.map((job) => {
            const receipts = data.circleReceipts.filter(
              (r) => r.jobId === job.id,
            );
            if (!receipts.length) return null;
            const js = jobStats(data, job.id);
            const pending = job.sentKg - (js?.totalCirclesKg || 0);
            return (
              <Box key={job.id} style={{ marginBottom: 14 }}>
                <div
                  style={{
                    padding: "14px 16px",
                    borderBottom: `1px solid ${C.border}`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 700, color: C.orange }}>
                      {job.id}
                    </span>
                    <span style={{ color: C.muted, marginLeft: 10 }}>
                      {job.vendor}
                    </span>
                    <span style={{ color: C.muted, marginLeft: 10 }}>
                      Sent: {fmtKg(job.sentKg)}
                    </span>
                  </div>
                  <div
                    style={{ display: "flex", gap: 8, alignItems: "center" }}
                  >
                    {js?.costPerKg && (
                      <CostChip
                        cost={js.costPerKg}
                        color={C.orange}
                        label="Circle cost"
                      />
                    )}
                    <Pill
                      label={job.status}
                      color={job.status === "Completed" ? "green" : "orange"}
                      dot
                    />
                    {job.status === "In Progress" && (
                      <Btn
                        size="sm"
                        variant="ghost"
                        onClick={() => markComplete(job.id)}
                      >
                        ✓ Mark Complete
                      </Btn>
                    )}
                  </div>
                </div>
                {/* Weight bar */}
                <div
                  style={{
                    padding: "10px 16px",
                    borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      height: 14,
                      background: C.surface,
                      borderRadius: 4,
                      overflow: "hidden",
                      gap: 1,
                    }}
                  >
                    {receipts.map((r, i) => {
                      const cols = [
                        C.green,
                        C.teal,
                        C.blue,
                        C.purple,
                        C.orange,
                      ];
                      return (
                        <div
                          key={i}
                          title={`${r.size}: ${r.receivedKg}kg`}
                          style={{
                            flex: r.receivedKg,
                            background: cols[i % cols.length],
                            opacity: 0.8,
                          }}
                        />
                      );
                    })}
                    {pending > 0 && (
                      <div
                        title={`Pending: ${pending}kg`}
                        style={{ flex: pending, background: C.border }}
                      />
                    )}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      marginTop: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    {receipts.map((r, i) => {
                      const cols = [
                        C.green,
                        C.teal,
                        C.blue,
                        C.purple,
                        C.orange,
                      ];
                      return (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <div
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 2,
                              background: cols[i % cols.length],
                            }}
                          />
                          <span style={{ fontSize: 11, color: C.muted }}>
                            {r.size}: {fmtKg(r.receivedKg)} · {r.date}
                          </span>
                        </div>
                      );
                    })}
                    {pending > 0 && (
                      <span style={{ fontSize: 11, color: C.orange }}>
                        Pending: {fmtKg(pending)}
                      </span>
                    )}
                  </div>
                </div>
                {/* Cost box if complete */}
                {js?.costPerKg != null && (
                  <div style={{ padding: "10px 16px", background: C.orangeBg }}>
                    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                      {[
                        { l: "RM Paid", v: fmtR(js.rmTotalCost) },
                        {
                          l: `Circles (${fmtKg(js.totalCirclesKg)} × ${fmtR(js.rateWithCutting)})`,
                          v: fmtR(js.circlesValue),
                        },
                        {
                          l: "Settlement",
                          v:
                            js.settlement >= 0
                              ? `+${fmtR(js.settlement)} (vendor refunds you)`
                              : fmtR(js.settlement) + " (you pay extra)",
                          bold: true,
                          color: js.settlement >= 0 ? C.green : C.red,
                        },
                        {
                          l: "Circle Cost/kg",
                          v: fmtR(js.costPerKg) + "/kg",
                          bold: true,
                          color: C.orange,
                        },
                      ].map((item, i) => (
                        <div key={i}>
                          <div style={{ fontSize: 11, color: C.muted }}>
                            {item.l}
                          </div>
                          <div
                            style={{
                              fontWeight: item.bold ? 700 : 500,
                              color: item.color || C.text,
                              fontSize: item.bold ? 15 : 13,
                            }}
                          >
                            {item.v}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Box>
            );
          })}
        </Section>
      )}

      {/* STOCK */}
      {view === "stock" && (
        <Section title="Circle Stock by Size (Completed Jobs)">
          {Object.keys(stockBySizeMap).length === 0 ? (
            <EmptyState text="No completed jobs yet" />
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(6,1fr)",
                gap: 10,
              }}
            >
              {Object.entries(stockBySizeMap)
                .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                .map(([size, kg], i) => (
                  <Box
                    key={i}
                    style={{ padding: "16px 12px", textAlign: "center" }}
                  >
                    <div
                      style={{ fontWeight: 700, fontSize: 22, color: C.accent }}
                    >
                      {size}
                    </div>
                    <div
                      style={{ fontWeight: 600, fontSize: 18, marginTop: 4 }}
                    >
                      {fmtKg(kg)}
                    </div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                      in stock
                    </div>
                  </Box>
                ))}
            </div>
          )}
        </Section>
      )}

      {/* RECEIPT MODAL */}
      {receiptModal && (
        <Modal
          title="Record Circle Batch Received"
          onClose={() => setReceiptModal(false)}
        >
          <Field label="Cutting Job">
            <select
              value={recForm.jobId}
              onChange={(e) =>
                setRecForm((f) => ({ ...f, jobId: e.target.value }))
              }
            >
              <option value="">— Select Job —</option>
              {data.cuttingJobs.map((j) => {
                const got = data.circleReceipts
                  .filter((r) => r.jobId === j.id)
                  .reduce((s, r) => s + r.receivedKg, 0);
                return (
                  <option key={j.id} value={j.id}>
                    {j.id} · {j.vendor} · {j.sentKg}kg sent · {got}kg received
                  </option>
                );
              })}
            </select>
          </Field>
          {recForm.jobId &&
            (() => {
              const job = data.cuttingJobs.find((j) => j.id === recForm.jobId);
              const got = data.circleReceipts
                .filter((r) => r.jobId === recForm.jobId)
                .reduce((s, r) => s + r.receivedKg, 0);
              const rem = job ? job.sentKg - got : 0;
              return (
                <div
                  style={{
                    background: C.surface,
                    borderRadius: 6,
                    padding: "10px 12px",
                    marginBottom: 14,
                    display: "flex",
                    gap: 20,
                  }}
                >
                  <KV
                    label="Already received"
                    value={fmtKg(got)}
                    color={C.green}
                  />
                  <KV
                    label="Still pending"
                    value={fmtKg(rem)}
                    color={rem > 0 ? C.orange : C.muted}
                  />
                </div>
              );
            })()}
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            <Field label="Circle Size">
              <select
                value={recForm.size}
                onChange={(e) =>
                  setRecForm((f) => ({ ...f, size: e.target.value }))
                }
              >
                {SIZES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Weight Received (kg)">
              <input
                type="number"
                value={recForm.receivedKg}
                onChange={(e) =>
                  setRecForm((f) => ({ ...f, receivedKg: e.target.value }))
                }
              />
            </Field>
            <Field label="Date Received" span={2}>
              <input
                type="date"
                value={recForm.date}
                onChange={(e) =>
                  setRecForm((f) => ({ ...f, date: e.target.value }))
                }
              />
            </Field>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <Btn onClick={saveReceipt} full>
              Save Receipt
            </Btn>
            <Btn variant="ghost" onClick={() => setReceiptModal(false)}>
              Cancel
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── PRESSING ─────────────────────────────────────────────────────────────────
function Pressing({ data, setData }) {
  const [dispatchModal, setDispatchModal] = useState(false);
  const [receiveIdx, setReceiveIdx] = useState(null);
  const [receiveForm, setReceiveForm] = useState({
    receivedKg: "",
    receivedDate: today,
  });
  const VENDORS = [
    "Self",
    "Kapoor Press",
    "Srinath Press Works",
    "Dilip Pressing",
    "Arjun Press",
  ];
  const UTENSILS = [
    "Plate",
    "Bowl",
    "Thali",
    "Pot",
    "Kadai",
    "Tope",
    "Patila",
    "Degchi",
    "Paraat",
    "Tray",
  ];

  const [form, setForm] = useState({
    vendor: "Self",
    ccJobId: "",
    circleSize: "",
    sentKg: "",
    pressRate: "",
    utensil: "Plate",
    dispatchDate: today,
  });
  const F = (k) => ({
    value: form[k],
    onChange: (e) => setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  const availableSizes = (ccJobId) => {
    if (!ccJobId) return [];
    const receipts = data.circleReceipts.filter((r) => r.jobId === ccJobId);
    const used = {};
    data.pressing
      .filter((p) => p.ccJobId === ccJobId)
      .forEach((p) => {
        used[p.circleSize] = (used[p.circleSize] || 0) + p.sentKg;
      });
    const cost = getCircleCostPerKg(data, ccJobId);
    return receipts
      .map((r) => ({
        size: r.size,
        totalKg: r.receivedKg,
        availKg: r.receivedKg - (used[r.size] || 0),
        cost,
      }))
      .filter((s) => s.availKg > 0);
  };
  const sizes = availableSizes(form.ccJobId);
  const selSize = sizes.find((s) => s.size === form.circleSize);

  const computeCost = (pr) => {
    if (pr.status !== "Done" || !pr.receivedKg) return null;
    const cc = getCircleCostPerKg(data, pr.ccJobId);
    if (cc == null) return null;
    const lossKg = Math.max(0, pr.sentKg - pr.receivedKg);
    const addlCost = pr.receivedKg * pr.pressRate + lossKg * cc;
    const addlPerKg = addlCost / pr.receivedKg;
    return {
      cost: cc + addlPerKg,
      cc,
      lossKg,
      laborCost: pr.receivedKg * pr.pressRate,
      scrapLoss: lossKg * cc,
      addlCost,
      addlPerKg,
    };
  };

  const dispatch = () => {
    if (!form.ccJobId || !form.circleSize || !form.sentKg || !form.pressRate)
      return;
    const id = `PR-${String(data.pressing.length + 209).padStart(3, "0")}`;
    setData((d) => ({
      ...d,
      pressing: [
        {
          ...form,
          id,
          sentKg: +form.sentKg,
          receivedKg: 0,
          pressRate: +form.pressRate,
          receivedDate: "",
          status: "Dispatched",
        },
        ...d.pressing,
      ],
    }));
    setDispatchModal(false);
    setForm((f) => ({
      ...f,
      circleSize: "",
      sentKg: "",
      pressRate: "",
      dispatchDate: today,
    }));
  };

  const recordReceived = (idx) => {
    const kg = +receiveForm.receivedKg;
    if (!kg || !receiveForm.receivedDate) return;
    setData((d) => {
      const arr = [...d.pressing];
      arr[idx] = {
        ...arr[idx],
        receivedKg: kg,
        receivedDate: receiveForm.receivedDate,
        status: "Done",
      };
      return { ...d, pressing: arr };
    });
    setReceiveIdx(null);
    setReceiveForm({ receivedKg: "", receivedDate: today });
  };

  const dispatched = data.pressing.filter((p) => p.status !== "Done");
  const done = data.pressing.filter((p) => p.status === "Done");

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 10,
          marginBottom: 20,
        }}
      >
        <StatCard
          label="Total Sent"
          value={fmtKg(data.pressing.reduce((s, p) => s + p.sentKg, 0))}
          icon="🔨"
        />
        <StatCard
          label="Received Back"
          value={fmtKg(done.reduce((s, p) => s + (p.receivedKg || 0), 0))}
          color={C.green}
          icon="✅"
        />
        <StatCard
          label="Awaiting Return"
          value={dispatched.length + " batches"}
          color={dispatched.length > 0 ? C.orange : C.muted}
          icon="⏳"
        />
        <StatCard
          label="In-house vs Outsourced"
          value={`${data.pressing.filter((p) => p.vendor === "Self").length} / ${data.pressing.filter((p) => p.vendor !== "Self").length}`}
          color={C.teal}
        />
      </div>

      {/* Pending */}
      {dispatched.length > 0 && (
        <Section
          title="⏳ Awaiting Return"
          action={
            <Btn onClick={() => setDispatchModal(true)}>+ Dispatch More</Btn>
          }
        >
          {dispatched.map((pr, i) => {
            const idx = data.pressing.indexOf(pr);
            return (
              <Box key={i} style={{ marginBottom: 10 }}>
                <div
                  style={{
                    padding: "14px 16px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{ display: "flex", gap: 20, alignItems: "center" }}
                  >
                    <span style={{ fontWeight: 700, color: C.teal }}>
                      {pr.id}
                    </span>
                    <KV label="Utensil" value={pr.utensil} />
                    <KV label="Size" value={pr.circleSize || "—"} />
                    <KV label="Vendor" value={pr.vendor} />
                    <KV label="Dispatched" value={pr.dispatchDate} />
                    <KV label="Sent" value={fmtKg(pr.sentKg)} />
                  </div>
                  <div>
                    {receiveIdx === idx ? (
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <input
                          type="number"
                          style={{ width: 90 }}
                          placeholder="kg"
                          value={receiveForm.receivedKg}
                          onChange={(e) =>
                            setReceiveForm((f) => ({
                              ...f,
                              receivedKg: e.target.value,
                            }))
                          }
                        />
                        <input
                          type="date"
                          style={{ width: 140 }}
                          value={receiveForm.receivedDate}
                          onChange={(e) =>
                            setReceiveForm((f) => ({
                              ...f,
                              receivedDate: e.target.value,
                            }))
                          }
                        />
                        <Btn
                          size="sm"
                          variant="success"
                          onClick={() => recordReceived(idx)}
                        >
                          ✓ Save
                        </Btn>
                        <Btn
                          size="sm"
                          variant="ghost"
                          onClick={() => setReceiveIdx(null)}
                        >
                          Cancel
                        </Btn>
                      </div>
                    ) : (
                      <Btn
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setReceiveIdx(idx);
                          setReceiveForm({
                            receivedKg: String(pr.sentKg),
                            receivedDate: today,
                          });
                        }}
                      >
                        Record Received
                      </Btn>
                    )}
                  </div>
                </div>
              </Box>
            );
          })}
        </Section>
      )}

      {/* Completed */}
      <Section
        title="✅ Completed Batches"
        action={
          dispatched.length === 0 && (
            <Btn onClick={() => setDispatchModal(true)}>+ Dispatch</Btn>
          )
        }
      >
        {done.length === 0 ? (
          <EmptyState text="No completed pressing batches yet" />
        ) : (
          <Box>
            <table>
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Dispatched</th>
                  <th>Received</th>
                  <th>Job</th>
                  <th>Size</th>
                  <th>Vendor</th>
                  <th>Utensil</th>
                  <th>Sent</th>
                  <th>Received</th>
                  <th>Loss</th>
                  <th>Labor</th>
                  <th>Scrap Loss</th>
                  <th>Addl/kg</th>
                  <th style={{ color: C.teal }}>Cost/kg</th>
                </tr>
              </thead>
              <tbody>
                {done.map((pr, i) => {
                  const c = computeCost(pr);
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 700, color: C.teal }}>
                        {pr.id}
                      </td>
                      <td style={{ color: C.muted }}>{pr.dispatchDate}</td>
                      <td style={{ color: C.green }}>
                        {pr.receivedDate || "—"}
                      </td>
                      <td>
                        <Pill label={pr.ccJobId} color="orange" />
                      </td>
                      <td>
                        <Pill label={pr.circleSize || "—"} color="blue" />
                      </td>
                      <td>
                        <Pill
                          label={pr.vendor}
                          color={pr.vendor === "Self" ? "teal" : "purple"}
                        />
                      </td>
                      <td style={{ fontWeight: 500 }}>{pr.utensil}</td>
                      <td>{fmtKg(pr.sentKg)}</td>
                      <td style={{ color: C.green }}>{fmtKg(pr.receivedKg)}</td>
                      <td style={{ color: C.red }}>
                        {c ? fmtKg(c.lossKg) : "—"}
                      </td>
                      <td style={{ color: C.muted, fontSize: 12 }}>
                        {c ? fmtR(c.laborCost) : "—"}
                      </td>
                      <td style={{ color: C.red, fontSize: 12 }}>
                        {c ? fmtR(c.scrapLoss) : "—"}
                      </td>
                      <td style={{ color: C.orange, fontSize: 12 }}>
                        {c ? `+${fmtR(c.addlPerKg)}/kg` : "—"}
                      </td>
                      <td>
                        <CostChip cost={c?.cost} color={C.teal} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Box>
        )}
      </Section>

      {/* Dispatch Modal */}
      {dispatchModal && (
        <Modal
          title="Dispatch for Pressing"
          onClose={() => setDispatchModal(false)}
        >
          <Field label="Cutting Job">
            <select
              value={form.ccJobId}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  ccJobId: e.target.value,
                  circleSize: "",
                }))
              }
            >
              <option value="">— Select Job —</option>
              {data.cuttingJobs
                .filter((j) => j.status === "Completed")
                .map((j) => {
                  const cost = getCircleCostPerKg(data, j.id);
                  return (
                    <option key={j.id} value={j.id}>
                      {j.id} · {j.vendor}
                      {cost != null ? ` · ${fmtR(cost)}/kg` : ""}
                    </option>
                  );
                })}
            </select>
          </Field>
          <Field label="Circle Size (available stock)">
            {sizes.length > 0 ? (
              <select
                value={form.circleSize}
                onChange={(e) =>
                  setForm((f) => ({ ...f, circleSize: e.target.value }))
                }
              >
                <option value="">— Select Size —</option>
                {sizes.map((s) => (
                  <option key={s.size} value={s.size}>
                    {s.size} — {fmtKg(s.availKg)} avail
                    {s.cost != null ? ` @ ${fmtR(s.cost)}/kg` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <div
                style={{
                  padding: "8px 12px",
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  color: C.muted,
                  fontSize: 13,
                }}
              >
                {form.ccJobId ? "No circles available" : "Select a job first"}
              </div>
            )}
          </Field>
          {selSize && (
            <div
              style={{
                display: "flex",
                gap: 16,
                background: C.surface,
                borderRadius: 8,
                padding: "10px 14px",
                marginBottom: 14,
              }}
            >
              <KV
                label="Available"
                value={fmtKg(selSize.availKg)}
                color={C.green}
              />
              <KV
                label="Cost/kg"
                value={fmtR(selSize.cost) + "/kg"}
                color={C.orange}
              />
            </div>
          )}
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            <Field label="Utensil">
              <select
                value={form.utensil}
                onChange={(e) =>
                  setForm((f) => ({ ...f, utensil: e.target.value }))
                }
              >
                {UTENSILS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </Field>
            <Field label="Vendor">
              <select
                value={form.vendor}
                onChange={(e) =>
                  setForm((f) => ({ ...f, vendor: e.target.value }))
                }
              >
                {VENDORS.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Sent for Pressing (kg)">
              <input
                type="number"
                value={form.sentKg}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sentKg: e.target.value }))
                }
              />
            </Field>
            <Field label="Press Labour Rate (₹/kg)">
              <input
                type="number"
                value={form.pressRate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, pressRate: e.target.value }))
                }
                style={{ borderColor: C.teal + "88" }}
              />
            </Field>
            <Field label="Dispatch Date" span={2}>
              <input
                type="date"
                value={form.dispatchDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, dispatchDate: e.target.value }))
                }
              />
            </Field>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <Btn
              onClick={dispatch}
              disabled={!form.circleSize || !form.sentKg || !form.pressRate}
              full
            >
              Dispatch
            </Btn>
            <Btn variant="ghost" onClick={() => setDispatchModal(false)}>
              Cancel
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── POLISHING ────────────────────────────────────────────────────────────────
function Polishing({ data, setData, vendors }) {
  const [dispatchModal, setDispatchModal] = useState(false);
  const [returnIdx, setReturnIdx] = useState(null);
  const [returnForm, setReturnForm] = useState({
    returnedKg: "",
    receivedDate: today,
  });
  const VENDORS = vendors
    .filter((v) => v.type === "polishing")
    .map((v) => v.name);

  const [form, setForm] = useState({
    vendor: "",
    prId: "",
    sentKg: "",
    polishRate: "",
    dispatchDate: today,
  });

  const computeCost = (pl) => {
    const pc = getPressedCostPerKg(data, pl.prId);
    if (pc == null || !pl.returnedKg || pl.returnedKg <= 0) return null;
    const lossKg = Math.max(0, pl.sentKg - pl.returnedKg);
    const addlCost = pl.returnedKg * pl.polishRate + lossKg * pc;
    const addlPerKg = addlCost / pl.returnedKg;
    return {
      cost: pc + addlPerKg,
      pc,
      lossKg,
      laborCost: pl.returnedKg * pl.polishRate,
      scrapLoss: lossKg * pc,
      addlCost,
      addlPerKg,
    };
  };

  const dispatch = () => {
    if (!form.vendor || !form.prId || !form.sentKg || !form.polishRate) return;
    const id = `PL-0${data.polishing.length + 32}`;
    setData((d) => ({
      ...d,
      polishing: [
        {
          ...form,
          id,
          sentKg: +form.sentKg,
          polishRate: +form.polishRate,
          returnedKg: 0,
          receivedDate: "",
          status: "Sent",
        },
        ...d.polishing,
      ],
    }));
    setDispatchModal(false);
    setForm((f) => ({
      ...f,
      prId: "",
      sentKg: "",
      polishRate: "",
      dispatchDate: today,
    }));
  };

  const recordReturn = (idx) => {
    const kg = +returnForm.returnedKg;
    if (!kg || !returnForm.receivedDate) return;
    setData((d) => {
      const arr = [...d.polishing];
      arr[idx] = {
        ...arr[idx],
        returnedKg: kg,
        receivedDate: returnForm.receivedDate,
        status: kg >= arr[idx].sentKg ? "Done" : "Partial",
      };
      return { ...d, polishing: arr };
    });
    setReturnIdx(null);
    setReturnForm({ returnedKg: "", receivedDate: today });
  };

  const pending = data.polishing.filter((p) => p.status !== "Done");
  const done = data.polishing.filter((p) => p.status === "Done");

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 10,
          marginBottom: 20,
        }}
      >
        <StatCard
          label="Sent Out"
          value={fmtKg(data.polishing.reduce((s, p) => s + p.sentKg, 0))}
          color={C.purple}
          icon="✨"
        />
        <StatCard
          label="Returned"
          value={fmtKg(
            data.polishing.reduce((s, p) => s + (p.returnedKg || 0), 0),
          )}
          color={C.green}
          icon="✅"
        />
        <StatCard
          label="Still Out"
          value={fmtKg(
            data.polishing.reduce(
              (s, p) => s + Math.max(0, p.sentKg - (p.returnedKg || 0)),
              0,
            ),
          )}
          color={pending.length > 0 ? C.orange : C.muted}
          icon="⏳"
        />
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <Section
          title="⏳ Awaiting Return"
          action={<Btn onClick={() => setDispatchModal(true)}>+ Send More</Btn>}
        >
          {pending.map((pl, i) => {
            const idx = data.polishing.indexOf(pl);
            const pendingKg = pl.sentKg - (pl.returnedKg || 0);
            return (
              <Box key={i} style={{ marginBottom: 10 }}>
                <div
                  style={{
                    padding: "14px 16px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{ display: "flex", gap: 20, alignItems: "center" }}
                  >
                    <span style={{ fontWeight: 700, color: C.purple }}>
                      {pl.id}
                    </span>
                    <KV label="Vendor" value={pl.vendor} />
                    <KV label="Batch" value={pl.prId} />
                    <KV label="Dispatched" value={pl.dispatchDate} />
                    <KV label="Sent" value={fmtKg(pl.sentKg)} />
                    {pl.returnedKg > 0 && (
                      <KV
                        label="Returned so far"
                        value={fmtKg(pl.returnedKg)}
                        color={C.green}
                      />
                    )}
                    <KV
                      label="Still pending"
                      value={fmtKg(pendingKg)}
                      color={C.orange}
                    />
                  </div>
                  <div>
                    {returnIdx === idx ? (
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <input
                          type="number"
                          style={{ width: 90 }}
                          placeholder="kg"
                          value={returnForm.returnedKg}
                          onChange={(e) =>
                            setReturnForm((f) => ({
                              ...f,
                              returnedKg: e.target.value,
                            }))
                          }
                        />
                        <input
                          type="date"
                          style={{ width: 140 }}
                          value={returnForm.receivedDate}
                          onChange={(e) =>
                            setReturnForm((f) => ({
                              ...f,
                              receivedDate: e.target.value,
                            }))
                          }
                        />
                        <Btn
                          size="sm"
                          variant="success"
                          onClick={() => recordReturn(idx)}
                        >
                          ✓ Save
                        </Btn>
                        <Btn
                          size="sm"
                          variant="ghost"
                          onClick={() => setReturnIdx(null)}
                        >
                          Cancel
                        </Btn>
                      </div>
                    ) : (
                      <Btn
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setReturnIdx(idx);
                          setReturnForm({
                            returnedKg: String(pl.sentKg),
                            receivedDate: today,
                          });
                        }}
                      >
                        Record Return
                      </Btn>
                    )}
                  </div>
                </div>
              </Box>
            );
          })}
        </Section>
      )}

      {/* Done */}
      <Section
        title="✅ Completed"
        action={
          pending.length === 0 && (
            <Btn onClick={() => setDispatchModal(true)}>
              + Send for Polishing
            </Btn>
          )
        }
      >
        {done.length === 0 ? (
          <EmptyState text="No completed polishing yet" />
        ) : (
          <Box>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Dispatched</th>
                  <th>Returned</th>
                  <th>Vendor</th>
                  <th>Batch</th>
                  <th>Sent</th>
                  <th>Returned</th>
                  <th>Loss</th>
                  <th>Labour</th>
                  <th>Scrap Loss</th>
                  <th>Addl/kg</th>
                  <th style={{ color: C.green }}>Final Cost/kg</th>
                </tr>
              </thead>
              <tbody>
                {done.map((pl, i) => {
                  const c = computeCost(pl);
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 700, color: C.purple }}>
                        {pl.id}
                      </td>
                      <td style={{ color: C.muted }}>{pl.dispatchDate}</td>
                      <td style={{ color: C.green }}>
                        {pl.receivedDate || "—"}
                      </td>
                      <td>{pl.vendor}</td>
                      <td>
                        <Pill label={pl.prId} color="teal" />
                      </td>
                      <td>{fmtKg(pl.sentKg)}</td>
                      <td style={{ color: C.green }}>{fmtKg(pl.returnedKg)}</td>
                      <td style={{ color: C.red }}>
                        {c ? fmtKg(c.lossKg) : "—"}
                      </td>
                      <td style={{ color: C.muted, fontSize: 12 }}>
                        {c ? fmtR(c.laborCost) : "—"}
                      </td>
                      <td style={{ color: C.red, fontSize: 12 }}>
                        {c ? fmtR(c.scrapLoss) : "—"}
                      </td>
                      <td style={{ color: C.orange, fontSize: 12 }}>
                        {c ? `+${fmtR(c.addlPerKg)}/kg` : "—"}
                      </td>
                      <td>
                        <CostChip cost={c?.cost} color={C.green} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Box>
        )}
      </Section>

      {dispatchModal && (
        <Modal
          title="Send for Polishing"
          onClose={() => setDispatchModal(false)}
        >
          <Field label="Polishing Vendor">
            <select
              value={form.vendor}
              onChange={(e) =>
                setForm((f) => ({ ...f, vendor: e.target.value }))
              }
            >
              <option value="">— Select Vendor —</option>
              {VENDORS.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Pressing Batch">
            <select
              value={form.prId}
              onChange={(e) => setForm((f) => ({ ...f, prId: e.target.value }))}
            >
              <option value="">— Select Batch —</option>
              {data.pressing
                .filter((p) => p.status === "Done" && p.receivedKg > 0)
                .map((p) => {
                  const c = getPressedCostPerKg(data, p.id);
                  return (
                    <option key={p.id} value={p.id}>
                      {p.id} · {p.utensil} · {p.receivedKg}kg
                      {c != null ? ` · ${fmtR(c)}/kg` : ""}
                    </option>
                  );
                })}
            </select>
          </Field>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            <Field label="Sent (kg)">
              <input
                type="number"
                value={form.sentKg}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sentKg: e.target.value }))
                }
              />
            </Field>
            <Field label="Polish Labour Rate (₹/kg)">
              <input
                type="number"
                value={form.polishRate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, polishRate: e.target.value }))
                }
                style={{ borderColor: C.purple + "88" }}
              />
            </Field>
            <Field label="Dispatch Date" span={2}>
              <input
                type="date"
                value={form.dispatchDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, dispatchDate: e.target.value }))
                }
              />
            </Field>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <Btn
              onClick={dispatch}
              disabled={
                !form.vendor || !form.prId || !form.sentKg || !form.polishRate
              }
              full
            >
              Send for Polishing
            </Btn>
            <Btn variant="ghost" onClick={() => setDispatchModal(false)}>
              Cancel
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── COST SUMMARY ─────────────────────────────────────────────────────────────
function Costs({ data }) {
  return (
    <div>
      <div
        style={{
          background: C.blueBg,
          border: `1px solid ${C.blue}33`,
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 20,
          fontSize: 13,
        }}
      >
        <strong style={{ color: C.blue }}>Cutting:</strong> rateWithCut = rmRate
        × factor · cost/kg = rateWithCut · settlement = rmPaid − circlesValue
        (cash only)
        <br />
        <strong style={{ color: C.teal }}>Pressing / Polishing:</strong>{" "}
        addlCost = (recKg × labour) + (lossKg × prevCost) · newCost/kg =
        prevCost + addlCost ÷ recKg
      </div>
      {data.rawMaterials.map((rm, ri) => {
        const cj = data.cuttingJobs.find(
          (j) => j.rmId === rm.id && j.status === "Completed",
        );
        const js = cj ? jobStats(data, cj.id) : null;
        const pr = cj
          ? data.pressing.find(
              (p) => p.ccJobId === cj.id && p.status === "Done",
            )
          : null;
        const prCost = pr ? getPressedCostPerKg(data, pr.id) : null;
        const pl = pr
          ? data.polishing.find((p) => p.prId === pr.id && p.returnedKg > 0)
          : null;
        const plCost = pl ? getPolishedCostPerKg(data, pl.id) : null;

        const stages = [
          {
            label: "Raw Material",
            cost: rm.ratePerKg,
            color: C.blue,
            note: rm.supplier,
          },
          {
            label: "After Cutting",
            cost: js?.costPerKg,
            color: C.orange,
            note: cj ? `${cj.vendor} · ×${cj.cuttingFactor}` : "—",
          },
          {
            label: "After Pressing",
            cost: prCost,
            color: C.teal,
            note: pr
              ? `${pr.vendor} · ${pct(pr.receivedKg, pr.sentKg)} yield`
              : "—",
          },
          {
            label: "After Polishing",
            cost: plCost,
            color: C.green,
            note: pl
              ? `${pl.vendor} · ${pct(pl.returnedKg, pl.sentKg)} yield`
              : "—",
          },
        ];

        return (
          <Box key={ri} style={{ marginBottom: 16 }}>
            <div
              style={{
                padding: "14px 18px",
                borderBottom: `1px solid ${C.border}`,
                display: "flex",
                gap: 16,
                alignItems: "center",
              }}
            >
              <span style={{ fontWeight: 700, color: C.accent }}>{rm.id}</span>
              <Pill label={rm.matType} color="blue" />
              <span style={{ color: C.muted }}>
                {rm.grade} {rm.gauge}
              </span>
              <span style={{ fontWeight: 600 }}>{fmtKg(rm.purchaseKg)}</span>
              <span style={{ color: C.muted }}>{rm.supplier}</span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4,1fr)",
                gap: 0,
              }}
            >
              {stages.map((s, i) => (
                <div
                  key={i}
                  style={{
                    padding: "16px 18px",
                    borderRight: i < 3 ? `1px solid ${C.border}` : 0,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: C.muted,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      marginBottom: 8,
                    }}
                  >
                    {s.label}
                  </div>
                  {s.cost != null ? (
                    <>
                      <div
                        style={{
                          fontSize: 22,
                          fontWeight: 700,
                          color: s.color,
                        }}
                      >
                        {fmtR(s.cost)}
                        <span
                          style={{
                            fontSize: 11,
                            color: C.muted,
                            fontWeight: 400,
                          }}
                        >
                          /kg
                        </span>
                      </div>
                      {i > 0 && stages[i - 1].cost != null && (
                        <div
                          style={{ fontSize: 11, color: C.red, marginTop: 2 }}
                        >
                          +{fmtR(s.cost - stages[i - 1].cost)}/kg added
                        </div>
                      )}
                      <div
                        style={{
                          marginTop: 8,
                          height: 3,
                          background: C.border,
                          borderRadius: 2,
                        }}
                      >
                        <div
                          style={{
                            width: `${(s.cost / Math.max(...stages.map((ss) => ss.cost || 0), 1)) * 100}%`,
                            height: "100%",
                            background: s.color,
                            borderRadius: 2,
                          }}
                        />
                      </div>
                    </>
                  ) : (
                    <div style={{ color: C.muted, fontSize: 13 }}>—</div>
                  )}
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                    {s.note}
                  </div>
                </div>
              ))}
            </div>
            {plCost && (
              <div
                style={{
                  padding: "12px 18px",
                  background: C.accentBg,
                  borderTop: `1px solid ${C.border}`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 13, color: C.muted }}>
                  Total cost added: raw → polished
                </span>
                <span
                  style={{ fontWeight: 700, fontSize: 18, color: C.accent }}
                >
                  +{fmtR(plCost - rm.ratePerKg)}/kg · Final: {fmtR(plCost)}/kg
                </span>
              </div>
            )}
          </Box>
        );
      })}
    </div>
  );
}

// ─── VENDORS ─────────────────────────────────────────────────────────────────
function Vendors({ vendors, setVendors }) {
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({
    type: "rm",
    name: "",
    contact: "",
    city: "",
    notes: "",
  });
  const F = (k) => ({
    value: form[k],
    onChange: (e) => setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  const TYPES = [
    { id: "rm", label: "RM Suppliers", color: C.blue },
    { id: "cutting", label: "Cutting", color: C.orange },
    { id: "pressing", label: "Pressing", color: C.teal },
    { id: "polishing", label: "Polishing", color: C.purple },
    { id: "other", label: "Other", color: C.muted },
  ];

  const filtered =
    filter === "all" ? vendors : vendors.filter((v) => v.type === filter);

  const openAdd = () => {
    setForm({
      type: filter === "all" ? "rm" : filter,
      name: "",
      contact: "",
      city: "",
      notes: "",
    });
    setEditId(null);
    setModal(true);
  };
  const openEdit = (v) => {
    setForm({
      type: v.type,
      name: v.name,
      contact: v.contact,
      city: v.city,
      notes: v.notes || "",
    });
    setEditId(v.id);
    setModal(true);
  };
  const save = () => {
    if (!form.name) return;
    if (editId) {
      setVendors((vs) =>
        vs.map((v) => (v.id === editId ? { ...v, ...form } : v)),
      );
    } else {
      setVendors((vs) => [
        ...vs,
        { ...form, id: `V-${String(vs.length + 1).padStart(3, "0")}` },
      ]);
    }
    setModal(false);
  };

  const typeInfo = (tid) =>
    TYPES.find((t) => t.id === tid) || { label: tid, color: C.muted };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[{ id: "all", label: "All", color: C.text }, ...TYPES].map((t) => (
            <button
              key={t.id}
              onClick={() => setFilter(t.id)}
              style={{
                padding: "6px 14px",
                borderRadius: 20,
                border: `1px solid ${filter === t.id ? t.color : C.border}`,
                background: filter === t.id ? t.color + "20" : "transparent",
                color: filter === t.id ? t.color : C.muted,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {t.label}{" "}
              <span style={{ opacity: 0.7 }}>
                (
                {t.id === "all"
                  ? vendors.length
                  : vendors.filter((v) => v.type === t.id).length}
                )
              </span>
            </button>
          ))}
        </div>
        <Btn onClick={openAdd}>+ Add Vendor</Btn>
      </div>

      <Box>
        {filtered.length === 0 ? (
          <EmptyState text="No vendors in this category" />
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Type</th>
                <th>Name</th>
                <th>Contact</th>
                <th>City</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v, i) => {
                const ti = typeInfo(v.type);
                return (
                  <tr key={i}>
                    <td style={{ color: C.muted, fontSize: 12 }}>{v.id}</td>
                    <td>
                      <Pill
                        label={ti.label}
                        color={
                          v.type === "rm"
                            ? "blue"
                            : v.type === "cutting"
                              ? "orange"
                              : v.type === "pressing"
                                ? "teal"
                                : v.type === "polishing"
                                  ? "purple"
                                  : "muted"
                        }
                      />
                    </td>
                    <td style={{ fontWeight: 600 }}>{v.name}</td>
                    <td style={{ color: C.blue }}>{v.contact || "—"}</td>
                    <td style={{ color: C.muted }}>{v.city || "—"}</td>
                    <td style={{ color: C.muted, fontSize: 12 }}>
                      {v.notes || "—"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Btn
                          size="sm"
                          variant="ghost"
                          onClick={() => openEdit(v)}
                        >
                          Edit
                        </Btn>
                        <Btn
                          size="sm"
                          variant="danger"
                          onClick={() =>
                            setVendors((vs) =>
                              vs.filter((vv) => vv.id !== v.id),
                            )
                          }
                        >
                          ✕
                        </Btn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Box>

      {modal && (
        <Modal
          title={editId ? "Edit Vendor" : "Add Vendor"}
          onClose={() => setModal(false)}
        >
          <Field label="Type">
            <select {...F("type")}>
              {TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Company Name">
            <input {...F("name")} />
          </Field>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            <Field label="Contact Number">
              <input {...F("contact")} />
            </Field>
            <Field label="City">
              <input {...F("city")} />
            </Field>
          </div>
          <Field label="Notes">
            <input {...F("notes")} />
          </Field>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <Btn onClick={save} full>
              {editId ? "Update" : "Add Vendor"}
            </Btn>
            <Btn variant="ghost" onClick={() => setModal(false)}>
              Cancel
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── SETTLEMENT LEDGER ────────────────────────────────────────────────────────
function Settlement({ data }) {
  const entries = data.cuttingJobs
    .filter((j) => j.status === "Completed")
    .map((j) => {
      const js = jobStats(data, j.id);
      if (!js) return null;
      return {
        date: j.dispatchDate,
        job: j.id,
        vendor: j.vendor,
        rmId: j.rmId,
        sentKg: j.sentKg,
        totalCirclesKg: js.totalCirclesKg,
        scrapKg: js.scrapKg,
        factor: j.cuttingFactor,
        rateWithCutting: js.rateWithCutting,
        rmTotalCost: js.rmTotalCost,
        circlesValue: js.circlesValue,
        settlement: js.settlement,
        costPerKg: js.costPerKg,
      };
    })
    .filter(Boolean);

  const netSettlement = entries.reduce((s, e) => s + (e.settlement || 0), 0);

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3,1fr)",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <StatCard
          label="Net Settlement"
          value={fmtR(netSettlement)}
          sub={
            netSettlement >= 0 ? "Cutting vendors owe you" : "You owe vendors"
          }
          color={netSettlement >= 0 ? C.green : C.red}
        />
        <StatCard
          label="Total Scrap (kg)"
          value={fmtKg(entries.reduce((s, e) => s + (e.scrapKg || 0), 0))}
          sub="Vendor's property"
          color={C.muted}
        />
        <StatCard
          label="Completed Jobs"
          value={entries.length}
          color={C.accent}
        />
      </div>
      <Box>
        {entries.length === 0 ? (
          <EmptyState text="No completed cutting jobs yet" />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Job</th>
                <th>Vendor</th>
                <th>Sent</th>
                <th>Circles</th>
                <th>Scrap</th>
                <th>Factor</th>
                <th>Circle Rate</th>
                <th>RM Paid</th>
                <th>Circles Value</th>
                <th>Settlement</th>
                <th>Cost/kg</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i}>
                  <td style={{ color: C.muted }}>{e.date}</td>
                  <td style={{ fontWeight: 700, color: C.orange }}>{e.job}</td>
                  <td>{e.vendor}</td>
                  <td>{fmtKg(e.sentKg)}</td>
                  <td style={{ color: C.green }}>{fmtKg(e.totalCirclesKg)}</td>
                  <td style={{ color: C.muted }}>{fmtKg(e.scrapKg)}</td>
                  <td>
                    <Pill label={"×" + e.factor} color="orange" />
                  </td>
                  <td style={{ color: C.orange }}>
                    {fmtR(e.rateWithCutting)}/kg
                  </td>
                  <td>{fmtR(e.rmTotalCost)}</td>
                  <td>{fmtR(e.circlesValue)}</td>
                  <td>
                    <span
                      style={{
                        fontWeight: 700,
                        color: e.settlement >= 0 ? C.green : C.red,
                      }}
                    >
                      {e.settlement >= 0
                        ? `+${fmtR(e.settlement)} refund`
                        : `${fmtR(Math.abs(e.settlement))} pay`}
                    </span>
                  </td>
                  <td>
                    <CostChip cost={e.costPerKg} color={C.orange} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Box>
    </div>
  );
}

// ─── NAV CONFIG ───────────────────────────────────────────────────────────────
const PAGES = [
  { id: "home", label: "Overview", icon: "⌂" },
  { id: "raw", label: "Raw Material", icon: "📦", stage: "Raw Material" },
  { id: "cutting", label: "Cutting", icon: "✂", stage: "Cutting" },
  { id: "pressing", label: "Pressing", icon: "🔨", stage: "Pressing" },
  { id: "polishing", label: "Polishing", icon: "✨", stage: "Polishing" },
  { id: "costs", label: "Cost Summary", icon: "₹" },
  { id: "settlement", label: "Settlement", icon: "⚖" },
  { id: "vendors", label: "Vendors", icon: "👥" },
];

// ─── APP ──────────────────────────────────────────────────────────────────────
function InventoryApp({ initialState, onStateChange, onLock, saveError }) {
  const [page, setPage] = useState("home");
  const [data, setData] = useState(initialState?.data ?? initData);
  const [vendors, setVendors] = useState(initialState?.vendors ?? initVendors);

  useEffect(() => {
    onStateChange({ data, vendors });
  }, [data, vendors, onStateChange]);

  const activePage = PAGES.find((p) => p.id === page) || PAGES[0];
  const props = { data, setData, vendors, setVendors, setPage };

  const screens = {
    home: <Dashboard {...props} />,
    raw: <RawMaterial {...props} />,
    cutting: <Cutting {...props} />,
    pressing: <Pressing {...props} />,
    polishing: <Polishing {...props} />,
    costs: <Costs {...props} />,
    settlement: <Settlement {...props} />,
    vendors: <Vendors {...props} />,
  };

  // Compute alert count
  const alertCount =
    data.cuttingJobs.filter((j) => j.status === "In Progress").length +
    data.pressing.filter((p) => p.status === "Dispatched").length +
    data.polishing.filter((p) => p.status !== "Done").length;

  return (
    <>
      <style>{css}</style>
      <div className="inventory-shell">
        <aside className="side-nav">
          <div className="brand-block">
            <div style={{ fontWeight: 800, fontSize: 17, color: C.accent }}>
              Steel IMS
            </div>
            <div className="brand-subtitle" style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>
              Shri Steel Works
            </div>
          </div>

          <nav style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {PAGES.map((p) => {
              const isActive = page === p.id;
              return (
                <button
                  className={`nav-button ${isActive ? "active" : ""}`}
                  key={p.id}
                  onClick={() => setPage(p.id)}
                  title={p.label}
                >
                  <span style={{ width: 22, textAlign: "center", flexShrink: 0 }}>{p.icon}</span>
                  <span className="nav-label" style={{ flex: 1 }}>{p.label}</span>
                  {p.id === "home" && alertCount > 0 && (
                    <span className="nav-badge"
                      style={{
                        background: C.orange,
                        color: "#000",
                        borderRadius: 10,
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 6px",
                        textAlign: "center",
                      }}
                    >
                      {alertCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="app-main">
          <header className="app-header">
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 3 }}>
                {activePage.stage ? "Production stage" : "Workspace"}
              </div>
              <div style={{ fontWeight: 800, fontSize: 22, lineHeight: 1.1 }}>
                {activePage.label}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              {activePage.stage && (
                <div style={{ width: 420, maxWidth: "38vw" }}>
                  <PipelineBar active={activePage.stage} />
                </div>
              )}
              <div
                style={{
                  color: saveError ? C.red : C.green,
                  background: saveError ? C.redBg : C.greenBg,
                  border: `1px solid ${saveError ? C.red : C.green}33`,
                  borderRadius: 6,
                  padding: "7px 10px",
                  fontSize: 12,
                  whiteSpace: "nowrap",
                }}
              >
                {saveError ? "Save issue" : "Saved locally"}
              </div>
            <button
              onClick={onLock}
              style={{
                  padding: "8px 12px",
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                background: C.card,
                  color: C.text,
                fontSize: 12,
              }}
            >
              Lock
            </button>
          </div>
          </header>

          <main className="content-wrap">
            {screens[page]}
          </main>
        </div>
      </div>
    </>
  );
}

export default function App() {
  const [unlocked, setUnlocked] = useState(isSessionUnlocked);
  const [appState, setAppState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let active = true;
    loadAppState()
      .then((state) => {
        if (active) setAppState(state ?? { data: initData, vendors: initVendors });
      })
      .catch(() => {
        if (active) setAppState({ data: initData, vendors: initVendors });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (unlocked) {
      setInventoryWindowMode().catch(() => {});
    } else {
      setCalculatorWindowMode().catch(() => {});
    }
  }, [unlocked]);

  useEffect(() => {
    if (!unlocked) return undefined;

    let timer;
    const lockAfterIdle = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setSessionUnlocked(false);
        setUnlocked(false);
        setCalculatorWindowMode().catch(() => {});
      }, 15 * 60 * 1000);
    };

    const events = ["mousemove", "mousedown", "keydown", "touchstart"];
    events.forEach((event) => window.addEventListener(event, lockAfterIdle));
    lockAfterIdle();

    return () => {
      window.clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, lockAfterIdle));
    };
  }, [unlocked]);

  const unlock = async () => {
    setSessionUnlocked(true);
    await setInventoryWindowMode().catch(() => {});
    setUnlocked(true);
  };

  const lock = async () => {
    setSessionUnlocked(false);
    await setCalculatorWindowMode().catch(() => {});
    setUnlocked(false);
  };

  const persistState = useCallback(async (nextState) => {
    setAppState(nextState);
    try {
      await saveAppState(nextState);
      setSaveError("");
    } catch (err) {
      setSaveError(err?.message ?? String(err));
    }
  }, []);

  if (!unlocked) return <CalculatorLock onUnlock={unlock} />;

  if (loading || !appState) {
    return (
      <>
        <style>{css}</style>
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
          Loading inventory...
        </div>
      </>
    );
  }

  return (
    <>
      {saveError && (
        <div
          style={{
            position: "fixed",
            right: 16,
            bottom: 16,
            zIndex: 1000,
            background: C.redBg,
            color: C.red,
            border: `1px solid ${C.red}`,
            borderRadius: 6,
            padding: "10px 12px",
            fontSize: 12,
          }}
        >
          Save failed: {saveError}
        </div>
      )}
      <InventoryApp initialState={appState} onStateChange={persistState} onLock={lock} saveError={saveError} />
    </>
  );
}
