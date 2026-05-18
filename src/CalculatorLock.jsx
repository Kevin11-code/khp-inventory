import { useCallback, useEffect, useMemo, useState } from "react";
import { verifyUnlockCode } from "./desktopBridge.js";

const keys = [
  { label: "C", kind: "utility" },
  { label: "⌫", kind: "utility" },
  { label: "%", kind: "operator" },
  { label: "÷", kind: "operator" },
  { label: "7" },
  { label: "8" },
  { label: "9" },
  { label: "×", kind: "operator" },
  { label: "4" },
  { label: "5" },
  { label: "6" },
  { label: "-", kind: "operator" },
  { label: "1" },
  { label: "2" },
  { label: "3" },
  { label: "+", kind: "operator" },
  { label: "0", wide: true },
  { label: "." },
  { label: "=", kind: "equals" },
];

const lockCss = `
  html, body, #root {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  body { margin: 0; }
  .calc-lock {
    width: 100vw;
    height: 100vh;
    display: grid;
    place-items: center;
    background: #15171c;
    color: #f2f4f8;
    font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    overflow: hidden;
  }
  .calc-shell {
    width: 100%;
    height: 100%;
    background: #20242c;
    display: flex;
    flex-direction: column;
    padding: 12px;
    overflow: hidden;
  }
  .calc-history {
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    color: #8b94a3;
    font-size: 12px;
    overflow: hidden;
    white-space: nowrap;
  }
  .calc-display {
    height: 82px;
    flex: 0 0 82px;
    border-radius: 6px;
    background: #111318;
    border: 1px solid #2d3340;
    display: flex;
    align-items: end;
    justify-content: flex-end;
    padding: 12px 14px;
    font-size: 38px;
    font-weight: 500;
    line-height: 1;
    letter-spacing: 0;
    overflow: hidden;
    white-space: nowrap;
  }
  .calc-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-template-rows: repeat(5, minmax(0, 1fr));
    gap: 9px;
    flex: 1;
    min-height: 0;
    margin-top: 12px;
  }
  .calc-key {
    min-width: 0;
    min-height: 0;
    border-radius: 6px;
    border: 1px solid #373e4c;
    background: #292f3a;
    color: #f2f4f8;
    font-size: 19px;
    font-weight: 600;
  }
  .calc-key:hover { background: #313846; }
  .calc-key:focus-visible {
    outline: 2px solid #f0a500;
    outline-offset: 2px;
  }
  .calc-key.operator,
  .calc-key.utility {
    background: #332b1b;
    border-color: #554119;
    color: #f0a500;
  }
  .calc-key.equals {
    background: #f0a500;
    border-color: #f0a500;
    color: #15171c;
  }
  .calc-key.wide { grid-column: span 2; }
  .calc-error {
    height: 18px;
    flex: 0 0 18px;
    padding-top: 5px;
    color: #f87171;
    font-size: 12px;
    text-align: center;
    overflow: hidden;
  }
`;

export default function CalculatorLock({ onUnlock }) {
  const [expression, setExpression] = useState("");
  const [display, setDisplay] = useState("0");
  const [error, setError] = useState("");
  const operators = useMemo(() => new Set(["+", "-", "×", "÷"]), []);

  const press = useCallback(
    async (key) => {
      setError("");

      if (key === "C") {
        setExpression("");
        setDisplay("0");
        return;
      }

      if (key === "⌫") {
        const next = expression.slice(0, -1);
        setExpression(next);
        setDisplay(next || "0");
        return;
      }

      if (key === "=") {
        const unlockCode = `${expression}=`;
        if (await verifyUnlockCode(unlockCode)) {
          onUnlock();
          return;
        }

        try {
          const result = calculate(expression);
          setDisplay(String(result));
          setExpression(String(result));
        } catch {
          setError("Invalid input");
        }
        return;
      }

      if (key === "%") {
        const unlockCode = `${expression}%`;
        if (await verifyUnlockCode(unlockCode)) {
          onUnlock();
          return;
        }
        const numeric = Number(expression);
        if (!Number.isFinite(numeric)) {
          setError("Invalid input");
          return;
        }
        const next = expression ? String(numeric / 100) : "0";
        setExpression(next);
        setDisplay(next);
        return;
      }

      const last = expression[expression.length - 1];
      if (operators.has(key) && (!expression || operators.has(last))) return;
      if (key === "." && expression.split(/[+\-×÷]/).pop()?.includes(".")) return;

      const next = expression === "0" && /\d/.test(key) ? key : `${expression}${key}`;
      setExpression(next);
      setDisplay(next);
    },
    [expression, onUnlock, operators],
  );

  useEffect(() => {
    const onKeyDown = (event) => {
      const keyMap = {
        Enter: "=",
        Escape: "C",
        Backspace: "⌫",
        "*": "×",
        "/": "÷",
      };
      const key = keyMap[event.key] ?? event.key;
      if (!/^\d$/.test(key) && !["+", "-", ".", "%", "=", "×", "÷", "C", "⌫"].includes(key)) return;
      event.preventDefault();
      press(key);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [press]);

  return (
    <>
      <style>{lockCss}</style>
      <div className="calc-lock">
        <div className="calc-shell" aria-label="Calculator">
          <div className="calc-history">{expression && expression !== display ? expression : ""}</div>
          <div className="calc-display">{display}</div>
          <div className="calc-grid">
            {keys.map((key) => (
              <button
                className={`calc-key ${key.kind ?? ""} ${key.wide ? "wide" : ""}`}
                key={key.label}
                onClick={() => press(key.label)}
              >
                {key.label}
              </button>
            ))}
          </div>
          <div className="calc-error">{error}</div>
        </div>
      </div>
    </>
  );
}

function calculate(expression) {
  if (!expression || !/^[\d.+\-×÷\s]+$/.test(expression)) throw new Error("Invalid input");
  const normalized = expression.replaceAll("×", "*").replaceAll("÷", "/");
  // Calculator-only evaluation after strict token filtering.
  // eslint-disable-next-line no-new-func
  const result = Function(`"use strict"; return (${normalized})`)();
  if (!Number.isFinite(result)) throw new Error("Invalid result");
  return Math.round(result * 100000000) / 100000000;
}
