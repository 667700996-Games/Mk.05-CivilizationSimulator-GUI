use std::sync::{Arc, RwLock};
use std::time::Duration;

use wasm_bindgen::prelude::*;

mod simulation;

use simulation::{ObserverSnapshot, SimulationConfig, SimulationWorld};

/// Browser-facing wrapper around the original Rust TUI simulation.
/// The simulation systems are intentionally shared verbatim with Mk.04;
/// only the rendering and control surface are supplied by React.
#[wasm_bindgen]
pub struct SimulationEngine {
    world: SimulationWorld,
    observer: Arc<RwLock<ObserverSnapshot>>,
    grid_radius: i32,
}

#[wasm_bindgen]
impl SimulationEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(grid_radius: i32) -> SimulationEngine {
        Self::build(grid_radius.clamp(4, 24))
    }

    pub fn tick(&mut self, steps: u32) {
        for _ in 0..steps.clamp(1, 500) {
            self.world.tick();
        }
    }

    pub fn set_timescale(&mut self, years_per_tick: f64) {
        self.world
            .set_timescale(years_per_tick.clamp(1_000.0, 50_000_000_000.0));
    }

    pub fn reset(&mut self) {
        *self = Self::build(self.grid_radius);
    }

    pub fn snapshot_json(&self) -> String {
        let snapshot = self
            .observer
            .read()
            .expect("simulation observer lock poisoned");
        serde_json::to_string(&*snapshot).expect("observer snapshot must serialize")
    }
}

impl SimulationEngine {
    fn build(grid_radius: i32) -> Self {
        let observer = Arc::new(RwLock::new(ObserverSnapshot::default()));
        let config = SimulationConfig {
            tick_duration: Duration::from_secs(1),
            grid_radius,
            years_per_tick: 1_000_000.0,
        };
        let mut world = SimulationWorld::with_observer(config, observer.clone());
        world.tick();
        Self {
            world,
            observer,
            grid_radius,
        }
    }
}

