import type { RunReport } from "../../lib/types";
import { formatRunTime } from "../../lib/format";
import "./coverage-view.css";

/**
 * What the run actually covered.
 *
 * A board that hides its gaps is worse than no board: "no vascular posts in
 * Ohio" and "the Ohio source returned 403" look identical on a list and mean
 * opposite things. Every failed and sweep-only source is named here.
 */
export function CoverageView({ run }: { run: RunReport | null }) {
  if (!run) {
    return (
      <div className="empty">
        <h2 className="empty__title display">No run report</h2>
        <p>The harvester has not written data/run.json yet.</p>
      </div>
    );
  }

  const c = run.counts;

  return (
    <div className="coverage">
      <dl className="coverage__stats">
        {(
          [
            ["Sources swept", `${c.sourcesAttempted ?? 0} of ${c.sourcesRegistered ?? 0}`],
            ["Postings read", c.rawPostings ?? 0],
            ["Not relevant", c.irrelevant ?? 0],
            ["Duplicates merged", c.duplicates ?? 0],
            ["Expired, dropped", c.expired ?? 0],
            ["On the board", c.roles ?? 0],
            ["New this run", c.newThisRun ?? 0],
            ["Commutable pairs", c.pairs ?? 0],
            ["Areas with both", c.togetherMetros ?? 0],
          ] as const
        ).map(([label, value]) => (
          <div className="coverage__stat" key={label}>
            <dt className="eyebrow">{label}</dt>
            <dd className="tnum">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="coverage__ran">
        Last run {formatRunTime(run.ranAt)} · commutable radius {run.radiusMiles} miles
        {(c.unlocated ?? 0) > 0 && ` · ${c.unlocated} postings had no usable location`}
        {(c.carriedOver ?? 0) > 0 && ` · ${c.carriedOver} carried over from last week`}
      </p>

      {run.failedSources.length > 0 && (
        <section className="coverage__section">
          <h2 className="coverage__heading">Sources that failed this run</h2>
          <p className="coverage__note">
            These were not swept. Treat their regions as uncovered, not empty.
          </p>
          <ul className="coverage__sources">
            {run.failedSources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.name}
                </a>
                <span className="coverage__error">{s.error}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(run.needsCredentials?.length ?? 0) > 0 && (
        <section className="coverage__section">
          <h2 className="coverage__heading">Waiting on a free API key</h2>
          <p className="coverage__note">
            These aggregators work, but each needs its own free account before the harvester may
            call it. Until then they contribute nothing — which is a setup gap, not a fault.
          </p>
          <ul className="coverage__sources">
            {run.needsCredentials!.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.name}
                </a>
                <span className="coverage__query">{s.needs}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {run.emptySources.length > 0 && (
        <section className="coverage__section">
          <h2 className="coverage__heading">Swept, nothing matching</h2>
          <p className="coverage__note">
            These responded normally but had no attending vascular or diagnostic radiology posts.
          </p>
          <p className="coverage__inline">{run.emptySources.join(" · ")}</p>
        </section>
      )}

      {run.sweepOnlySources.length > 0 && (
        <section className="coverage__section">
          <h2 className="coverage__heading">Boards that need a human</h2>
          <p className="coverage__note">
            No machine-readable feed, so the automated run cannot read them. Worth opening these by
            hand every few weeks — each is listed with a suggested search.
          </p>
          <ul className="coverage__sources">
            {run.sweepOnlySources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.name}
                </a>
                {s.query && <span className="coverage__query">{s.query}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
