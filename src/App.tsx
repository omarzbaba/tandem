import { useEffect, useMemo, useState } from "react";
import { useBoardData, useRadius } from "./hooks/useBoardData";
import { useMarks } from "./hooks/useMarks";
import { useTheme } from "./hooks/useTheme";
import { loadConfig, FALLBACK_CONFIG, type AppConfig } from "./lib/config";
import { getAccessCode, getWho, setWho } from "./lib/shared-state";
import { AccessGate } from "./components/shell/AccessGate";
import { formatRunTime } from "./lib/format";
import { TogetherView } from "./components/together/TogetherView";
import { RoleList, applyFilters, DEFAULT_FILTERS, type RoleFilters } from "./components/roles/RoleList";
import { RoleDrawer } from "./components/roles/RoleDrawer";
import { CoverageView } from "./components/coverage/CoverageView";
import { Filters } from "./components/shell/Filters";
import type { OutreachIdentity } from "./lib/outreach";
import "./styles/global.css";
import "./app.css";

const BASE = import.meta.env.BASE_URL;
const TABS = ["together", "vascular", "radiology", "pinned", "coverage"] as const;
type Tab = (typeof TABS)[number];

const UI_STATE_KEY = "tandem:ui:v1";

/** Last tab, filters and radius — restored on the next visit, per device. */
function loadUiState(): { tab: Tab; filters: RoleFilters; radius: number } | null {
  try {
    const raw = localStorage.getItem(UI_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { tab?: Tab; filters?: RoleFilters; radius?: number };
    return {
      tab: TABS.includes(parsed.tab as Tab) ? (parsed.tab as Tab) : "together",
      filters: { ...DEFAULT_FILTERS, ...(parsed.filters ?? {}) },
      radius: typeof parsed.radius === "number" ? parsed.radius : FALLBACK_CONFIG.defaultRadiusMiles,
    };
  } catch {
    return null;
  }
}

export default function App() {
  const restored = useMemo(loadUiState, []);
  const [config, setConfig] = useState<AppConfig>(FALLBACK_CONFIG);
  const [tab, setTab] = useState<Tab>(restored?.tab ?? "together");
  const [filters, setFilters] = useState<RoleFilters>(restored?.filters ?? DEFAULT_FILTERS);
  const [radius, setRadius] = useState(restored?.radius ?? FALLBACK_CONFIG.defaultRadiusMiles);
  const [openRoleId, setOpenRoleId] = useState<string | null>(null);
  const [who, setWhoState] = useState(getWho());
  // Dev has no /api route, so the gate only guards real deployments.
  const [accessCode, setAccessCodeState] = useState(() =>
    import.meta.env.DEV ? "dev-local-board" : getAccessCode()
  );

  const { status, data, error } = useBoardData(BASE);
  const { metros, pairs } = useRadius(data, radius);
  const { marks, update, togglePin, error: markError, backendKind, pinnedCount } = useMarks(accessCode);
  const { theme, cycle } = useTheme();

  useEffect(() => {
    void loadConfig(BASE).then((c) => {
      setConfig(c);
      if (!restored) setRadius(c.defaultRadiusMiles);
    });
  }, [restored]);

  // Persist the working state so the board reopens where they left it.
  useEffect(() => {
    try {
      localStorage.setItem(UI_STATE_KEY, JSON.stringify({ tab, filters, radius }));
    } catch {
      /* private browsing */
    }
  }, [tab, filters, radius]);


  const rolesById = useMemo(
    () => new Map(data.roles.map((r) => [r.id, r])),
    [data.roles]
  );

  const filtered = useMemo(() => applyFilters(data.roles, filters), [data.roles, filters]);
  const openRole = openRoleId ? rolesById.get(openRoleId) ?? null : null;

  // Filters constrain the specialty lists directly, and the Together tab
  // through the roles its clusters are built from.
  const visibleMetros = useMemo(() => {
    if (filters === DEFAULT_FILTERS) return metros;
    const allowed = new Set(filtered.map((r) => r.id));
    return metros
      .map((m) => ({
        ...m,
        vascularIds: m.vascularIds.filter((id) => allowed.has(id)),
        radiologyIds: m.radiologyIds.filter((id) => allowed.has(id)),
      }))
      .map((m) => {
        const isTogether = m.vascularIds.length > 0 && m.radiologyIds.length > 0;
        return {
          ...m,
          vascularCount: m.vascularIds.length,
          radiologyCount: m.radiologyIds.length,
          isTogether,
          // Filtering away the surgical side also removes the remote route:
          // there is nothing for her to be remote alongside.
          remoteUnlocked: !isTogether && m.vascularIds.length > 0 && m.remotePartnerCount > 0,
          missingSide: (isTogether
            ? null
            : m.vascularIds.length > 0
              ? "radiology"
              : "vascular") as "radiology" | "vascular" | null,
        };
      })
      .filter((m) => m.vascularIds.length + m.radiologyIds.length > 0);
  }, [metros, filtered, filters]);

  const togetherCount = visibleMetros.filter((m) => m.isTogether || m.remoteUnlocked).length;
  const pinnedRoles = data.roles.filter((r) => marks[r.id]?.pinned);

  const identity: OutreachIdentity = useMemo(() => {
    const isA = who === "a";
    return {
      name: (isA ? config.partnerAName : config.partnerBName) || "",
      credentials: "MD",
      specialty: isA ? config.partnerALabel.toLowerCase() : config.partnerBLabel.toLowerCase(),
      currentRole: "an attending physician looking to relocate",
      partnerLine: `My spouse is a ${(isA ? config.partnerBLabel : config.partnerALabel).toLowerCase()} attending, and we are looking to move together — so I am particularly interested in areas where both of us can practise.`,
    };
  }, [who, config]);

  // Rendered after every hook above has run, so entering the code cannot
  // change the hook count between renders (React #310).
  if (!accessCode) {
    return (
      <AccessGate
        partnerAName={config.partnerAName || config.partnerALabel}
        partnerBName={config.partnerBName || config.partnerBLabel}
        onEntered={(code) => {
          setAccessCodeState(code);
          setWhoState(getWho());
        }}
      />
    );
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to the board
      </a>

      <header className="masthead">
        <div className="shell masthead__inner">
          <div className="masthead__brand">
            <h1 className="masthead__title display">{config.boardTitle}</h1>
            <p className="masthead__tagline">{config.boardTagline}</p>
          </div>

          <div className="masthead__meta">
            {data.run && (
              <p className="masthead__run tnum">
                Updated {formatRunTime(data.run.ranAt)}
                <span className="masthead__sep">·</span>
                {data.run.counts.roles ?? 0} posts
                {(data.run.counts.newThisRun ?? 0) > 0 && (
                  <span className="masthead__new"> · {data.run.counts.newThisRun} new</span>
                )}
              </p>
            )}
            <div className="masthead__controls">
              <label className="who">
                <span className="sr-only">Who is using this browser</span>
                <select
                  value={who}
                  onChange={(e) => {
                    setWho(e.target.value);
                    setWhoState(e.target.value);
                  }}
                >
                  <option value="">Who are you?</option>
                  <option value="a">{config.partnerAName || config.partnerALabel}</option>
                  <option value="b">{config.partnerBName || config.partnerBLabel}</option>
                </select>
              </label>
              <button
                type="button"
                className="masthead__theme"
                onClick={cycle}
                aria-label={`Theme: ${theme}. Click to change.`}
                title={`Theme: ${theme}`}
              >
                {theme === "dark" ? "◑" : theme === "light" ? "◐" : "◒"}
              </button>
            </div>
          </div>
        </div>

        <div className="shell">
          <nav className="tabs" aria-label="Board sections">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                className={`tabs__tab${tab === t ? " tabs__tab--on" : ""} tabs__tab--${t}`}
                aria-current={tab === t ? "page" : undefined}
                onClick={() => setTab(t)}
              >
                {t === "together" && `Together${togetherCount ? ` (${togetherCount})` : ""}`}
                {t === "vascular" && config.partnerALabel}
                {t === "radiology" && config.partnerBLabel}
                {t === "pinned" && `Pinned${pinnedCount ? ` (${pinnedCount})` : ""}`}
                {t === "coverage" && "Coverage"}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main id="main" className="shell board">
        {status === "loading" && <p className="board__status">Loading the board…</p>}

        {status === "error" && (
          <div className="board__error" role="alert">
            <p>
              <strong>Could not load this week's data.</strong> {error}
            </p>
            <p>
              If this is a fresh deployment, the weekly harvest may not have run yet — trigger the{" "}
              <code>harvest</code> workflow in GitHub Actions.
            </p>
          </div>
        )}

        {markError && (
          <p className="board__warn" role="status">
            {markError}
          </p>
        )}

        {status === "ready" && (
          <>
            {tab !== "coverage" && (
              <Filters
                filters={filters}
                onChange={setFilters}
                radius={radius}
                onRadiusChange={setRadius}
                showRadius={tab === "together"}
                resultCount={
                  tab === "together"
                    ? togetherCount
                    : tab === "pinned"
                      ? pinnedRoles.length
                      : applyFilters(data.roles, filters, tab === "vascular" ? "vascular" : "radiology").length
                }
              />
            )}

            {tab === "together" && (
              <TogetherView
                metros={visibleMetros}
                rolesById={rolesById}
                marks={marks}
                radiusMiles={radius}
                partnerALabel={config.partnerALabel}
                partnerBLabel={config.partnerBLabel}
                onOpenRole={setOpenRoleId}
                onTogglePin={togglePin}
              />
            )}

            {(tab === "vascular" || tab === "radiology") && (
              <RoleList
                roles={applyFilters(data.roles, filters, tab === "vascular" ? "vascular" : "radiology")}
                marks={marks}
                emptyMessage="No posts match these filters. Try clearing them, or check the Coverage tab to see whether a source failed this week."
                onOpenRole={setOpenRoleId}
                onTogglePin={togglePin}
              />
            )}

            {tab === "pinned" && (
              <RoleList
                roles={pinnedRoles}
                marks={marks}
                emptyMessage={
                  backendKind === "local"
                    ? "Nothing pinned yet. Pins are stored in this browser only — deploy with a shared board id to sync them between the two of you."
                    : "Nothing pinned yet. Anything either of you pins shows up here."
                }
                onOpenRole={setOpenRoleId}
                onTogglePin={togglePin}
              />
            )}

            {tab === "coverage" && <CoverageView run={data.run} />}
          </>
        )}
      </main>

      <footer className="shell board__foot">
        <p>
          {pairs.length} commutable pairs across {metros.length} areas at {radius} miles.{" "}
          {backendKind === "local"
            ? "Pins and notes are saved in this browser only."
            : "Pins and notes are shared between both of you."}
        </p>
        <p className="board__credit">
          Distances are straight-line with a road-circuity estimate, not routed drive times. Place
          data from GeoNames (CC BY 4.0).
        </p>
        <p className="board__dedication">
          Created for Dr. Rashad W. Wehbe &amp; Dr. Samia K. Al Sayyid Wehbe ·
          © 2026 Omar Z. Baba, MD. All rights reserved.
        </p>
      </footer>

      {openRole && (
        <RoleDrawer
          role={openRole}
          mark={marks[openRole.id] ?? { pinned: false, status: "new", note: "", by: "", updatedAt: "" }}
          identity={identity}
          onClose={() => setOpenRoleId(null)}
          onUpdate={update}
        />
      )}
    </>
  );
}
