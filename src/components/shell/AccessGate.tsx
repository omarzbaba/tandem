import { useState, type FormEvent } from "react";
import { setAccessCode, setWho, verifyAccessCode } from "../../lib/shared-state";
import "./access-gate.css";

interface Props {
  partnerAName: string;
  partnerBName: string;
  onEntered: (code: string) => void;
}

/**
 * The one-time sign-in.
 *
 * One code, shared by the two of them, checked against the server and then
 * remembered by this browser — so each device asks exactly once. There are no
 * accounts and no passwords to reset: the deliberate trade for a two-person
 * board is that the code IS the identity boundary, and "who are you" below is
 * for attributing pins to each other, not for security.
 */
export function AccessGate({ partnerAName, partnerBName, onEntered }: Props) {
  const [code, setCode] = useState("");
  const [who, setWhoChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (trimmed.length < 4) {
      setError("The code is at least 4 characters.");
      return;
    }
    if (!who) {
      setError("Pick which of you this is — it labels your pins.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await verifyAccessCode(trimmed);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAccessCode(trimmed);
    setWho(who);
    onEntered(trimmed);
  }

  return (
    <main className="gate">
      <form className="gate__card" onSubmit={submit}>
        <h1 className="gate__title display">Tandem</h1>
        <p className="gate__tagline">Two careers, one map.</p>

        <label className="gate__label" htmlFor="gate-code">
          Access code
        </label>
        <input
          id="gate-code"
          className="gate__input"
          type="password"
          autoComplete="current-password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="The code you were given"
          autoFocus
        />

        <fieldset className="gate__who">
          <legend className="gate__label">Who are you?</legend>
          <div className="gate__who-options">
            {[
              { value: "a", label: partnerAName || "Partner A" },
              { value: "b", label: partnerBName || "Partner B" },
            ].map((p) => (
              <label key={p.value} className={`gate__who-option${who === p.value ? " gate__who-option--on" : ""}`}>
                <input
                  type="radio"
                  name="who"
                  value={p.value}
                  checked={who === p.value}
                  onChange={() => setWhoChoice(p.value)}
                />
                {p.label}
              </label>
            ))}
          </div>
        </fieldset>

        {error && (
          <p className="gate__error" role="alert">
            {error}
          </p>
        )}

        <button className="gate__enter" type="submit" disabled={busy}>
          {busy ? "Checking…" : "Open the board"}
        </button>

        <p className="gate__note">
          You only do this once on each device — the board remembers you after that.
        </p>

        <p className="gate__dedication">
          Made for Dr. Rachad W. Wehbe &amp; Dr. Samia K. Al Sayyid Wehbe
          <span className="gate__copyright">© 2026 Omar Z. Baba, MD</span>
        </p>
      </form>
    </main>
  );
}
