//! Memory. On wasm the crate is its own allocator: a bump arena over the linear memory with free lists, so the
//! megabytes of a sample come back when its pack is freed. Natively (the tests) the system allocator serves.
//!
//! Small blocks (up to 32 KB) are powers of two, one free list per size. Larger blocks are multiples of 4 KB on
//! one first-fit list; a block larger than the request is split. Freed neighbours are not merged: a pack loaded,
//! freed and loaded again reuses its own blocks, which is the pattern this serves.

use std::alloc::Layout;

/// The alignment of every sample upload.
const BYTES_ALIGN: usize = 8;

/// Memory for `bytes` of sample data (the `alloc` of the ABI). Null when the memory cannot grow.
pub fn alloc_bytes(bytes: usize) -> *mut u8 {
    match Layout::from_size_align(bytes.max(1), BYTES_ALIGN) {
        // SAFETY: the layout has a non-zero size.
        Ok(layout) => unsafe { std::alloc::alloc(layout) },
        Err(_) => core::ptr::null_mut(),
    }
}

/// Returns memory from `alloc_bytes`.
///
/// # Safety
/// `ptr` came from `alloc_bytes(bytes)` with the same `bytes`, and is not used again.
pub unsafe fn free_bytes(ptr: *mut u8, bytes: usize) {
    if ptr.is_null() {
        return;
    }
    if let Ok(layout) = Layout::from_size_align(bytes.max(1), BYTES_ALIGN) {
        // SAFETY: the contract of this function.
        unsafe { std::alloc::dealloc(ptr, layout) }
    }
}

#[cfg(target_arch = "wasm32")]
mod arena {
    use core::alloc::{GlobalAlloc, Layout};
    use core::arch::wasm32::{memory_grow, memory_size};
    use core::cell::UnsafeCell;
    use core::ptr::null_mut;

    const PAGE: usize = 65536;
    const ALIGN: usize = 16;
    /// Small blocks: 16 bytes to 32 KB, powers of two.
    const SMALL_CLASSES: usize = 12;
    const SMALL_MAX: usize = 16 << (SMALL_CLASSES - 1);
    /// Large blocks are multiples of this.
    const GRAIN: usize = 4096;

    /// The header of a free large block, written into the block itself.
    #[repr(C)]
    struct Free {
        size: usize,
        next: usize,
    }

    struct State {
        top: usize,
        end: usize,
        small: [usize; SMALL_CLASSES],
        large: usize,
    }

    pub struct Arena(UnsafeCell<State>);

    // SAFETY: wasm32-unknown-unknown without threads runs one thread; the worklet never shares the instance.
    unsafe impl Sync for Arena {}

    impl Arena {
        pub const fn new() -> Self {
            Arena(UnsafeCell::new(State { top: 0, end: 0, small: [0; SMALL_CLASSES], large: 0 }))
        }
    }

    impl State {
        fn bump(&mut self, size: usize, align: usize) -> *mut u8 {
            if self.end == 0 {
                self.end = memory_size(0) * PAGE;
                self.top = self.end;
            }
            let start = (self.top + align - 1) & !(align - 1);
            let Some(top) = start.checked_add(size) else { return null_mut() };
            if top > self.end {
                let pages = (top - self.end).div_ceil(PAGE);
                if memory_grow(0, pages) == usize::MAX {
                    return null_mut();
                }
                self.end += pages * PAGE;
            }
            self.top = top;
            start as *mut u8
        }

        fn class(size: usize) -> usize {
            (size.max(ALIGN).next_power_of_two().trailing_zeros() - ALIGN.trailing_zeros()) as usize
        }

        fn large_size(size: usize) -> usize {
            size.div_ceil(GRAIN) * GRAIN
        }

        unsafe fn alloc(&mut self, layout: Layout) -> *mut u8 {
            let size = layout.size();
            if layout.align() > ALIGN {
                // Nothing in the crate asks for this; served, never reused.
                return self.bump(size, layout.align());
            }
            if size <= SMALL_MAX {
                let class = Self::class(size);
                let head = self.small[class];
                if head != 0 {
                    // SAFETY: a free small block holds the address of the next free block in its first word.
                    self.small[class] = unsafe { *(head as *const usize) };
                    return head as *mut u8;
                }
                return self.bump(ALIGN << class, ALIGN);
            }
            let need = Self::large_size(size);
            let mut link: *mut usize = &mut self.large;
            // SAFETY: every address on the list is a free block of at least `GRAIN` bytes with a `Free` header.
            unsafe {
                while *link != 0 {
                    let block = *link as *mut Free;
                    if (*block).size >= need {
                        let rest = (*block).size - need;
                        if rest >= GRAIN {
                            let tail = (block as usize + need) as *mut Free;
                            (*tail).size = rest;
                            (*tail).next = (*block).next;
                            *link = tail as usize;
                        } else {
                            *link = (*block).next;
                        }
                        return block as *mut u8;
                    }
                    link = &mut (*block).next;
                }
            }
            self.bump(need, ALIGN)
        }

        unsafe fn dealloc(&mut self, ptr: *mut u8, layout: Layout) {
            let size = layout.size();
            if layout.align() > ALIGN {
                return;
            }
            if size <= SMALL_MAX {
                let class = Self::class(size);
                // SAFETY: the block is at least 16 bytes and no longer in use.
                unsafe { *(ptr as *mut usize) = self.small[class] };
                self.small[class] = ptr as usize;
                return;
            }
            // The tail of a split block went back to the list at once, so what returns is `large_size(size)` long.
            let block = ptr as *mut Free;
            // SAFETY: the block is at least `GRAIN` bytes and no longer in use.
            unsafe {
                (*block).size = Self::large_size(size);
                (*block).next = self.large;
            }
            self.large = block as usize;
        }
    }

    // SAFETY: blocks never overlap (bumped once, then handed out from the list they were returned to), and are
    // aligned to 16 or to the alignment the layout asks for.
    unsafe impl GlobalAlloc for Arena {
        unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
            // SAFETY: single-threaded (see `Sync`).
            unsafe { (*self.0.get()).alloc(layout) }
        }

        unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
            // SAFETY: single-threaded (see `Sync`).
            unsafe { (*self.0.get()).dealloc(ptr, layout) }
        }
    }

    #[global_allocator]
    static ARENA: Arena = Arena::new();
}
