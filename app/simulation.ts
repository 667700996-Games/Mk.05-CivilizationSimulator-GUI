"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Nation = "Tera" | "Sora" | "Aqua" | "Solar" | "Luna";
export type AxialCoord = { q: number; r: number };

export type NationMetrics = {
  economy: number;
  science: number;
  culture: number;
  diplomacy: number;
  religion: number;
  military: number;
  territory: number;
  is_destroyed: boolean;
  era: string;
  weapon_tier: string;
  unlocked_techs: string[];
  population: number;
  youth: number;
  adult: number;
  elder: number;
  productivity: number;
  unemployment: number;
};

export type CivilizationState = {
  cities: number;
  happiness: number;
  stability: number;
  production: number;
};

export type WorldEventKind = {
  type: "trade" | "social" | "macro_shock" | "warfare" | "era_shift" | "science_progress" | "science_victory" | "interstellar_progress" | "interstellar_victory";
  [key: string]: unknown;
};

export type WorldEvent = {
  tick: number;
  epoch: string;
  season: string;
  kind: WorldEventKind;
};

export type SimulationSnapshot = {
  tick: number;
  epoch: string;
  season: string;
  cosmic_age_years: number;
  timescale_years_per_tick: number;
  geologic_stage: string;
  extinction_events: number;
  season_effect: {
    label: string;
    temperature: number;
    morale_shift: number;
    yield_shift: number;
    risk_shift: number;
  };
  all_metrics: Record<Nation, NationMetrics>;
  civ_state: Record<Nation, CivilizationState>;
  grid: { radius: number; hexes: Array<AxialCoord & { owner: Nation }> };
  overlay: {
    war_fatigue: number;
    fallout: number;
    resource_richness: number;
    war_fatigue_history: number[];
    richness_history: number[];
    carbon_history: number[];
    climate_risk_history: number[];
    biodiversity_history: number[];
    sea_level: number;
    ice_line: number;
    ideology_leaning: Array<[Nation, number]>;
    ideology_cohesion: Array<[Nation, number]>;
    ideology_volatility: Array<[Nation, number]>;
  };
  diplomacy: {
    trust: Array<[Nation, number]>;
    fear: Array<[Nation, number]>;
    alliances: Array<[Nation, Nation]>;
    sanctions: Array<[Nation, Nation]>;
  };
  science_victory: {
    leader: Nation | null;
    leader_progress: number;
    runner_up_progress: number;
    history: number[];
    goal: number;
    finished: boolean;
    winner: Nation | null;
    interstellar_mode: boolean;
    interstellar_progress: number;
    interstellar_goal: number;
    carbon_ppm: number;
    climate_risk: number;
    biodiversity: number;
    space_stage: string;
    mars_progress: number;
    mars_goal: number;
    jovian_progress: number;
    jovian_goal: number;
    total_population: number;
    total_economy: number;
    population_history: number[];
    economy_history: number[];
  };
  entities: Array<{
    id: number;
    name: string;
    faction_label: string;
    biome_label: string;
    behavior_label: string;
    currency: number;
    wealth: number;
    fame: number;
  }>;
  events: WorldEvent[];
  combat_hexes: AxialCoord[];
  nuclear_hexes: AxialCoord[];
};

type Engine = {
  tick(steps: number): void;
  set_timescale(yearsPerTick: number): void;
  reset(): void;
  snapshot_json(): string;
  free(): void;
};

type EngineModule = {
  default(input?: unknown): Promise<unknown>;
  SimulationEngine: new (gridRadius: number) => Engine;
};

declare global {
  interface Window {
    __civilizationEngineModule?: EngineModule;
  }
}

let engineModulePromise: Promise<EngineModule> | null = null;
let engineInitializationPromise: Promise<unknown> | null = null;

function loadEngineModule() {
  if (window.__civilizationEngineModule) return Promise.resolve(window.__civilizationEngineModule);
  if (engineModulePromise) return engineModulePromise;
  engineModulePromise = new Promise<EngineModule>((resolve, reject) => {
    const script = document.createElement("script");
    script.type = "module";
    script.src = "/wasm/engine-loader.js";
    script.dataset.civilizationEngine = "true";
    script.onload = () => {
      if (window.__civilizationEngineModule) resolve(window.__civilizationEngineModule);
      else reject(new Error("The Rust engine loader finished without registering its module."));
    };
    script.onerror = () => reject(new Error("The Rust engine module could not be downloaded."));
    document.head.appendChild(script);
  });
  return engineModulePromise;
}

function initializeEngineModule(engineModule: EngineModule) {
  engineInitializationPromise ??= engineModule.default();
  return engineInitializationPromise;
}

export const SPEED_PRESETS = [
  { key: "1", label: "Chronicle", intent: "Leisurely observe", tickMs: 1600, yearsPerTick: 250_000 },
  { key: "2", label: "Standard", intent: "Balanced flow", tickMs: 1000, yearsPerTick: 1_000_000 },
  { key: "3", label: "Hyperdrive", intent: "Rapid advance", tickMs: 400, yearsPerTick: 5_000_000 },
  { key: "4", label: "Singularity", intent: "Cosmic sprint", tickMs: 120, yearsPerTick: 20_000_000 },
] as const;

export function useSimulation() {
  const engineRef = useRef<Engine | null>(null);
  const [snapshot, setSnapshot] = useState<SimulationSnapshot | null>(null);
  const [running, setRunning] = useState(true);
  const [presetKey, setPresetKey] = useState<string>("2");
  const [tickMs, setTickMs] = useState(1000);
  const [yearsPerTick, setYearsPerTick] = useState(1_000_000);
  const [error, setError] = useState<string | null>(null);

  const readSnapshot = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    setSnapshot(JSON.parse(engine.snapshot_json()) as SimulationSnapshot);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let ownedEngine: Engine | null = null;
    async function start() {
      try {
        const engineModule = await loadEngineModule();
        await initializeEngineModule(engineModule);
        if (cancelled) return;
        ownedEngine = new engineModule.SimulationEngine(24);
        engineRef.current = ownedEngine;
        readSnapshot();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The Rust simulation engine could not start.");
      }
    }
    void start();
    return () => {
      cancelled = true;
      if (ownedEngine) ownedEngine.free();
      if (engineRef.current === ownedEngine) engineRef.current = null;
    };
  }, [readSnapshot]);

  const engineReady = snapshot !== null;

  useEffect(() => {
    if (!running || !engineRef.current) return;
    const timer = window.setInterval(() => {
      engineRef.current?.tick(1);
      readSnapshot();
    }, tickMs);
    return () => window.clearInterval(timer);
  }, [engineReady, readSnapshot, running, tickMs]);

  const applyPreset = useCallback((key: string) => {
    const preset = SPEED_PRESETS.find((candidate) => candidate.key === key);
    if (!preset) return;
    setPresetKey(key);
    setTickMs(preset.tickMs);
    setYearsPerTick(preset.yearsPerTick);
    engineRef.current?.set_timescale(preset.yearsPerTick);
    setRunning(true);
    readSnapshot();
  }, [readSnapshot]);

  const adjustPace = useCallback((faster: boolean) => {
    setPresetKey("");
    setTickMs((current) => Math.max(16, Math.min(6400, faster ? Math.floor(current / 2) : current * 2)));
  }, []);

  const adjustTimescale = useCallback((faster: boolean) => {
    setPresetKey("");
    setYearsPerTick((current) => {
      const next = Math.max(1_000, Math.min(50_000_000_000, faster ? current * 2 : current / 2));
      engineRef.current?.set_timescale(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    engineRef.current?.set_timescale(1_000_000);
    setPresetKey("2");
    setTickMs(1000);
    setYearsPerTick(1_000_000);
    setRunning(true);
    readSnapshot();
  }, [readSnapshot]);

  const newWorld = useCallback(() => {
    engineRef.current?.reset();
    engineRef.current?.set_timescale(1_000_000);
    setPresetKey("2");
    setTickMs(1000);
    setYearsPerTick(1_000_000);
    setRunning(true);
    readSnapshot();
  }, [readSnapshot]);

  const step = useCallback(() => {
    setRunning(false);
    engineRef.current?.tick(1);
    readSnapshot();
  }, [readSnapshot]);

  return {
    snapshot,
    error,
    running,
    setRunning,
    presetKey,
    tickMs,
    yearsPerTick,
    applyPreset,
    adjustPace,
    adjustTimescale,
    reset,
    newWorld,
    step,
  };
}

export function formatCompact(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

export function coordKey(coord: AxialCoord) {
  return `${coord.q},${coord.r}`;
}
