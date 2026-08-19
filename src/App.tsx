import { useEffect, useMemo, useState } from "react";
import { useBoardData, useRadius } from "./hooks/useBoardData";
import { useMarks } from "./hooks/useMarks";
import { useTheme } from "./hooks/useTheme";
import { loadConfig, FALLBACK_CONFIG, type AppConfig } from "./lib/config";
import { clearAccessCode, getAccessCode, getWho, setWho } from "./lib/shared-state";
import { AccessGate } from "./components/shell/AccessGate";
import { NotificationPanel } from "./components/shell/NotificationPanel";
import { Tour, type TourStep } from "./components/shell/Tour";
import { useNotifications } from "./hooks/useNotifications";
import { useTour } from "./hooks/useTour";
import { formatRunTime } from "./lib/format";
import { TogetherView } from "./components/together/TogetherView";
import {
  RoleList,
  applyFilters,
  countUndated,
  DEFAULT_FILTERS,
  type RoleFilters,
  type SortKey,
} from "./components/roles/RoleList";
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
function loadUiState(): { tab: Tab; filters: RoleFilters; radius: number; sort: SortKey } | null {
  try {
    const raw = localStorage.getItem(UI_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      tab?: Tab;
      filters?: RoleFilters;
      radius?: number;
      sort?: SortKey;
    };
    return {
      tab: TABS.includes(parsed.tab as Tab) ? (parsed.tab as Tab) : "together",
      // Spread over the defaults so a state saved before a new filter existed
      // still loads, with the new key at its default.
      filters: { ...DEFAULT_FILTERS, ...(parsed.filters ?? {}) },
      radius: typeof parsed.radius === "number" ? parsed.radius : FALLBACK_CONFIG.defaultRadiusMiles,
      sort: (["fit", "newest", "oldest"] as const).includes(parsed.sort as SortKey)
        ? (parsed.sort as SortKey)
        : "fit",
    };
  } catch {
    return null;
  }
}

/**
 * The walkthrough. Each step points at a real control rather than a picture of
 * one, and says what it is FOR — a couple deciding where to move needs to know
 * why the Together tab exists, not merely that a tab exists.
 */
function tourSteps(partnerA: string, partnerB: string): TourStep[] {
  const a = partnerA.toLowerCase();
  const b = partnerB.toLowerCase();
  return [
    {
      title: "Welcome to your board",
      body: `This is not two job searches side by side. It looks for the places where a ${a} post and a ${b} post sit close enough together that you could both take one. Ninety seconds and you will know your way around.`,
    },
    {
      tab: "together",
      target: "tabs",
      title: "Start with Together",
      body: "The first tab is the whole point: areas with a live opening for each of you. The rest are your two full lists, anything either of you has pinned, and an honest account of what could and could not be read this week.",
    },
    {
      tab: "together",
      target: "metro-card",
      title: "Reading an area",
      body: "Each card is one commutable area — his side, her side, and the distance between them stated plainly. Watch for \u201cSame employer hiring both\u201d: one system hiring you both means one negotiation and one relocation instead of two.",
    },
    {
      tab: "together",
      target: "radius",
      title: "Set your own commute",
      body: "Drag this to the furthest apart you would genuinely accept and the map redraws instantly. Underneath you will also find places where only one of you has a post \u2014 worth a call, kept separate so they never pad the real matches.",
    },
    {
      tab: "radiology",
      target: "work",
      title: "Remote changes everything",
      body: `Radiology reads from anywhere; vascular surgery does not. Tap Remote to see every post ${b} could take from home \u2014 which makes a surgical job anywhere in the country workable. That is a far larger opportunity space than physical co-location.`,
    },
    {
      tab: "radiology",
      target: "filters",
      title: "Narrow it down",
      body: "Filter by country, practice setting, how recently a post appeared or minimum fit, and sort by newest when you only want to see what changed. Your choices are remembered on this device.",
    },
    {
      tab: "radiology",
      target: "role-card",
      title: "Open anything promising",
      body: "Tap a post for the full detail: why it scored what it did, what to watch out for, any recruiter contact found in the advert, and an enquiry email already written around your situation. The star pins it \u2014 and pins are shared, so whatever one of you pins, the other sees.",
    },
    {
      target: "bell",
      title: "What turned up while you were away",
      body: "The board re-sweeps every Monday morning. The bell gathers everything that has appeared since you last looked, however long that has been, and each of you has your own unread count.",
    },
    {
      target: "help",
      title: "That is everything",
      body: "This question mark reopens the tour whenever you want it. Now go and find somewhere you both want to live.",
    },
  ];
}

export default function App() {
  const restored = useMemo(loadUiState, []);
  const [config, setConfig] = useState<AppConfig>(FALLBACK_CONFIG);
  const [tab, setTab] = useState<Tab>(restored?.tab ?? "together");
  const [filters, setFilters] = useState<RoleFilters>(restored?.filters ?? DEFAULT_FILTERS);
  const [radius, setRadius] = useState(restored?.radius ?? FALLBACK_CONFIG.defaultRadiusMiles);
  const [sort, setSort] = useState<SortKey>(restored?.sort ?? "fit");
  const [openRoleId, setOpenRoleId] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [who, setWhoState] = useState(getWho());
  // Dev has no /api route, so the gate only guards real deployments.
  const [accessCode, setAccessCodeState] = useState(() =>
    import.meta.env.DEV ? "dev-local-board" : getAccessCode()
  );

  const { status, data, error } = useBoardData(BASE);
  const { metros, pairs } = useRadius(data, radius);
  const { marks, update, togglePin, error: markError, backendKind, pinnedCount, codeRejected } = useMarks(accessCode);
  const { theme, cycle } = useTheme();
  const tour = useTour(who, status === "ready" && data.roles.length > 0);
  const { groups, newTogetherAreas, unreadCount, lastSeen, markAllSeen } = useNotifications(
    data.roles,
    metros,
    who,
    data.run?.today ?? null
  );

  useEffect(() => {
    void loadConfig(BASE).then((c) => {
      setConfig(c);
      if (!restored) setRadius(c.defaultRadiusMiles);
    });
  }, [restored]);

  // Persist the working state so the board reopens where they left it.
  useEffect(() => {
    try {
      localStorage.setItem(UI_STATE_KEY, JSON.stringify({ tab, filters, radius, sort }));
    } catch {
      /* private browsing */
    }
  }, [tab, filters, radius, sort]);


  const rolesById = useMemo(
    () => new Map(data.roles.map((r) => [r.id, r])),
    [data.roles]
  );

  // A stored code the server now refuses (the owner rotated it) sends this
  // device straight back to the gate — the alternative is a permanently
  // broken board that only clearing site data would fix.
  useEffect(() => {
    if (!codeRejected) return;
    clearAccessCode();
    setAccessCodeState("");
  }, [codeRejected]);

  // The weekly email links straight to a posting: #role=<id> opens its drawer
  // as soon as the data arrives (and after the gate, on a first visit).
  useEffect(() => {
    if (status !== "ready" || !accessCode) return;
    const m = window.location.hash.match(/^#role=(.+)$/);
    if (!m) return;
    const id = decodeURIComponent(m[1] ?? "");
    if (rolesById.has(id)) setOpenRoleId(id);
    // Consume the hash so closing the drawer doesn't reopen it on reload.
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }, [status, accessCode, rolesById]);

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

  const steps = useMemo(
    () => tourSteps(config.partnerALabel, config.partnerBLabel),
    [config.partnerALabel, config.partnerBLabel]
  );

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
        title={config.boardTitle}
        tagline={config.boardTagline}
        byline={config.boardByline}
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
            <p className="masthead__tagline">
              {config.boardTagline} <span className="masthead__byline">{config.boardByline}</span>
            </p>
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
                className="help"
                data-tour="help"
                onClick={tour.start}
                aria-label="How to use this board"
                title="How to use this board"
              >
                ?
              </button>
              <button
                type="button"
                data-tour="bell"
                className={`bell${unreadCount > 0 ? " bell--unread" : ""}`}
                onClick={() => setNotifOpen(true)}
                aria-label={
                  unreadCount > 0
                    ? `What's new — ${unreadCount} since you last looked`
                    : "What's new — nothing since you last looked"
                }
                title="What's new"
              >
                <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                  <path
                    d="M8 1.7a3.9 3.9 0 0 0-3.9 3.9c0 3-1 4.2-1.4 4.6a.5.5 0 0 0 .35.86h9.9a.5.5 0 0 0 .35-.86c-.4-.4-1.4-1.6-1.4-4.6A3.9 3.9 0 0 0 8 1.7Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinejoin="round"
                  />
                  <path d="M6.6 13.2a1.5 1.5 0 0 0 2.8 0" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
                {unreadCount > 0 && (
                  <span className="bell__count tnum">{unreadCount > 99 ? "99+" : unreadCount}</span>
                )}
              </button>
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
          <nav className="tabs" aria-label="Board sections" data-tour="tabs">
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
                showSort={tab !== "together"}
                sort={sort}
                onSortChange={setSort}
                resultCount={
                  tab === "together"
                    ? togetherCount
                    : tab === "pinned"
                      ? pinnedRoles.length
                      : applyFilters(data.roles, filters, tab === "vascular" ? "vascular" : "radiology").length
                }
                undatedHeldBack={
                  tab === "vascular" || tab === "radiology"
                    ? countUndated(data.roles, filters, tab === "vascular" ? "vascular" : "radiology")
                    : 0
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
                sort={sort}
                emptyMessage="No posts match these filters. Try clearing them, or check the Coverage tab to see whether a source failed this week."
                onOpenRole={setOpenRoleId}
                onTogglePin={togglePin}
              />
            )}

            {tab === "pinned" && (
              <RoleList
                roles={pinnedRoles}
                marks={marks}
                sort={sort}
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
          Created for Dr. Rachad W. Wehbe &amp; Dr. Samia K. Al Sayyid Wehbe ·
          © 2026 Omar Z. Baba, MD. All rights reserved.
        </p>
      </footer>

      {tour.open && (
        <Tour
          steps={steps}
          onRequestTab={(t) => setTab(t as Tab)}
          onClose={tour.close}
          onFinish={tour.finish}
        />
      )}

      {notifOpen && (
        <NotificationPanel
          groups={groups}
          newTogetherAreas={newTogetherAreas}
          unreadCount={unreadCount}
          lastSeen={lastSeen}
          marks={marks}
          partnerALabel={config.partnerALabel}
          partnerBLabel={config.partnerBLabel}
          onOpenRole={setOpenRoleId}
          onMarkAllSeen={markAllSeen}
          onClose={() => setNotifOpen(false)}
        />
      )}

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
