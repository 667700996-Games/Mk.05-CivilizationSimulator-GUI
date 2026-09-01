# Civilization Simulator GUI

A React command bridge for the Rust civilization simulator from
[`Mk.04-CivilizationSimulator-TUI`](https://github.com/667700996-Games/Mk.04-CivilizationSimulator-TUI).

The 27 original simulation systems run in the browser as WebAssembly. React is
responsible only for rendering, controls, filtering, charts, and the interactive
hex map, so the economy, climate, warfare, diplomacy, technology, demography,
cosmic timeline, and victory behavior remain driven by the Rust model.

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
- `R`: reset the world

Every control is also available as an on-screen button. The map supports mouse,
touch, and keyboard selection.

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
npm test
```

This builds the site, checks server-rendered metadata and product content, then
runs the compiled Rust engine and verifies a live world snapshot.
