"use client";

import { useMemo, useState } from "react";

type Overlay = "Territory" | "Climate" | "Conflict";

const speedPresets = [
  { key: "1", label: "Chronicle", years: "250K" },
  { key: "2", label: "Standard", years: "1M" },
  { key: "3", label: "Hyperdrive", years: "5M" },
  { key: "4", label: "Singularity", years: "20M" },
];

const nations = [
  { name: "Aurelia", code: "AU", color: "#36d6af", economy: 72, science: 63, military: 48 },
  { name: "Vesper", code: "VE", color: "#ff6b88", economy: 58, science: 76, military: 67 },
  { name: "Caelum", code: "CA", color: "#65a6ff", economy: 66, science: 55, military: 81 },
  { name: "Solis", code: "SO", color: "#ffc35a", economy: 81, science: 49, military: 42 },
];

const eventFeed = [
  { kind: "DIPLOMACY", text: "Aurelia and Solis ratified an open research accord.", time: "12s" },
  { kind: "CLIMATE", text: "Coastal pressure is rising across the Vesper basin.", time: "29s" },
  { kind: "SCIENCE", text: "Caelum completed an orbital materials breakthrough.", time: "44s" },
  { kind: "TRADE", text: "Intercontinental output reached a new seasonal high.", time: "1m" },
];

export default function Home() {
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState("2");
  const [overlay, setOverlay] = useState<Overlay>("Territory");
  const [selected, setSelected] = useState(38);
  const cells = useMemo(
    () => Array.from({ length: 84 }, (_, index) => ({ index, nation: nations[(index * 7 + Math.floor(index / 9)) % nations.length] })),
    [],
  );
  const selectedNation = cells[selected]?.nation ?? nations[0];

  return (
    <main className="command-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark">CS</span>
          <div><p className="eyebrow">CIVILIZATION SIMULATOR</p><h1>Command Bridge</h1></div>
        </div>
        <div className="epoch-readout">
          <span className="status-dot" />
          <div><small>EPOCH 27</small><strong>Stellar Spring</strong></div>
          <div><small>COSMIC AGE</small><strong>2.71e8 years</strong></div>
        </div>
        <div className="world-health">
          <span>WORLD SIGNAL</span><strong>STABLE</strong>
          <div className="signal-bars"><i /><i /><i /><i /></div>
        </div>
      </header>

      <section className="control-deck" aria-label="Simulation controls">
        <button className="play-button" onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause simulation" : "Play simulation"}>
          <span>{playing ? "Ⅱ" : "▶"}</span>{playing ? "PAUSE" : "RESUME"}
        </button>
        <div className="speed-group">
          {speedPresets.map((preset) => (
            <button key={preset.key} className={speed === preset.key ? "active" : ""} onClick={() => setSpeed(preset.key)}>
              <span>{preset.key}</span><strong>{preset.label}</strong><small>{preset.years} yrs/tick</small>
            </button>
          ))}
        </div>
        <div className="season-effect">
          <span>SEASON EFFECT</span><strong>+8.2% Yield</strong><small>Morale +3.4 · Risk −1.8</small>
        </div>
      </section>

      <section className="workspace">
        <div className="map-panel panel">
          <div className="panel-heading">
            <div><span className="section-index">01</span><div><p>WORLD THEATER</p><h2>Territorial Observatory</h2></div></div>
            <div className="segmented" role="group" aria-label="Map overlay">
              {(["Territory", "Climate", "Conflict"] as Overlay[]).map((item) => (
                <button key={item} className={overlay === item ? "active" : ""} onClick={() => setOverlay(item)}>{item}</button>
              ))}
            </div>
          </div>
          <div className={`hex-map overlay-${overlay.toLowerCase()}`}>
            <div className="map-grid" aria-label={`${overlay} map`}>
              {cells.map((cell) => (
                <button
                  key={cell.index}
                  className={`hex-cell ${selected === cell.index ? "selected" : ""}`}
                  style={{ "--nation": cell.nation.color, "--pulse": `${(cell.index % 7) / 10}` } as React.CSSProperties}
                  onClick={() => setSelected(cell.index)}
                  aria-label={`Select ${cell.nation.name} territory ${cell.index + 1}`}
                >
                  {cell.index % 13 === 0 ? <span>{cell.nation.code}</span> : null}
                </button>
              ))}
            </div>
            <div className="map-scanline" />
            <div className="map-legend">
              {nations.map((nation) => <span key={nation.name}><i style={{ background: nation.color }} />{nation.name}</span>)}
            </div>
          </div>
          <div className="selection-strip">
            <div><small>SELECTED HEX</small><strong>q: +3 · r: −7</strong></div>
            <div><small>SOVEREIGNTY</small><strong style={{ color: selectedNation.color }}>{selectedNation.name}</strong></div>
            <div><small>TERRAIN</small><strong>Temperate basin</strong></div>
            <div><small>FRONT STATUS</small><strong className="safe">SECURE</strong></div>
          </div>
        </div>

        <aside className="side-stack">
          <section className="panel pulse-panel">
            <div className="mini-heading"><div><span className="section-index">02</span><h2>World Pulse</h2></div><span className="live-label">LIVE</span></div>
            <div className="metric-grid">
              <Metric label="Population" value="8.74B" delta="+1.2%" bars={[36, 44, 42, 55, 51, 63, 72, 78]} />
              <Metric label="Global GDP" value="132.6T" delta="+3.8%" bars={[30, 34, 41, 46, 54, 52, 66, 74]} />
              <Metric label="Carbon" value="418ppm" delta="+0.4" danger bars={[44, 46, 48, 52, 57, 60, 63, 67]} />
              <Metric label="Biodiversity" value="72.1" delta="−0.7" danger bars={[78, 76, 76, 73, 72, 70, 69, 66]} />
            </div>
          </section>
          <section className="panel event-panel">
            <div className="mini-heading"><div><span className="section-index">03</span><h2>Signal Intelligence</h2></div><button>ALL EVENTS</button></div>
            <div className="events">
              {eventFeed.map((event) => (
                <article key={event.text}>
                  <div className={`event-icon ${event.kind.toLowerCase()}`}>{event.kind.slice(0, 1)}</div>
                  <div><span>{event.kind}</span><p>{event.text}</p></div><time>{event.time}</time>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </section>

      <section className="civilizations panel">
        <div className="panel-heading compact"><div><span className="section-index">04</span><div><p>GLOBAL PORTFOLIO</p><h2>Civilization Matrix</h2></div></div><span className="keyboard-hint">Select a territory to focus · Space pause · 1—4 speed</span></div>
        <div className="nation-row">
          {nations.map((nation) => (
            <article key={nation.name} className={nation.name === selectedNation.name ? "focused" : ""} style={{ "--nation": nation.color } as React.CSSProperties}>
              <div className="nation-name"><span>{nation.code}</span><div><h3>{nation.name}</h3><p>Industrial Age · 6 cities</p></div><b>{nation.economy + nation.science + nation.military}</b></div>
              <Stat label="Economy" value={nation.economy} /><Stat label="Science" value={nation.science} /><Stat label="Military" value={nation.military} />
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, delta, bars, danger = false }: { label: string; value: string; delta: string; bars: number[]; danger?: boolean }) {
  return <div className="metric"><div><span>{label}</span><strong>{value}</strong><small className={danger ? "danger" : ""}>{delta}</small></div><div className="spark-bars">{bars.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div></div>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="stat"><span>{label}</span><div><i style={{ width: `${value}%` }} /></div><strong>{value}</strong></div>;
}
