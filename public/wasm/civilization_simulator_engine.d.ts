/* tslint:disable */
/* eslint-disable */
/**
 * Browser-facing wrapper around the original Rust TUI simulation.
 * The simulation systems are intentionally shared verbatim with Mk.04;
 * only the rendering and control surface are supplied by React.
 */
export class SimulationEngine {
  free(): void;
  constructor(grid_radius: number);
  tick(steps: number): void;
  set_timescale(years_per_tick: number): void;
  reset(): void;
  snapshot_json(): string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_simulationengine_free: (a: number, b: number) => void;
  readonly simulationengine_new: (a: number) => number;
  readonly simulationengine_tick: (a: number, b: number) => void;
  readonly simulationengine_set_timescale: (a: number, b: number) => void;
  readonly simulationengine_reset: (a: number) => void;
  readonly simulationengine_snapshot_json: (a: number) => [number, number];
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_export_2: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
