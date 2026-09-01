import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders Civilization Simulator metadata and loading handoff", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Civilization Simulator — Command Bridge<\/title>/i);
  assert.match(html, /CIVILIZATION SIMULATOR/);
  assert.match(html, /Waking the world/);
  assert.match(html, /original Rust simulation engine/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("ships the full Rust source and browser artifacts", async () => {
  const [page, engine, wasm] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../engine/src/lib.rs", import.meta.url), "utf8"),
    readFile(new URL("../public/wasm/civilization_simulator_engine_bg.wasm", import.meta.url)),
  ]);

  assert.match(page, /<WorldMap/);
  assert.match(page, /Signal Intelligence/);
  assert.match(page, /Science Victory/);
  assert.match(page, /Civilization Matrix/);
  assert.match(page, /Event Leaderboard/i);
  assert.match(page, /Event Density/);
  assert.match(page, /Pulse \/ Sentiment/);
  assert.match(page, /Sensor Grid \/ Pulseboard/);
  assert.match(page, /Hall of Fame/);
  assert.match(engine, /SimulationWorld/);
  assert.ok(wasm.byteLength > 500_000, "compiled engine should contain the Rust simulation");
  const systems = (await readdir(new URL("../engine/src/simulation/systems", import.meta.url)))
    .filter((name) => name.endsWith(".rs") && name !== "mod.rs")
    .sort();
  assert.deepEqual(systems, [
    "ai.rs", "blocs.rs", "civilization.rs", "climate.rs", "cosmic.rs", "cycles.rs",
    "demography.rs", "diplomacy.rs", "economy.rs", "environment.rs", "events.rs",
    "flood.rs", "ideology.rs", "logging.rs", "missions.rs", "movement.rs", "nuclear.rs",
    "peace.rs", "richness.rs", "security.rs", "supply.rs", "technology.rs", "territory.rs",
    "victory.rs", "warfare.rs", "warfatigue.rs",
  ]);
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
});

test("compiled Rust engine advances a complete world snapshot", async () => {
  const { default: init, SimulationEngine } = await import("../public/wasm/civilization_simulator_engine.js");
  const bytes = await readFile(new URL("../public/wasm/civilization_simulator_engine_bg.wasm", import.meta.url));
  await init({ module_or_path: bytes });
  const engine = new SimulationEngine(24);
  try {
    engine.tick(24);
    const snapshot = JSON.parse(engine.snapshot_json());
    assert.equal(snapshot.tick, 25);
    assert.ok(snapshot.grid.hexes.length > 1_000);
    assert.deepEqual(Object.keys(snapshot.all_metrics).sort(), ["Aqua", "Luna", "Solar", "Sora", "Tera"]);
    assert.ok(snapshot.events.length > 0);
    assert.ok(snapshot.science_victory.total_population > 0);
    assert.ok(snapshot.overlay.carbon_history.length > 1);
    assert.equal(snapshot.timescale_years_per_tick, 1_000_000);

    engine.set_timescale(20_000_000);
    engine.tick(1);
    const accelerated = JSON.parse(engine.snapshot_json());
    assert.equal(accelerated.timescale_years_per_tick, 20_000_000);
    assert.ok(accelerated.cosmic_age_years > snapshot.cosmic_age_years);

    engine.reset();
    const reset = JSON.parse(engine.snapshot_json());
    assert.equal(reset.tick, 1);
    assert.equal(reset.timescale_years_per_tick, 1_000_000);
    assert.equal(reset.grid.radius, 24);
  } finally {
    engine.free();
  }
});
