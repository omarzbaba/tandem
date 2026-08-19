import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import "./tour.css";

export interface TourStep {
  /** Element to spotlight, via its data-tour attribute. Omit for a centred card. */
  target?: string;
  /** Switch to this tab before showing the step. */
  tab?: string;
  title: string;
  body: string;
}

interface Props {
  steps: TourStep[];
  onRequestTab: (tab: string) => void;
  onClose: () => void;
  onFinish: () => void;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const CARD_WIDTH = 330;
const GAP = 14;
const MOBILE_MAX = 640;

/**
 * A guided walkthrough that spotlights the real controls rather than showing
 * pictures of them: the highlight is cut out of a dimming overlay with a large
 * spread shadow, so the actual button underneath stays visible in place.
 *
 * Every step degrades safely. If a target is missing — a tab renders different
 * controls, the board is empty, the viewport is narrow — the step falls back to
 * a centred card instead of pointing at nothing.
 */
export function Tour({ steps, onRequestTab, onClose, onFinish }: Props) {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  const step = steps[index]!;
  const isLast = index === steps.length - 1;
  // Effects key off these primitives rather than `step`: the steps array is
  // rebuilt by the parent on every render, so depending on object identity
  // restarted the measure timer continuously and the spotlight settled on the
  // PREVIOUS step's element.
  const stepTarget = step.target;
  const stepTab = step.tab;

  // Ask for the right tab before measuring, so the target exists.
  useEffect(() => {
    if (stepTab) onRequestTab(stepTab);
  }, [stepTab, onRequestTab]);

  const measure = useCallback(() => {
    if (!stepTarget) {
      setBox(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(`[data-tour="${stepTarget}"]`);
    if (!el) {
      setBox(null);
      return;
    }
    const r = el.getBoundingClientRect();
    // A horizontally scrolling flex row (the tab bar) reports zero width from
    // getBoundingClientRect even though it is plainly on screen, so fall back
    // to its scroll size and clamp to the viewport.
    const width = Math.min(r.width || el.scrollWidth, window.innerWidth - 8);
    const height = r.height || el.scrollHeight;
    if (!width || !height) {
      setBox(null);
      return;
    }
    setBox({ top: r.top, left: r.width ? r.left : 4, width, height });
  }, [stepTarget]);

  // Bring the target into view, then measure once it has settled.
  useLayoutEffect(() => {
    const el = stepTarget
      ? document.querySelector<HTMLElement>(`[data-tour="${stepTarget}"]`)
      : null;
    if (el) {
      el.scrollIntoView({
        block: "center",
        inline: "center",
        behavior: reducedMotion ? "auto" : "smooth",
      });
    } else {
      window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
    }
    // Measure once the smooth scroll has settled, then again shortly after in
    // case a tab switch re-rendered a long list underneath.
    const t1 = setTimeout(measure, reducedMotion ? 0 : 340);
    const t2 = setTimeout(measure, reducedMotion ? 30 : 620);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [stepTarget, measure, reducedMotion]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  useEffect(() => {
    cardRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, steps.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, steps.length]);

  const isMobile = typeof window !== "undefined" && window.innerWidth <= MOBILE_MAX;

  /** Below the target when there is room, otherwise above; clamped on screen. */
  const cardStyle: React.CSSProperties = (() => {
    if (!box || isMobile) return {};
    const below = box.top + box.height + GAP;
    const roomBelow = window.innerHeight - below;
    const placeBelow = roomBelow > 220;
    const left = Math.min(
      Math.max(GAP, box.left + box.width / 2 - CARD_WIDTH / 2),
      window.innerWidth - CARD_WIDTH - GAP
    );
    return placeBelow
      ? { top: below, left }
      : { bottom: window.innerHeight - box.top + GAP, left };
  })();

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Guided tour">
      {/*
        One dimming mechanism for every step: a huge spread shadow around the
        highlight. Untargeted steps collapse the highlight to nothing offscreen,
        so the shadow alone covers the viewport — a separate filled overlay was
        a second code path that could (and did) render differently.
      */}
      <div
        className={
          "tour__spotlight" +
          (box ? "" : " tour__spotlight--none")
        }
        style={
          box
            ? { top: box.top - 6, left: box.left - 6, width: box.width + 12, height: box.height + 12 }
            : { top: -20, left: -20, width: 0, height: 0 }
        }
      />

      <div
        ref={cardRef}
        tabIndex={-1}
        className={`tour__card${!box || isMobile ? " tour__card--anchored" : ""}`}
        style={cardStyle}
      >
        <p className="tour__progress eyebrow">
          Step {index + 1} of {steps.length}
        </p>
        <h2 className="tour__title display">{step.title}</h2>
        <p className="tour__body">{step.body}</p>

        <div className="tour__dots" aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s.title} className={`tour__dot${i === index ? " tour__dot--on" : ""}`} />
          ))}
        </div>

        <div className="tour__actions">
          {index > 0 && (
            <button type="button" className="tour__back" onClick={() => setIndex(index - 1)}>
              Back
            </button>
          )}
          <button
            type="button"
            className="tour__next"
            onClick={() => (isLast ? onFinish() : setIndex(index + 1))}
          >
            {isLast ? "Got it" : "Next"}
          </button>
        </div>

        <button type="button" className="tour__dismiss" onClick={onFinish}>
          Skip — don't show this again
        </button>
      </div>
    </div>
  );
}
