//! The DSP core of `watchpot/sound`: every voice, bus and effect, in one process loop.
//!
//! Built for `wasm32-unknown-unknown` with raw exports (`abi.rs`) and run in one AudioWorklet; built natively for
//! its tests, which drive `Engine` directly. Commands arrive as binary records (`ops.rs`, generated from
//! `src/sound/protocol.ts` by `bun run dsp`) and events leave the same way.
//!
//! Two rules hold everywhere: nothing allocates inside `Engine::process` (every buffer is sized at construction),
//! and nothing reads a clock (time is the frame counter).

#[cfg(target_arch = "wasm32")]
pub mod abi;
pub mod alloc;
pub mod babble;
pub mod bus;
pub mod cmd;
pub mod engine;
pub mod fft;
pub mod freeze;
pub mod fx;
pub mod gens;
pub mod grain;
pub mod limiter;
pub mod looper;
pub mod math;
pub mod meter;
pub mod ops;
pub mod param;
pub mod sample;
pub mod seq;
pub mod space;
pub mod transport;
pub mod voice;

pub use engine::Engine;
