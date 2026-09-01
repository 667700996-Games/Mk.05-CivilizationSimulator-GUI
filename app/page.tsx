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
type EventCategory = "War" | "Trade" | "Social" | "MacroShock" | "Science" | "Space" | "Era";

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

  const activeSelected = useMemo(() => {
    if (selected || !snapshot?.grid.hexes.length) return selected;
    const center = snapshot.grid.hexes.find((hex) => hex.q === 0 && hex.r === 0) ?? snapshot.grid.hexes[0];
    return { q: center.q, r: center.r };
  }, [selected, snapshot]);

  const selectedOwner = useMemo(() => {
    if (!snapshot || !activeSelected) return null;
    return snapshot.grid.hexes.find((hex) => coordKey(hex) === coordKey(activeSelected))?.owner ?? null;
  }, [activeSelected, snapshot]);

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
  const selectedIsCombat = activeSelected ? snapshot.combat_hexes.some((coord) => coordKey(coord) === coordKey(activeSelected)) : false;
  const selectedIsNuclear = activeSelected ? snapshot.nuclear_hexes.some((coord) => coordKey(coord) === coordKey(activeSelected)) : false;

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
      <DiagnosticStrip snapshot={snapshot} logFilter={logFilter} pinnedNation={pinnedNation} />

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
            <WorldMap snapshot={snapshot} overlay={overlay} selected={activeSelected} focus={focusNation} onSelect={setSelected} />
            <div className="map-scanline" />
            <div className="map-legend">
              {NATION_ORDER.map((nation) => <span key={nation}><i style={{ background: NATION_INFO[nation].color }} />{nation}</span>)}
              <span className="legend-alert">✸ FRONT · ◎ NUKE</span>
            </div>
          </div>
          <div className="selection-strip">
            <div><small>SELECTED HEX</small><strong>{activeSelected ? `q: ${signed(activeSelected.q)} · r: ${signed(activeSelected.r)}` : "None"}</strong></div>
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
            <EventLeaderboard snapshot={snapshot} />
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

      <SensorPanel snapshot={snapshot} />

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

function DiagnosticStrip({ snapshot, logFilter, pinnedNation }: { snapshot: SimulationSnapshot; logFilter: LogFilter; pinnedNation: Nation | null }) {
  const warTrend = latestDelta(snapshot.overlay.war_fatigue_history);
  const carbonTrend = latestDelta(snapshot.overlay.carbon_history);
  const popTrend = latestDelta(snapshot.science_victory.population_history);
  return <div className="diagnostic-strip" aria-label="Simulation diagnostics">
    <span>LOG <b>{logFilter}</b></span>
    <span>PIN <b>{pinnedNation ?? "None"}</b></span>
    <span className={warTrend > 0 ? "danger" : "safe"}>WAR Δ <b>{signedDecimal(warTrend, 2)}</b></span>
    <span>CO₂ Δ <b>{signedDecimal(carbonTrend, 1)}</b></span>
    <span className={popTrend < 0 ? "danger" : "safe"}>POP Δ <b>{signedInteger(popTrend)}</b></span>
  </div>;
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
  const population = NATION_ORDER.slice().sort((a, b) => snapshot.all_metrics[b].population - snapshot.all_metrics[a].population)[0];
  const economy = NATION_ORDER.slice().sort((a, b) => snapshot.all_metrics[b].economy - snapshot.all_metrics[a].economy)[0];
  const warWins = new Map<Nation, number>();
  snapshot.events.slice(-200).forEach((event) => {
    if (event.kind.type !== "warfare" || !isNation(event.kind.winner)) return;
    warWins.set(event.kind.winner, (warWins.get(event.kind.winner) ?? 0) + 1);
  });
  const warChampion = NATION_ORDER.slice().sort((a, b) => (warWins.get(b) ?? 0) - (warWins.get(a) ?? 0))[0];
  const cards = [
    { label: "Population Peak", nation: population, value: formatCompact(snapshot.all_metrics[population].population) },
    { label: "Economic Hegemon", nation: economy, value: snapshot.all_metrics[economy].economy.toFixed(1) },
    { label: "Science Leader", nation: snapshot.science_victory.leader, value: `${snapshot.science_victory.leader_progress.toFixed(1)}% Moon` },
    { label: "War Win Rate", nation: (warWins.get(warChampion) ?? 0) > 0 ? warChampion : null, value: (warWins.get(warChampion) ?? 0) > 0 ? `${warWins.get(warChampion)} Wins` : "Peace" },
  ];
  return <section className="panel glory-panel">
    <div className="mini-heading"><div><span className="section-index">06</span><h2>Hall of Fame</h2></div><span className="live-label">WORLD RECORDS</span></div>
    <div className="fame-grid">{cards.map((card) => <div key={card.label}><small>{card.label}</small><strong style={{ color: card.nation ? NATION_INFO[card.nation].color : undefined }}>{card.nation ?? "TBD"}</strong><span>{card.value}</span></div>)}</div>
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
      <div className="nation-doctrine"><span>{humanize(metrics.weapon_tier)}</span><span>Production {civ.production.toFixed(0)}</span></div>
      <Stat label="Economy" value={metrics.economy} /><Stat label="Science" value={metrics.science} /><Stat label="Culture" value={metrics.culture} /><Stat label="Diplomacy" value={metrics.diplomacy} /><Stat label="Religion" value={metrics.religion} /><Stat label="Military" value={metrics.military} /><Stat label="Territory" value={metrics.territory} />
      <div className="nation-foot"><span>Happy {civ.happiness.toFixed(0)}</span><span>Stable {civ.stability.toFixed(0)}</span><span>Trust {trust.toFixed(0)}</span><span>Fear {fear.toFixed(0)}</span><span>Ideo {ideology.toFixed(0)}</span><span>Jobs {(100 - metrics.unemployment).toFixed(0)}%</span></div>
      <p className="tech-line">{metrics.unlocked_techs.map(humanize).join(" · ") || "No technologies"}</p>
    </>}
  </article>;
}

function ChartPanel({ snapshot }: { snapshot: SimulationSnapshot }) {
  const eventDensity = buildEventDensitySeries(snapshot.events, snapshot.tick, 42);
  const sentiment = buildSentimentSeries(snapshot.events, snapshot.tick, 42);
  return <section className="panel charts-panel">
    <div className="mini-heading"><div><span className="section-index">08</span><h2>Evolutionary Markets</h2></div><span className="live-label">120-TICK WINDOW</span></div>
    <div className="chart-grid">
      <Chart title="Moonshot Momentum" value={`${snapshot.science_victory.leader_progress.toFixed(1)}%`} values={snapshot.science_victory.history} />
      <Chart title="Carbon ppm" value={snapshot.science_victory.carbon_ppm.toFixed(0)} values={snapshot.overlay.carbon_history} danger />
      <Chart title="Biodiversity" value={snapshot.science_victory.biodiversity.toFixed(1)} values={snapshot.overlay.biodiversity_history} />
      <Chart title="Climate Risk" value={`${snapshot.science_victory.climate_risk.toFixed(1)}%`} values={snapshot.overlay.climate_risk_history} danger />
      <Chart title="War Fatigue" value={snapshot.overlay.war_fatigue.toFixed(1)} values={snapshot.overlay.war_fatigue_history} danger />
      <Chart title="World Richness" value={`${(snapshot.overlay.resource_richness * 100).toFixed(0)}%`} values={snapshot.overlay.richness_history.map((value) => value * 100)} />
      <Chart title="Event Density" value={`${snapshot.events.length} events`} values={eventDensity} />
      <Chart title="Pulse / Sentiment" value={sentimentLabel(sentiment)} values={sentiment} />
      <Chart title="Civilization Pop" value={formatCompact(snapshot.science_victory.total_population)} values={snapshot.science_victory.population_history} />
    </div>
  </section>;
}

function EntityPanel({ snapshot }: { snapshot: SimulationSnapshot }) {
  return <section className="panel entity-panel">
    <div className="mini-heading"><div><span className="section-index">09</span><h2>Field Entities</h2></div><span className="live-label">{snapshot.entities.length} ACTIVE</span></div>
    <div className="entity-table"><div className="entity-head"><span>AGENT</span><span>FACTION</span><span>BIOME</span><span>BEHAVIOR</span><span>WEALTH</span><span>FAME</span></div>{snapshot.entities.map((entity) => <div key={entity.id}><strong>{entity.name}</strong><span>{entity.faction_label}</span><span>{entity.biome_label}</span><span>{entity.behavior_label}</span><b>{entity.wealth.toFixed(0)}</b><b>{entity.fame.toFixed(0)}</b></div>)}</div>
  </section>;
}

function SensorPanel({ snapshot }: { snapshot: SimulationSnapshot }) {
  return <section className="panel sensor-panel">
    <div className="mini-heading"><div><span className="section-index">10</span><h2>Sensor Grid / Pulseboard</h2></div><span className="live-label">FIVE-NATION COMPARISON</span></div>
    <div className="sensor-columns">
      <NationMetricBars title="Economy" snapshot={snapshot} metric="economy" />
      <NationMetricBars title="Military" snapshot={snapshot} metric="military" danger />
      <NationMetricBars title="Science" snapshot={snapshot} metric="science" />
    </div>
  </section>;
}

function NationMetricBars({ title, snapshot, metric, danger = false }: { title: string; snapshot: SimulationSnapshot; metric: "economy" | "military" | "science"; danger?: boolean }) {
  const entries = NATION_ORDER.map((nation) => ({ nation, value: snapshot.all_metrics[nation][metric] })).sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...entries.map((entry) => entry.value));
  return <div className={danger ? "sensor-lane danger" : "sensor-lane"}><h3>{title}</h3>{entries.map((entry) => <div key={entry.nation}><span style={{ color: NATION_INFO[entry.nation].color }}>{NATION_INFO[entry.nation].code}</span><i><b style={{ width: `${Math.max(2, entry.value / max * 100)}%`, background: NATION_INFO[entry.nation].color }} /></i><strong>{entry.value.toFixed(0)}</strong></div>)}</div>;
}

function EventLeaderboard({ snapshot }: { snapshot: SimulationSnapshot }) {
  const categories: EventCategory[] = ["War", "Trade", "Social", "MacroShock", "Science", "Space", "Era"];
  const analytics = categories.map((category) => {
    const matches = snapshot.events.slice(-120).filter((event) => eventCategory(event) === category);
    const recent = snapshot.events.slice(-20).filter((event) => eventCategory(event) === category).length;
    const sentiment = matches.reduce((score, event) => score + eventSentiment(event), 0);
    const casualties = matches.reduce((total, event) => total + eventCasualties(event), 0);
    return { category, count: matches.length, recent, sentiment, casualties };
  });
  const total = Math.max(1, analytics.reduce((sum, entry) => sum + entry.count, 0));
  return <div className="event-leaderboard" aria-label="Event leaderboard">
    <div className="event-leader-head"><span>TYPE</span><span>COUNT</span><span>RECENT20</span><span>SENT.</span><span>CASUALTIES</span><span>SHARE</span></div>
    {analytics.map((entry) => <div key={entry.category}><strong>{entry.category}</strong><span>{entry.count}</span><span>{entry.recent}</span><span className={entry.sentiment < 0 ? "danger" : "safe"}>{entry.sentiment}</span><span>{formatCompact(entry.casualties)}</span><span>{(entry.count / total * 100).toFixed(1)}%</span></div>)}
  </div>;
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

function eventCategory(event: WorldEvent): EventCategory {
  const categories: Record<WorldEvent["kind"]["type"], EventCategory> = { trade: "Trade", social: "Social", macro_shock: "MacroShock", warfare: "War", era_shift: "Era", science_progress: "Science", science_victory: "Science", interstellar_progress: "Space", interstellar_victory: "Space" };
  return categories[event.kind.type];
}

function eventSentiment(event: WorldEvent) {
  if (event.kind.type === "macro_shock" || event.kind.type === "warfare") return -2;
  return 1;
}

function eventCasualties(event: WorldEvent) {
  if (event.kind.type !== "warfare" && event.kind.type !== "macro_shock") return 0;
  return typeof event.kind.casualties === "number" ? event.kind.casualties : 0;
}

function buildEventDensitySeries(events: WorldEvent[], lastTick: number, buckets: number) {
  const bucketSize = Math.max(1, Math.ceil((lastTick + 1) / buckets));
  const series = Array.from({ length: buckets }, () => 0);
  events.forEach((event) => { series[Math.min(buckets - 1, Math.floor(event.tick / bucketSize))] += 1; });
  if (series.every((value) => value === 0)) series[0] = 1;
  return series;
}

function buildSentimentSeries(events: WorldEvent[], lastTick: number, buckets: number) {
  const bucketSize = Math.max(1, Math.ceil((lastTick + 1) / buckets));
  const raw = Array.from({ length: buckets }, () => 0);
  events.forEach((event) => {
    const index = Math.min(buckets - 1, Math.floor(event.tick / bucketSize));
    const kind = event.kind.type;
    raw[index] += kind === "macro_shock" || kind === "warfare" ? -2 : kind === "science_victory" || kind === "interstellar_victory" ? 3 : kind === "science_progress" || kind === "interstellar_progress" || kind === "era_shift" ? 2 : 1;
  });
  const offset = Math.max(0, -Math.min(...raw));
  const shifted = raw.map((value) => value + offset);
  if (shifted.every((value) => value === 0)) shifted[0] = 1;
  return shifted;
}

function sentimentLabel(values: number[]) {
  const recent = values.slice(-5);
  const average = recent.reduce((sum, value) => sum + value, 0) / Math.max(1, recent.length);
  return average > 2 ? "POSITIVE" : average < 1 ? "STRESSED" : "NEUTRAL";
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

function isNation(value: unknown): value is Nation { return typeof value === "string" && NATION_ORDER.includes(value as Nation); }
function latestDelta(values: number[]) { return values.length > 1 ? values[values.length - 1] - values[values.length - 2] : 0; }
function signedDecimal(value: number, digits: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`; }
function signedInteger(value: number) { return `${value >= 0 ? "+" : ""}${Math.round(value).toLocaleString("en-US")}`; }

function nextOverlay(current: MapOverlay): MapOverlay { return current === "Territory" ? "Climate" : current === "Climate" ? "Conflict" : "Territory"; }
function previousOverlay(current: MapOverlay): MapOverlay { return current === "Territory" ? "Conflict" : current === "Climate" ? "Territory" : "Climate"; }
function signed(value: number) { return value >= 0 ? `+${value}` : `${value}`; }
function humanize(value: string) { return value.replace(/([a-z])([A-Z])/g, "$1 $2"); }
function eraLabel(era: string) { return ({ Dawn: "Stone Age", Ancient: "Bronze Age", Classical: "Classical Era", Medieval: "Medieval Era", Industrial: "Industrial Era", Modern: "Modern Era", Nuclear: "Nuclear/Future" } as Record<string, string>)[era] ?? humanize(era); }
function formatYears(value: number) { return `${new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 }).format(value)} years`; }
