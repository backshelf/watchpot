//! The ABI: the six raw exports the worklet calls. Nothing else crosses the boundary.
//!
//! The worklet calls `init` once, copies command records into `cmd_buf()` (at most `CMD_CAP` bytes) before each
//! `process(frames, cmd_len)`, reads `frames` left samples then `frames` right samples at the pointer it returns,
//! and reads `evt_len()` bytes of event records at `evt_buf()`. A sample is uploaded by copying its PCM to
//! `alloc(bytes)` and sending `SAMPLE_LOAD` with that pointer.

use crate::engine::Engine;
use crate::ops;
use core::cell::UnsafeCell;

struct State {
    engine: Engine,
    cmd: Vec<u8>,
}

struct Global(UnsafeCell<Option<State>>);

// SAFETY: wasm32-unknown-unknown without threads runs one thread; the worklet never shares the instance.
unsafe impl Sync for Global {}

static STATE: Global = Global(UnsafeCell::new(None));

fn fresh(sample_rate: f32, max_voices: u32) -> State {
    State { engine: Engine::new(sample_rate, max_voices), cmd: vec![0; ops::CMD_CAP] }
}

fn state() -> &'static mut State {
    // SAFETY: single-threaded (see `Sync`), and no export holds this reference across a call to another.
    unsafe { (*STATE.0.get()).get_or_insert_with(|| fresh(48000.0, 64)) }
}

/// Builds the engine. Called once, before anything else.
#[unsafe(no_mangle)]
pub extern "C" fn init(sample_rate: f32, max_voices: u32) {
    // SAFETY: single-threaded (see `Sync`).
    unsafe { *STATE.0.get() = Some(fresh(sample_rate, max_voices)) };
}

/// Memory for a sample upload; freed by `SAMPLE_FREE`. Null when the memory cannot grow.
#[unsafe(no_mangle)]
pub extern "C" fn alloc(bytes: u32) -> *mut u8 {
    crate::alloc::alloc_bytes(bytes as usize)
}

/// `CMD_CAP` bytes the worklet fills with command records.
#[unsafe(no_mangle)]
pub extern "C" fn cmd_buf() -> *mut u8 {
    state().cmd.as_mut_ptr()
}

/// Reads `cmd_len` bytes of commands, renders `frames` frames (at most `MAX_BLOCK`) and returns the master:
/// `frames` left samples, then `frames` right samples.
#[unsafe(no_mangle)]
pub extern "C" fn process(frames: u32, cmd_len: u32) -> *const f32 {
    let s = state();
    let len = (cmd_len as usize).min(ops::CMD_CAP);
    s.engine.command(&s.cmd[..len]);
    let (l, _) = s.engine.process(frames as usize);
    l.as_ptr()
}

/// The event records the last `process` wrote.
#[unsafe(no_mangle)]
pub extern "C" fn evt_buf() -> *const u8 {
    state().engine.events().as_ptr()
}

#[unsafe(no_mangle)]
pub extern "C" fn evt_len() -> u32 {
    state().engine.events().len() as u32
}
