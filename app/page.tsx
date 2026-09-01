"use client";

import { useEffect, useMemo, useState } from "react";
import { MapOverlay, WorldMap } from "./WorldMap";
import {
  AxialCoord,
  coordKey,
  formatCompact,
  Nation,
  NationMetrics,
  SimulationSnapshot,
  SPEED_PRESETS,
  useSimulation,
  WorldEvent,
} from "./simulation";

type LogFilter = "All" | "War" | "Trade/Social" | "Science/Space" | "Diplomacy";

const NATION_ORDER: Nation[] = ["Tera", "Sora", "Aqua", "Solar", "Luna"];
const NATION_INFO: Record<Nation, { code: string; color: string }> = {
  Tera: { code: "TE", color: "#4f86ff" },
  Sora: { code: "SO", color: "#ff5574" },
  Aqua: { code: "AQ", color: "#34d6a2" },
  Solar: { code: "SL", color: "#ffc34f" },
  Luna: { code: "LU", color: "#d7e2ed" },
};
const LOG_FILTERS: LogFilter[] = ["All", "War", "Trade/Social", "Science/Space", "Diplomacy"];

export default function Home() {
  const simulation = useSimulation();
  const [overlay, setOverlay] = useState<MapOverlay>("Territory");
  const [selected, setSelected] = useState<AxialCoord | null>(null);
  const [logFilter, setLogFilter] = useState<LogFilter>("All");
  const [pinnedNation, setPinnedNation] = useState<Nation | null>(null);
  const [pinFilter, setPinFilter] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const snapshot = simulation.snapshot;

  useEffect(() => {
    if (!selected && snapshot?.grid.hexes.length) {
      const center = snapshot.grid.hexes.find((hex) => hex.q === 0 && hex.r === 0) ?? snapshot.grid.hexes[0];
      setSelected({ q: center.q, r: center.r });
    }
  }, [selected, snapshot]);

  const selectedOwner = useMemo(() => {
    if (!snapshot || !selected) return null;
    return snapshot.grid.hexes.find((hex) => coordKey(hex) === coordKey(selected))?.owner ?? null;
  }, [selected, snapshot]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLButtonElement) return;
      if (event.key === " " || event.key.toLowerCase() === "p") {
        event.preventDefault();
        simulation.setRunning((current) => !current);
      } else if (/^[1-4]$/.test(event.key)) simulation.applyPreset(event.key);
      else if (event.key === "+" || event.key === "=") simulation.adjustPace(true);
      else if (event.key === "-") simulation.adjustPace(false);
      else if (event.key === ">" || event.key === ".") simulation.adjustTimescale(true);
      else if (event.key === "<" || event.key === ",") simulation.adjustTimescale(false);
      else if (event.key.toLowerCase() === "r") simulation.reset();
      else if (event.key === "[") setOverlay((current) => previousOverlay(current));
      else if (event.key === "]") setOverlay((current) => nextOverlay(current));
      else if (event.key.toLowerCase() === "f") setLogFilter((current) => LOG_FILTERS[(LOG_FILTERS.indexOf(current) + 1) % LOG_FILTERS.length]);
      else if (event.key.toLowerCase() === "g") setPinFilter((current) => !current);
      else if (event.key.toLowerCase() === "c") setPinnedNation(selectedOwner ?? pinnedNation);
      else if (event.key.toLowerCase() === "v") setFocusMode((current) => !current);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pinnedNation, selectedOwner, simulation]);

  const filteredEvents = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.events
      .filter((event) => eventMatchesFilter(event, logFilter))
      .filter((event) => !pinFilter || !pinnedNation || eventInvolves(event, pinnedNation))
      .slice()
      .reverse()
      .slice(0, 12);
  }, [logFilter, pinFilter, pinnedNation, snapshot]);

  const orderedNations = useMemo(() => {
    const focus = pinnedNation ?? selectedOwner;
    return NATION_ORDER.slice().sort((a, b) => (a === focus ? -1 : b === focus ? 1 : NATION_ORDER.indexOf(a) - NATION_ORDER.indexOf(b)));
  }, [pinnedNation, selectedOwner]);

  if (!snapshot) {
    return (
      <main className="engine-loading">
        <span className="brand-mark">CS</span>
        <p className="eyebrow">CIVILIZATION SIMULATOR</p>
        <h1>{simulation.error ? "Engine offline" : "Waking the world"}</h1>
        <p>{simulation.error ?? "Loading the original Rust simulation engine…"}</p>
      </main>
    );
  }

  const focusNation = focusMode ? (pinnedNation ?? selectedOwner) : null;
  const narrative = snapshot.events.slice(-3).reverse().map(eventHeadline).join(" · ") || "Systems nominal";
  const selectedIsCombat = selected ? snapshot.combat_hexes.some((coord) => coordKey(coord) === coordKey(selected)) : false;
  const selectedIsNuclear = selected ? snapshot.nuclear_hexes.some((coord) => coordKey(coord) === coordKey(selected)) : false;

  return (
    <main className="command-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark">CS</span>
          <div><p className="eyebrow">CIVILIZATION SIMULATOR</p><h1>Command Bridge</h1></div>
        </div>
        <div className="epoch-readout">
          <span className={`status-dot ${simulation.running ? "" : "paused"}`} />
          <div><small>EPOCH {snapshot.epoch}</small><strong>{snapshot.season}</strong></div>
          <div><small>COSMIC AGE</small><strong>{formatYears(snapshot.cosmic_age_years)}</strong></div>
        </div>
        <div className="world-health">
          <span>WORLD SIGNAL</span><strong>{snapshot.science_victory.finished ? "VICTORY" : simulation.running ? "LIVE" : "PAUSED"}</strong>
          <div className="signal-bars"><i /><i /><i /><i /></div>
        </div>
      </header>

      <div className="narrative-ticker"><span>{snapshot.season_effect.label}</span><p>{narrative}</p><b>TICK {snapshot.tick}</b></div>

      <section className="control-deck live-deck" aria-label="Simulation controls">
        <button className="play-button" onClick={() => simulation.setRunning((current) => !current)} aria-label={simulation.running ? "Pause simulation" : "Resume simulation"}>
          <span>{simulation.running ? "Ⅱ" : "▶"}</span>{simulation.running ? "PAUSE" : "RESUME"}
        </button>
        <div className="speed-group">
          {SPEED_PRESETS.map((preset) => (
            <button key={preset.key} className={simulation.presetKey === preset.key ? "active" : ""} onClick={() => simulation.applyPreset(preset.key)} title={preset.intent}>
              <span>{preset.key}</span><strong>{preset.label}</strong><small>{formatYears(preset.yearsPerTick)}/tick</small>
            </button>
          ))}
        </div>
        <div className="manual-controls">
          <div><button onClick={() => simulation.adjustPace(false)} aria-label="Slower tick pace">−</button><span><small>PACE</small><strong>{simulation.tickMs} ms</strong></span><button onClick={() => simulation.adjustPace(true)} aria-label="Faster tick pace">+</button></div>
          <div><button onClick={() => simulation.adjustTimescale(false)} aria-label="Lower years per tick">‹</button><span><small>TIMESCALE</small><strong>{formatYears(simulation.yearsPerTick)}</strong></span><button onClick={() => simulation.adjustTimescale(true)} aria-label="Raise years per tick">›</button></div>
          <button className="step-control" onClick={simulation.step}>STEP</button>
          <button className="reset-control" onClick={simulation.reset}>RESET</button>
        </div>
      </section>

      <section className="workspace">
        <div className="map-panel panel">
          <div className="panel-heading">
            <div><span className="section-index">01</span><div><p>WORLD THEATER</p><h2>Territorial Observatory</h2></div></div>
            <div className="map-actions">
              <button className={focusMode ? "toggle active" : "toggle"} onClick={() => setFocusMode(!focusMode)}>FOCUS</button>
              <div className="segmented" role="group" aria-label="Map overlay">
                {(["Territory", "Climate", "Conflict"] as MapOverlay[]).map((item) => <button key={item} className={overlay === item ? "active" : ""} onClick={() => setOverlay(item)}>{item}</button>)}
              </div>
            </div>
          </div>
          <div className="hex-map live-map">
            <WorldMap snapshot={snapshot} overlay={overlay} selected={selected} focus={focusNation} onSelect={setSelected} />
            <div className="map-scanline" />
            <div className="map-legend">
              {NATION_ORDER.map((nation) => <span key={nation}><i style={{ background: NATION_INFO[nation].color }} />{nation}</span>)}
              <span className="legend-alert">✸ FRONT · ◎ NUKE</span>
            </div>
          </div>
          <div className="selection-strip">
            <div><small>SELECTED HEX</small><strong>{selected ? `q: ${signed(selected.q)} · r: ${signed(selected.r)}` : "None"}</strong></div>
            <div><small>SOVEREIGNTY</small><strong style={{ color: selectedOwner ? NATION_INFO[selectedOwner].color : undefined }}>{selectedOwner ?? "Unclaimed"}</strong></div>
            <div><small>FRONT STATUS</small><strong className={selectedIsCombat ? "alert" : "safe"}>{selectedIsCombat ? "ACTIVE" : "SECURE"}</strong></div>
            <div><small>NUCLEAR TRACE</small><strong className={selectedIsNuclear ? "alert" : "safe"}>{selectedIsNuclear ? "DETECTED" : "CLEAR"}</strong></div>
          </div>
        </div>

        <aside className="side-stack">
          <WorldPulse snapshot={snapshot} />
          <section className="panel event-panel">
            <div className="mini-heading"><div><span className="section-index">03</span><h2>Signal Intelligence</h2></div><span className="live-label">{filteredEvents.length} SIGNALS</span></div>
            <div className="filter-row" role="group" aria-label="Event filters">
              {LOG_FILTERS.map((filter) => <button key={filter} className={logFilter === filter ? "active" : ""} onClick={() => setLogFilter(filter)}>{filter}</button>)}
            </div>
            <div className="pin-row">
              <button className={pinFilter ? "active" : ""} onClick={() => setPinFilter(!pinFilter)}>PIN FILTER {pinFilter ? "ON" : "OFF"}</button>
              <button onClick={() => setPinnedNation(selectedOwner)}>PIN {selectedOwner ?? "SELECTION"}</button>
              {pinnedNation && <button onClick={() => setPinnedNation(null)}>CLEAR {pinnedNation}</button>}
            </div>
            <div className="events live-events">
              {filteredEvents.length ? filteredEvents.map((event, index) => <EventRow key={`${event.tick}-${index}-${event.kind.type}`} event={event} pinned={pinnedNation ? eventInvolves(event, pinnedNation) : false} />) : <p className="empty-state">No events match this signal filter.</p>}
            </div>
          </section>
        </aside>
      </section>

      <section className="science-grid">
        <ProgressPanel snapshot={snapshot} />
        <DiagnosticPanel snapshot={snapshot} />
        <GloryPanel snapshot={snapshot} />
      </section>

      <section className="civilizations panel">
        <div className="panel-heading compact"><div><span className="section-index">07</span><div><p>GLOBAL PORTFOLIO</p><h2>Civilization Matrix</h2></div></div><span className="keyboard-hint">Space pause · 1—4 speed · [ ] overlay · F filter · G pin · C capture · V focus</span></div>
        <div className="nation-row live-nations">
          {orderedNations.map((nation) => <NationCard key={nation} nation={nation} metrics={snapshot.all_metrics[nation]} civ={snapshot.civ_state[nation]} snapshot={snapshot} selected={nation === selectedOwner} pinned={nation === pinnedNation} onPin={() => setPinnedNation(nation)} />)}
        </div>
      </section>

      <section className="bottom-grid">
        <ChartPanel snapshot={snapshot} />
        <EntityPanel snapshot={snapshot} />
      </section>

      <footer className="system-footer">
        <span>RUST/WASM ENGINE</span><p>{snapshot.grid.hexes.length} hexes · {snapshot.entities.length} agents · {snapshot.events.length} recorded events · {snapshot.diplomacy.alliances.length} alliances · {snapshot.diplomacy.sanctions.length} sanctions</p><button onClick={simulation.reset}>NEW WORLD</button>
      </footer>
    </main>
  );
}

function WorldPulse({ snapshot }: { snapshot: SimulationSnapshot }) {
  return <section className="panel pulse-panel">
    <div className="mini-heading"><div><span className="section-index">02</span><h2>World Pulse</h2></div><span className="live-label">LIVE</span></div>
    <div className="metric-grid">
      <Metric label="Population" value={formatCompact(snapshot.science_victory.total_population)} delta={`${snapshot.entities.length} agents`} bars={snapshot.science_victory.population_history} />
      <Metric label="Global GDP" value={snapshot.science_victory.total_economy.toFixed(1)} delta="aggregate index" bars={snapshot.science_victory.economy_history} />
      <Metric label="Carbon" value={`${snapshot.science_victory.carbon_ppm.toFixed(0)}ppm`} delta={`risk ${snapshot.science_victory.climate_risk.toFixed(1)}%`} danger bars={snapshot.overlay.carbon_history} />
      <Metric label="Biodiversity" value={snapshot.science_victory.biodiversity.toFixed(1)} delta={`sea ${(snapshot.overlay.sea_level * 100).toFixed(0)}%`} danger={snapshot.science_victory.biodiversity < 55} bars={snapshot.overlay.biodiversity_history} />
    </div>
    <div className="pulse-footer"><span>GEOLOGY</span><strong>{snapshot.geologic_stage}</strong><span>EXTINCTIONS</span><strong>{snapshot.extinction_events}</strong></div>
  </section>;
}

function ProgressPanel({ snapshot }: { snapshot: SimulationSnapshot }) {
  const science = snapshot.science_victory;
  const gap = Math.abs(science.leader_progress - science.runner_up_progress);
  return <section className="panel science-panel">
    <div className="mini-heading"><div><span className="section-index">04</span><h2>Science Victory</h2></div><span className={science.finished ? "victory-chip" : "live-label"}>{science.finished ? "ACHIEVED" : science.space_stage.toUpperCase()}</span></div>
    <div className="leader-progress"><div><small>MISSION LEADER</small><strong>{science.leader ?? "TBD"}</strong><span>{science.leader_progress.toFixed(1)} / {science.goal.toFixed(0)}</span></div><Progress value={science.leader_progress} max={science.goal} /></div>
    <SparkBars values={science.history} className="science-spark" />
    <div className="progress-meta"><span>Runner-up gap <b>{gap.toFixed(1)}p</b></span><span>Mars <b>{science.mars_progress.toFixed(1)}%</b></span><span>Jovian <b>{science.jovian_progress.toFixed(1)}%</b></span><span>Interstellar <b>{science.interstellar_progress.toFixed(1)}%</b></span></div>
  </section>;
}

function DiagnosticPanel({ snapshot }: { snapshot: SimulationSnapshot }) {
  const recentWars = snapshot.events.filter((event) => event.kind.type === "warfare").slice(-3).reverse();
  return <section className="panel diagnostic-panel">
    <div className="mini-heading"><div><span className="section-index">05</span><h2>War Theater</h2></div><span className="danger-label">{snapshot.combat_hexes.length} FRONTS</span></div>
    <div className="diagnostic-values">
      <div><small>WAR FATIGUE</small><strong>{snapshot.overlay.war_fatigue.toFixed(1)}</strong><SparkBars values={snapshot.overlay.war_fatigue_history} /></div>
      <div><small>FALLOUT</small><strong>{snapshot.overlay.fallout.toFixed(0)}</strong><span className="risk-track"><i style={{ width: `${Math.min(100, snapshot.overlay.fallout)}%` }} /></span></div>
      <div><small>RICHNESS</small><strong>{(snapshot.overlay.resource_richness * 100).toFixed(0)}%</strong><SparkBars values={snapshot.overlay.richness_history.map((value) => value * 100)} /></div>
    </div>
    <div className="battle-list">{recentWars.length ? recentWars.map((event, index) => <p key={`${event.tick}-${index}`}>{eventHeadline(event)}</p>) : <p>No recent battles — civilizations are pursuing science.</p>}</div>
  </section>;
}

function GloryPanel({ snapshot }: { snapshot: SimulationSnapshot }) {
  const scores = NATION_ORDER.map((nation) => {
    const metrics = snapshot.all_metrics[nation];
    return { nation, score: metrics.economy + metrics.science + metrics.culture + metrics.diplomacy + metrics.military + metrics.territory };
  }).sort((a, b) => b.score - a.score);
  return <section className="panel glory-panel">
    <div className="mini-heading"><div><span className="section-index">06</span><h2>Glory Leaderboard</h2></div><span className="live-label">POWER INDEX</span></div>
    <div className="glory-list">{scores.map((entry, index) => <div key={entry.nation}><b>{String(index + 1).padStart(2, "0")}</b><span style={{ color: NATION_INFO[entry.nation].color }}>{entry.nation}</span><Progress value={entry.score} max={scores[0].score} /><strong>{entry.score.toFixed(0)}</strong></div>)}</div>
  </section>;
}

function NationCard({ nation, metrics, civ, snapshot, selected, pinned, onPin }: { nation: Nation; metrics: NationMetrics; civ: SimulationSnapshot["civ_state"][Nation]; snapshot: SimulationSnapshot; selected: boolean; pinned: boolean; onPin(): void }) {
  const info = NATION_INFO[nation];
  const trust = snapshot.diplomacy.trust.find(([name]) => name === nation)?.[1] ?? 40;
  const fear = snapshot.diplomacy.fear.find(([name]) => name === nation)?.[1] ?? 35;
  const ideology = snapshot.overlay.ideology_leaning.find(([name]) => name === nation)?.[1] ?? 50;
  return <article className={`${selected ? "focused" : ""} ${metrics.is_destroyed ? "destroyed" : ""}`} style={{ "--nation": info.color } as React.CSSProperties}>
    <button className="nation-name" onClick={onPin} aria-label={`Pin ${nation}`}>
      <span>{info.code}</span><div><h3>{nation} {pinned ? "· PIN" : ""}</h3><p>{eraLabel(metrics.era)} · {civ.cities} cities</p></div><b>{formatCompact(metrics.population)}</b>
    </button>
    {metrics.is_destroyed ? <p className="destroyed-label">CIVILIZATION DESTROYED</p> : <>
      <Stat label="Economy" value={metrics.economy} /><Stat label="Science" value={metrics.science} /><Stat label="Culture" value={metrics.culture} /><Stat label="Military" value={metrics.military} /><Stat label="Territory" value={metrics.territory} />
      <div className="nation-foot"><span>Happy {civ.happiness.toFixed(0)}</span><span>Trust {trust.toFixed(0)}</span><span>Fear {fear.toFixed(0)}</span><span>Ideo {ideology.toFixed(0)}</span></div>
      <p className="tech-line">{metrics.unlocked_techs.map(humanize).join(" · ") || "No technologies"}</p>
    </>}
  </article>;
}

function ChartPanel({ snapshot }: { snapshot: SimulationSnapshot }) {
  return <section className="panel charts-panel">
    <div className="mini-heading"><div><span className="section-index">08</span><h2>Evolutionary Markets</h2></div><span className="live-label">120-TICK WINDOW</span></div>
    <div className="chart-grid">
      <Chart title="Moonshot Momentum" value={`${snapshot.science_victory.leader_progress.toFixed(1)}%`} values={snapshot.science_victory.history} />
      <Chart title="Climate Risk" value={`${snapshot.science_victory.climate_risk.toFixed(1)}%`} values={snapshot.overlay.climate_risk_history} danger />
      <Chart title="War Fatigue" value={snapshot.overlay.war_fatigue.toFixed(1)} values={snapshot.overlay.war_fatigue_history} danger />
      <Chart title="World Richness" value={`${(snapshot.overlay.resource_richness * 100).toFixed(0)}%`} values={snapshot.overlay.richness_history.map((value) => value * 100)} />
      <Chart title="Population" value={formatCompact(snapshot.science_victory.total_population)} values={snapshot.science_victory.population_history} />
      <Chart title="Carbon ppm" value={snapshot.science_victory.carbon_ppm.toFixed(0)} values={snapshot.overlay.carbon_history} danger />
    </div>
  </section>;
}

function EntityPanel({ snapshot }: { snapshot: SimulationSnapshot }) {
  return <section className="panel entity-panel">
    <div className="mini-heading"><div><span className="section-index">09</span><h2>Field Entities</h2></div><span className="live-label">{snapshot.entities.length} ACTIVE</span></div>
    <div className="entity-table"><div className="entity-head"><span>AGENT</span><span>FACTION</span><span>BIOME</span><span>BEHAVIOR</span><span>WEALTH</span><span>FAME</span></div>{snapshot.entities.map((entity) => <div key={entity.id}><strong>{entity.name}</strong><span>{entity.faction_label}</span><span>{entity.biome_label}</span><span>{entity.behavior_label}</span><b>{entity.wealth.toFixed(0)}</b><b>{entity.fame.toFixed(0)}</b></div>)}</div>
  </section>;
}

function EventRow({ event, pinned }: { event: WorldEvent; pinned: boolean }) {
  const category = eventCategory(event);
  return <article className={pinned ? "pinned" : ""}>
    <div className={`event-icon ${category.toLowerCase()}`}>{category.slice(0, 1)}</div>
    <div><span>{category} · TICK {event.tick}</span><p>{eventHeadline(event)}</p></div><time>{event.epoch}</time>
  </article>;
}

function Metric({ label, value, delta, bars, danger = false }: { label: string; value: string; delta: string; bars: number[]; danger?: boolean }) {
  return <div className="metric"><div><span>{label}</span><strong>{value}</strong><small className={danger ? "danger" : ""}>{delta}</small></div><SparkBars values={bars} /></div>;
}

function Chart({ title, value, values, danger = false }: { title: string; value: string; values: number[]; danger?: boolean }) {
  return <article className={danger ? "danger-chart" : ""}><div><span>{title}</span><strong>{value}</strong></div><SparkBars values={values} /></article>;
}

function SparkBars({ values, className = "" }: { values: number[]; className?: string }) {
  const windowed = values.slice(-42);
  const min = Math.min(...windowed, 0);
  const max = Math.max(...windowed, 1);
  return <div className={`spark-bars ${className}`}>{windowed.map((value, index) => <i key={index} style={{ height: `${Math.max(6, ((value - min) / Math.max(1, max - min)) * 100)}%` }} />)}</div>;
}

function Progress({ value, max }: { value: number; max: number }) {
  return <span className="progress-track"><i style={{ width: `${Math.min(100, Math.max(0, value / Math.max(1, max) * 100))}%` }} /></span>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="stat"><span>{label}</span><div><i style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div><strong>{value.toFixed(0)}</strong></div>;
}

function eventCategory(event: WorldEvent) {
  const categories: Record<WorldEvent["kind"]["type"], string> = { trade: "Trade", social: "Social", macro_shock: "Shock", warfare: "War", era_shift: "Era", science_progress: "Science", science_victory: "Science", interstellar_progress: "Space", interstellar_victory: "Space" };
  return categories[event.kind.type];
}

function eventHeadline(event: WorldEvent) {
  const kind = event.kind;
  const name = (value: unknown) => typeof value === "string" ? value : "Unknown";
  const number = (value: unknown) => typeof value === "number" ? value : 0;
  const actor = (value: unknown) => value && typeof value === "object" ? value as Record<string, unknown> : {};
  switch (kind.type) {
    case "trade": return `${name(actor(kind.actor).name)} coordinates ${name(kind.trade_focus)} trade · ${name(kind.market_pressure)}`;
    case "social": return `${name(actor(kind.convener).name)} hosts “${name(kind.gathering_theme)}” · ${name(kind.cohesion_level)}`;
    case "macro_shock": return `${name(kind.stressor)} · ${name(kind.catalyst)} · ${name(kind.projected_impact)}`;
    case "warfare": return `${name(kind.winner)} defeated ${name(kind.loser)} · ${formatCompact(number(kind.casualties))} casualties${kind.nuclear ? " · NUCLEAR" : ""}`;
    case "era_shift": return `${name(kind.nation)} entered ${eraLabel(name(kind.era))} · ${humanize(name(kind.weapon))}`;
    case "science_progress": return `${name(kind.nation)} moon project reached ${number(kind.progress).toFixed(1)}%`;
    case "science_victory": return `${name(kind.winner)} achieved the first moon landing`;
    case "interstellar_progress": return `${name(kind.leader)} interstellar migration reached ${number(kind.progress).toFixed(1)}%`;
    case "interstellar_victory": return `${name(kind.winner)} completed interstellar settlement`;
  }
}

function eventMatchesFilter(event: WorldEvent, filter: LogFilter) {
  if (filter === "All") return true;
  if (filter === "War") return event.kind.type === "warfare";
  if (filter === "Trade/Social") return event.kind.type === "trade" || event.kind.type === "social";
  if (filter === "Science/Space") return ["science_progress", "science_victory", "interstellar_progress", "interstellar_victory"].includes(event.kind.type);
  return ["era_shift", "macro_shock", "social"].includes(event.kind.type);
}

function eventInvolves(event: WorldEvent, nation: Nation) {
  const kind = event.kind;
  if ([kind.winner, kind.loser, kind.nation, kind.leader].includes(nation)) return true;
  const actor = kind.actor ?? kind.convener;
  return Boolean(actor && typeof actor === "object" && (actor as Record<string, unknown>).nation === nation);
}

function nextOverlay(current: MapOverlay): MapOverlay { return current === "Territory" ? "Climate" : current === "Climate" ? "Conflict" : "Territory"; }
function previousOverlay(current: MapOverlay): MapOverlay { return current === "Territory" ? "Conflict" : current === "Climate" ? "Territory" : "Climate"; }
function signed(value: number) { return value >= 0 ? `+${value}` : `${value}`; }
function humanize(value: string) { return value.replace(/([a-z])([A-Z])/g, "$1 $2"); }
function eraLabel(era: string) { return ({ Dawn: "Stone Age", Ancient: "Bronze Age", Classical: "Classical Era", Medieval: "Medieval Era", Industrial: "Industrial Era", Modern: "Modern Era", Nuclear: "Nuclear/Future" } as Record<string, string>)[era] ?? humanize(era); }
function formatYears(value: number) { return `${new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 }).format(value)} years`; }
