#![expect(
    unsafe_code,
    reason = "the C allocator hooks are only reachable through FFI"
)]

use std::{
    alloc::{self, Layout},
    cell::Cell,
    ffi::{CStr, c_char, c_void},
    ptr,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
};

pub const DESKTOP_LIMIT_BYTES: usize = 96 * 1024 * 1024;
pub const MOBILE_LIMIT_BYTES: usize = 64 * 1024 * 1024;
pub const DEFAULT_LIMIT_BYTES: usize = if cfg!(any(target_os = "android", target_os = "ios")) {
    MOBILE_LIMIT_BYTES
} else {
    DESKTOP_LIMIT_BYTES
};

#[repr(C, align(16))]
struct Header {
    total_bytes: usize,
    budget: *const Budget,
}

const HEADER_BYTES: usize = size_of::<Header>();
const BLOCK_ALIGNMENT: usize = align_of::<Header>();

/// libarchive exits the process when a small allocation fails, so small requests may use a reserve beyond the limit.
const SMALL_REQUEST_BYTES: usize = 1024 * 1024;
const RESERVE_FOR_SMALL_REQUESTS_BYTES: usize = 8 * 1024 * 1024;

pub(crate) struct Budget {
    limit_bytes: usize,
    used_bytes: AtomicUsize,
    refused_a_request: AtomicBool,
}

impl Budget {
    pub(crate) fn new(limit_bytes: usize) -> Self {
        Self {
            limit_bytes,
            used_bytes: AtomicUsize::new(0),
            refused_a_request: AtomicBool::new(false),
        }
    }

    pub(crate) fn limit_bytes(&self) -> usize {
        self.limit_bytes
    }

    pub(crate) fn has_refused_a_request(&self) -> bool {
        self.refused_a_request.load(Ordering::Relaxed)
    }

    #[cfg(test)]
    fn used_bytes(&self) -> usize {
        self.used_bytes.load(Ordering::Relaxed)
    }

    fn reserve(&self, bytes: usize) -> bool {
        let ceiling = if bytes <= SMALL_REQUEST_BYTES {
            self.limit_bytes
                .saturating_add(RESERVE_FOR_SMALL_REQUESTS_BYTES)
        } else {
            self.limit_bytes
        };
        let reserved = self
            .used_bytes
            .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |used| {
                used.checked_add(bytes).filter(|total| *total <= ceiling)
            })
            .is_ok();
        if !reserved {
            self.refused_a_request.store(true, Ordering::Relaxed);
        }
        reserved
    }

    fn release(&self, bytes: usize) {
        self.used_bytes.fetch_sub(bytes, Ordering::Relaxed);
    }
}

thread_local! {
    static ACTIVE: Cell<*const Budget> = const { Cell::new(ptr::null()) };
}

pub(crate) struct Scope {
    previous: *const Budget,
    _budget: Arc<Budget>,
}

impl Scope {
    pub(crate) fn enter(budget: &Arc<Budget>) -> Self {
        Self {
            previous: ACTIVE.replace(Arc::as_ptr(budget)),
            _budget: Arc::clone(budget),
        }
    }
}

impl Drop for Scope {
    fn drop(&mut self) {
        ACTIVE.set(self.previous);
    }
}

fn layout_of(total_bytes: usize) -> Option<Layout> {
    Layout::from_size_align(total_bytes, BLOCK_ALIGNMENT).ok()
}

#[expect(
    clippy::cast_ptr_alignment,
    reason = "the layout aligns every block to the header's alignment"
)]
unsafe fn allocate(size: usize, zeroed: bool) -> *mut c_void {
    let budget = ACTIVE.get();
    let Some(total_bytes) = size.checked_add(HEADER_BYTES) else {
        return ptr::null_mut();
    };
    let Some(layout) = layout_of(total_bytes) else {
        return ptr::null_mut();
    };
    // SAFETY: `budget` is null or points at the budget a live `Scope` entered on this thread.
    let Some(budget) = (unsafe { budget.as_ref() }) else {
        return ptr::null_mut();
    };
    if !budget.reserve(total_bytes) {
        return ptr::null_mut();
    }
    // SAFETY: `layout` has a non-zero size, since it includes the header.
    let raw = unsafe {
        if zeroed {
            alloc::alloc_zeroed(layout)
        } else {
            alloc::alloc(layout)
        }
    };
    if raw.is_null() {
        budget.release(total_bytes);
        return ptr::null_mut();
    }
    // SAFETY: `raw` is aligned for `Header` and holds at least `HEADER_BYTES` bytes.
    unsafe {
        raw.cast::<Header>().write(Header {
            total_bytes,
            budget: ptr::from_ref(budget),
        });
        raw.add(HEADER_BYTES).cast()
    }
}

unsafe fn header_of(block: *mut c_void) -> *mut Header {
    // SAFETY: every block this module hands out sits `HEADER_BYTES` after its header.
    unsafe { block.cast::<u8>().sub(HEADER_BYTES).cast() }
}

#[unsafe(no_mangle)]
pub(crate) unsafe extern "C" fn omni_malloc(size: usize) -> *mut c_void {
    // SAFETY: `allocate` only reads the thread's active budget.
    unsafe { allocate(size, false) }
}

#[unsafe(no_mangle)]
pub(crate) unsafe extern "C" fn omni_calloc(count: usize, size: usize) -> *mut c_void {
    let Some(bytes) = count.checked_mul(size) else {
        return ptr::null_mut();
    };
    // SAFETY: `allocate` only reads the thread's active budget.
    unsafe { allocate(bytes, true) }
}

#[unsafe(no_mangle)]
pub(crate) unsafe extern "C" fn omni_free(block: *mut c_void) {
    if block.is_null() {
        return;
    }
    // SAFETY: `block` came from this module, so its header is valid and its budget outlives it.
    unsafe {
        let header = header_of(block);
        let Header {
            total_bytes,
            budget,
        } = header.read();
        if let Some(layout) = layout_of(total_bytes) {
            alloc::dealloc(header.cast(), layout);
        }
        (*budget).release(total_bytes);
    }
}

#[expect(
    clippy::cast_ptr_alignment,
    reason = "the layout aligns every block to the header's alignment"
)]
#[unsafe(no_mangle)]
pub(crate) unsafe extern "C" fn omni_realloc(block: *mut c_void, size: usize) -> *mut c_void {
    if block.is_null() {
        // SAFETY: `allocate` only reads the thread's active budget.
        return unsafe { allocate(size, false) };
    }
    if size == 0 {
        // SAFETY: `block` came from this module and is not used after this call.
        unsafe { omni_free(block) };
        return ptr::null_mut();
    }
    // SAFETY: `block` came from this module, so its header is valid and its budget outlives it.
    unsafe {
        let header = header_of(block);
        let Header {
            total_bytes: old_bytes,
            budget,
        } = header.read();
        let Some(new_bytes) = size.checked_add(HEADER_BYTES) else {
            return ptr::null_mut();
        };
        let (Some(old_layout), Some(_)) = (layout_of(old_bytes), layout_of(new_bytes)) else {
            return ptr::null_mut();
        };
        let budget = &*budget;
        if new_bytes > old_bytes && !budget.reserve(new_bytes - old_bytes) {
            return ptr::null_mut();
        }
        let raw = alloc::realloc(header.cast(), old_layout, new_bytes);
        if raw.is_null() {
            if new_bytes > old_bytes {
                budget.release(new_bytes - old_bytes);
            }
            return ptr::null_mut();
        }
        if new_bytes < old_bytes {
            budget.release(old_bytes - new_bytes);
        }
        raw.cast::<Header>().write(Header {
            total_bytes: new_bytes,
            budget: ptr::from_ref(budget),
        });
        raw.add(HEADER_BYTES).cast()
    }
}

#[unsafe(no_mangle)]
pub(crate) unsafe extern "C" fn omni_strdup(text: *const c_char) -> *mut c_char {
    // SAFETY: `text` is a NUL-terminated string, and the copy is as long as it, NUL included.
    unsafe {
        let bytes = CStr::from_ptr(text).to_bytes_with_nul();
        let copy = allocate(bytes.len(), false).cast::<u8>();
        if !copy.is_null() {
            ptr::copy_nonoverlapping(bytes.as_ptr(), copy, bytes.len());
        }
        copy.cast()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const LIMIT_BYTES: usize = 1024 * 1024;

    #[test]
    fn refuses_a_request_beyond_the_budget() {
        let budget = Arc::new(Budget::new(LIMIT_BYTES));
        let _scope = Scope::enter(&budget);

        // SAFETY: the hooks take no pointers here, and a refused request returns null.
        let (hostile, over_budget) =
            unsafe { (omni_malloc(usize::MAX), omni_malloc(LIMIT_BYTES * 2)) };

        assert!(hostile.is_null());
        assert!(over_budget.is_null());
        assert_eq!(budget.used_bytes(), 0);
    }

    #[test]
    fn refuses_a_zeroed_request_whose_size_overflows() {
        let budget = Arc::new(Budget::new(LIMIT_BYTES));
        let _scope = Scope::enter(&budget);

        // SAFETY: the hook takes no pointers, and a refused request returns null.
        let block = unsafe { omni_calloc(usize::MAX / 2, 4) };

        assert!(block.is_null());
    }

    #[test]
    fn refuses_to_allocate_outside_a_budget() {
        // SAFETY: the hook takes no pointers, and a refused request returns null.
        let block = unsafe { omni_malloc(16) };

        assert!(block.is_null());
    }

    #[test]
    fn gives_the_bytes_back_to_the_budget_when_a_block_is_freed() {
        let budget = Arc::new(Budget::new(LIMIT_BYTES));
        let _scope = Scope::enter(&budget);

        // SAFETY: `block` comes from `omni_malloc`, is written within its 64 bytes, and is freed once.
        let used_while_held = unsafe {
            let block = omni_malloc(64).cast::<u8>();
            assert!(!block.is_null());
            block.write_bytes(7, 64);
            let used = budget.used_bytes();
            omni_free(block.cast());
            used
        };

        assert!(used_while_held >= 64);
        assert_eq!(budget.used_bytes(), 0);
    }

    #[test]
    fn zeroes_the_blocks_it_hands_out_as_zeroed() {
        let budget = Arc::new(Budget::new(LIMIT_BYTES));
        let _scope = Scope::enter(&budget);

        // SAFETY: `block` comes from `omni_calloc`, is read within its 32 bytes, and is freed once.
        let bytes = unsafe {
            let block = omni_calloc(8, 4).cast::<u8>();
            assert!(!block.is_null());
            let bytes = std::slice::from_raw_parts(block, 32).to_vec();
            omni_free(block.cast());
            bytes
        };

        assert_eq!(bytes, [0; 32]);
    }

    #[test]
    fn keeps_a_block_whole_when_growing_it_would_pass_the_budget() {
        let budget = Arc::new(Budget::new(LIMIT_BYTES));
        let _scope = Scope::enter(&budget);

        // SAFETY: `block` comes from `omni_malloc`, is read within its first 8 bytes, and is freed once.
        let (grown, kept) = unsafe {
            let block = omni_malloc(8).cast::<u8>();
            assert!(!block.is_null());
            block.write_bytes(9, 8);
            let grown = omni_realloc(block.cast(), LIMIT_BYTES * 2);
            let kept = std::slice::from_raw_parts(block, 8).to_vec();
            omni_free(block.cast());
            (grown, kept)
        };

        assert!(grown.is_null());
        assert_eq!(kept, [9; 8]);
        assert_eq!(budget.used_bytes(), 0);
    }

    #[test]
    fn keeps_the_contents_when_a_block_grows_within_the_budget() {
        let budget = Arc::new(Budget::new(LIMIT_BYTES));
        let _scope = Scope::enter(&budget);

        // SAFETY: both blocks come from the hooks, are read within their sizes, and are freed once.
        let kept = unsafe {
            let block = omni_malloc(8).cast::<u8>();
            block.write_bytes(5, 8);
            let grown = omni_realloc(block.cast(), 4096).cast::<u8>();
            assert!(!grown.is_null());
            let kept = std::slice::from_raw_parts(grown, 8).to_vec();
            omni_free(grown.cast());
            kept
        };

        assert_eq!(kept, [5; 8]);
        assert_eq!(budget.used_bytes(), 0);
    }

    #[test]
    fn copies_a_string_into_a_counted_block() {
        let budget = Arc::new(Budget::new(LIMIT_BYTES));
        let _scope = Scope::enter(&budget);

        // SAFETY: the source is NUL-terminated, the copy is read as a C string, and is freed once.
        let copy = unsafe {
            let copy = omni_strdup(c"UTF-8".as_ptr());
            let text = std::ffi::CStr::from_ptr(copy).to_owned();
            omni_free(copy.cast());
            text
        };

        assert_eq!(copy.as_bytes(), b"UTF-8");
        assert_eq!(budget.used_bytes(), 0);
    }

    const LARGE_BLOCK_BYTES: usize = 4 * 1024 * 1024;

    #[test]
    fn serves_small_requests_from_the_reserve_after_the_limit_is_reached() {
        let budget = Arc::new(Budget::new(LARGE_BLOCK_BYTES));
        let _scope = Scope::enter(&budget);

        // SAFETY: the blocks come from the hooks, are never read, and are freed once.
        let (refused, small) = unsafe {
            let filler = omni_malloc(LARGE_BLOCK_BYTES - HEADER_BYTES);
            let refused = omni_malloc(LARGE_BLOCK_BYTES);
            let small = omni_malloc(64);
            omni_free(small);
            omni_free(filler);
            (refused, small)
        };

        assert!(refused.is_null());
        assert!(!small.is_null());
        assert!(budget.has_refused_a_request());
    }

    #[test]
    fn stops_serving_small_requests_once_the_reserve_is_spent() {
        let budget = Arc::new(Budget::new(0));
        let _scope = Scope::enter(&budget);

        // SAFETY: the blocks come from the hooks, are never read, and are freed once.
        let served = unsafe {
            let blocks: Vec<*mut c_void> = (0..RESERVE_FOR_SMALL_REQUESTS_BYTES)
                .map(|_| omni_malloc(SMALL_REQUEST_BYTES - HEADER_BYTES))
                .take_while(|block| !block.is_null())
                .collect();
            for block in &blocks {
                omni_free(*block);
            }
            blocks.len()
        };

        assert_eq!(served, 8);
        assert_eq!(budget.used_bytes(), 0);
    }
}
