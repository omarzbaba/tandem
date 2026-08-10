import type { Subscores } from "../../lib/types";
import "./score-bars.css";

/** Weight ceilings from scout/score.mjs — the denominator each bar fills against. */
const DIMS: { key: keyof Subscores; label: string; max: number }[] = [
  { key: "specialtyFit", label: "Specialty fit", max: 34 },
  { key: "practiceQuality", label: "Practice", max: 20 },
  { key: "seniority", label: "Seniority", max: 16 },
  { key: "location", label: "Location", max: 14 },
  { key: "recency", label: "Recency", max: 10 },
  { key: "signal", label: "Detail in posting", max: 8 },
];

/**
 * Shows how a score was reached rather than asserting it. A number a couple is
 * going to move house over should be arguable.
 */
export function ScoreBars({ subscores, hue }: { subscores: Subscores; hue: string }) {
  return (
    <dl className="score-bars">
      {DIMS.map(({ key, label, max }) => {
        const value = subscores[key] ?? 0;
        const pct = Math.max(0, Math.min(100, (value / max) * 100));
        return (
          <div className="score-bars__row" key={key}>
            <dt>{label}</dt>
            <dd>
              <span className="score-bars__track">
                <span
                  className="score-bars__fill"
                  style={{ inlineSize: `${pct}%`, background: hue }}
                />
              </span>
              <span className="score-bars__value tnum">
                {value}<span className="score-bars__max">/{max}</span>
              </span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
