//! The sample table: 16-bit PCM by id, mono or stereo, in memory the table owns.
//!
//! A voice holds the sample it plays (its pointer and shape), not the id, so an id can be loaded again while the
//! old PCM fades out. A freed sample's voices are released over a few milliseconds; its memory waits on a short
//! list until `collect` finds no voice reading it, and only then goes back to the allocator.

use crate::ops::MAX_SAMPLES;
use crate::voice::VoicePool;

/// Freed samples that may wait for their voices to fade. Past this, a freed sample's voices are cut at once.
const DYING_CAP: usize = 256;

#[derive(Clone, Copy)]
pub struct Sample {
    ptr: *mut i16,
    pub frames: u32,
    pub channels: u32,
    /// The sample rate of the recording.
    pub rate: f32,
}

impl Sample {
    /// The interleaved PCM.
    #[inline]
    pub fn data(&self) -> &[i16] {
        // SAFETY: `ptr` holds `frames * channels` samples for as long as the table holds this entry.
        unsafe { core::slice::from_raw_parts(self.ptr, (self.frames * self.channels) as usize) }
    }

    /// Where the PCM starts: what a voice holds, and how the table asks whether a voice still reads it.
    #[inline]
    pub fn ptr(&self) -> *const i16 {
        self.ptr
    }

    fn bytes(&self) -> usize {
        (self.frames * self.channels) as usize * 2
    }

    /// Returns the memory.
    ///
    /// # Safety
    /// No voice reads the sample any more, and the table no longer holds it.
    unsafe fn release(self) {
        // SAFETY: the memory came from `alloc_bytes` with this size (the caller's contract covers the rest).
        unsafe { crate::alloc::free_bytes(self.ptr as *mut u8, self.bytes()) };
    }
}

pub struct SampleTable {
    slots: Vec<Option<Sample>>,
    /// Freed samples whose voices are still fading.
    dying: Vec<Sample>,
}

impl SampleTable {
    pub fn new() -> Self {
        SampleTable { slots: (0..MAX_SAMPLES).map(|_| None).collect(), dying: Vec::with_capacity(DYING_CAP) }
    }

    /// Registers PCM at `ptr` (from `alloc_bytes`) as `id`, replacing what `id` held. The table owns the memory
    /// from here, taken or not. False when the id or the shape is out of range.
    pub fn load(&mut self, id: u32, ptr: *mut i16, frames: u32, channels: u32, rate: f32, voices: &mut VoicePool) -> bool {
        let sample = Sample { ptr, frames, channels, rate };
        let valid = id > 0 && (id as usize) < MAX_SAMPLES && !ptr.is_null() && (channels == 1 || channels == 2);
        if !valid || !(rate.is_finite() && rate > 0.0) {
            // SAFETY: nothing else holds the memory.
            unsafe { sample.release() };
            return false;
        }
        self.free(id, voices);
        self.slots[id as usize] = Some(sample);
        true
    }

    #[inline]
    pub fn get(&self, id: u32) -> Option<&Sample> {
        self.slots.get(id as usize).and_then(|s| s.as_ref())
    }

    /// Frees a sample. Voices playing it are released over a few milliseconds; the memory goes once they have.
    pub fn free(&mut self, id: u32, voices: &mut VoicePool) {
        let Some(slot) = self.slots.get_mut(id as usize) else { return };
        let Some(sample) = slot.take() else { return };
        voices.release_sample(id);
        if !voices.reads(sample.ptr) {
            // SAFETY: no voice reads it and the table let it go above.
            unsafe { sample.release() };
        } else if self.dying.len() < DYING_CAP {
            self.dying.push(sample);
        } else {
            voices.cut(sample.ptr);
            // SAFETY: the voices reading it were just cut.
            unsafe { sample.release() };
        }
    }

    /// Called once a block, after the voices render: returns the memory of freed samples no voice reads any more.
    pub fn collect(&mut self, voices: &VoicePool) {
        let mut i = 0;
        while i < self.dying.len() {
            if voices.reads(self.dying[i].ptr) {
                i += 1;
            } else {
                let sample = self.dying.swap_remove(i);
                // SAFETY: no voice reads it, and it left the table when it was freed.
                unsafe { sample.release() };
            }
        }
    }

    /// Freed samples still waiting for their voices: for tests.
    pub fn dying(&self) -> usize {
        self.dying.len()
    }
}

impl Default for SampleTable {
    fn default() -> Self {
        Self::new()
    }
}
