# Civilization Simulator GUI

A React command bridge for the Rust civilization simulator from
[`Mk.04-CivilizationSimulator-TUI`](https://github.com/667700996-Games/Mk.04-CivilizationSimulator-TUI).

All 26 original system modules plus the world, grid, resources, observer, event,
technology, nation, and bloc cores run in the browser as WebAssembly. React is
responsible only for rendering, controls, filtering, charts, and the interactive
hex map, so the economy, climate, warfare, diplomacy, technology, demography,
cosmic timeline, and victory behavior remain driven by the Rust model.

The GUI preserves the TUI command deck, three map overlays, hex selection and
nation focus, SIGINT filters and leaderboard, science/space victory telemetry,
war theater, hall of fame, civilization matrix, evolutionary charts, pulseboard,
and entity roster.

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Controls

- `Space` / `P`: pause or resume
- `1`–`4`: Chronicle, Standard, Hyperdrive, Singularity presets
- `+` / `-`: change real-time tick pace
- `<` / `>`: change simulated years per tick
- `[` / `]`: cycle Territory, Climate, and Conflict overlays
- `F`: cycle intelligence filters
- `G`: toggle the pinned-nation event filter
- `C`: pin the selected nation
- `V`: toggle map focus mode
- `R`: restore Standard pace and timescale without replacing the world

Every control is also available as an on-screen button. The map supports mouse,
touch, and keyboard selection. Use `NEW WORLD` when a fresh simulation is
required.

## Rebuild the Rust engine

The compiled browser artifacts are committed under `public/wasm`, so ordinary
web development does not require Rust. To rebuild them, install the
`wasm32-unknown-unknown` target and a `wasm-bindgen-cli` compatible with the
pinned crate version, then run:

```bash
npm run engine:build
```

## Verify

```bash
npm run lint
npm test
```

This builds the site, checks server-rendered metadata and product content, then
runs the compiled Rust engine and verifies ticking, timescale changes, reset,
all five civilizations, the complete system module set, and a live world
snapshot.
