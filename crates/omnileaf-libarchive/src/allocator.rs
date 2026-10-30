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

const IS_MOBILE: bool = cfg!(any(target_os = "android", target_os = "ios"));

pub const DESKTOP_LIMIT_BYTES: usize = 160 * 1024 * 1024;
pub const MOBILE_LIMIT_BYTES: usize = 96 * 1024 * 1024;
pub const DEFAULT_LIMIT_BYTES: usize = if IS_MOBILE {
    MOBILE_LIMIT_BYTES
} else {
    DESKTOP_LIMIT_BYTES
};

pub const DESKTOP_DICTIONARY_CAP_BYTES: usize = 64 * 1024 * 1024;
pub const MOBILE_DICTIONARY_CAP_BYTES: usize = 32 * 1024 * 1024;
pub const DEFAULT_DICTIONARY_CAP_BYTES: usize = if IS_MOBILE {
    MOBILE_DICTIONARY_CAP_BYTES
} else {
    DESKTOP_DICTIONARY_CAP_BYTES
};

#[repr(C, align(16))]
struct Header {
    total_bytes: usize,
    budget: *const Budget,
}

const HEADER_BYTES: usize = size_of::<Header>();
const BLOCK_ALIGNMENT: usize = align_of::<Header>();

/// libarchive exits the process when a tiny allocation fails, as it does for error messages and names, so tiny requests may pass the limit into a reserve.
const TINY_REQUEST_BYTES: usize = 4096;
const RESERVE_FOR_TINY_REQUESTS_BYTES: usize = 8 * 1024 * 1024;

pub(crate) struct Budget {
    limit_bytes: usize,
    used_bytes: AtomicUsize,
    exceeded: AtomicBool,
}

impl Budget {
    pub(crate) fn new(limit_bytes: usize) -> Self {
        Self {
            limit_bytes,
            used_bytes: AtomicUsize::new(0),
            exceeded: AtomicBool::new(false),
        }
    }

    pub(crate) fn limit_bytes(&self) -> usize {
        self.limit_bytes
    }

    pub(crate) fn is_exceeded(&self) -> bool {
        self.exceeded.load(Ordering::Relaxed)
    }

    #[cfg(test)]
    fn used_bytes(&self) -> usize {
        self.used_bytes.load(Ordering::Relaxed)
    }

    fn ceiling_for(&self, requested_bytes: usize) -> usize {
        if requested_bytes <= TINY_REQUEST_BYTES {
            self.limit_bytes
                .saturating_add(RESERVE_FOR_TINY_REQUESTS_BYTES)
        } else {
            self.limit_bytes
        }
    }

    fn reserve(&self, requested_bytes: usize, added_bytes: usize) -> bool {
        let ceiling = self.ceiling_for(requested_bytes);
        let mut passes_the_limit = false;
        let reserved = self
            .used_bytes
            .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |used| {
                let total = used.checked_add(added_bytes);
                passes_the_limit = total.is_none_or(|total| total > self.limit_bytes);
                total.filter(|total| *total <= ceiling)
            })
            .is_ok();
        if passes_the_limit {
            self.exceeded.store(true, Ordering::Relaxed);
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
    if !budget.reserve(size, total_bytes) {
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
        if new_bytes > old_bytes && !budget.reserve(size, new_bytes - old_bytes) {
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
    const ONE_MIB: usize = 1024 * 1024;

    fn full_budget() -> Arc<Budget> {
        Arc::new(Budget::new(LARGE_BLOCK_BYTES))
    }

    unsafe fn take_the_whole_limit(budget: &Budget) -> *mut c_void {
        // SAFETY: the hook only reads the thread's active budget.
        let filler = unsafe { omni_malloc(budget.limit_bytes() - HEADER_BYTES) };
        assert!(!filler.is_null());
        filler
    }

    #[test]
    fn refuses_requests_of_up_to_1_mib_past_the_limit_without_using_the_reserve() {
        let budget = full_budget();
        let _scope = Scope::enter(&budget);

        // SAFETY: the blocks come from the hooks, are never read, and are freed once.
        let served = unsafe {
            let blocks: Vec<*mut c_void> = (0..16)
                .map(|_| omni_malloc(ONE_MIB))
                .take_while(|block| !block.is_null())
                .collect();
            let used = budget.used_bytes();
            for block in &blocks {
                omni_free(*block);
            }
            assert!(used <= LARGE_BLOCK_BYTES);
            blocks.len()
        };

        assert_eq!(served, 3);
        assert!(budget.is_exceeded());
    }

    #[test]
    fn serves_tiny_requests_from_the_reserve_once_the_limit_is_reached() {
        let budget = full_budget();
        let _scope = Scope::enter(&budget);

        // SAFETY: the blocks come from the hooks, are never read, and are freed once.
        let (exceeded_before, tiny) = unsafe {
            let filler = take_the_whole_limit(&budget);
            let exceeded_before = budget.is_exceeded();
            let tiny = omni_malloc(64);
            omni_free(tiny);
            omni_free(filler);
            (exceeded_before, tiny)
        };

        assert!(!exceeded_before);
        assert!(!tiny.is_null());
        assert!(budget.is_exceeded());
    }

    #[test]
    fn counts_a_request_of_up_to_4_kib_as_tiny() {
        let budget = full_budget();
        let _scope = Scope::enter(&budget);

        // SAFETY: the blocks come from the hooks, are never read, and are freed once.
        let (tiny, larger) = unsafe {
            let filler = take_the_whole_limit(&budget);
            let tiny = omni_malloc(TINY_REQUEST_BYTES);
            let larger = omni_malloc(TINY_REQUEST_BYTES + 1);
            omni_free(tiny);
            omni_free(larger);
            omni_free(filler);
            (tiny, larger)
        };

        assert!(!tiny.is_null());
        assert!(larger.is_null());
    }

    #[test]
    fn judges_a_growing_block_by_its_size_rather_than_by_each_step() {
        let budget = full_budget();
        let _scope = Scope::enter(&budget);

        // SAFETY: every block comes from the hooks, is never read, and is freed once.
        let sizes_reached = unsafe {
            let filler = take_the_whole_limit(&budget);
            let mut block = omni_malloc(1024);
            let mut size = 1024;
            while size < 4 * TINY_REQUEST_BYTES {
                let grown = omni_realloc(block, size + 1024);
                if grown.is_null() {
                    break;
                }
                block = grown;
                size += 1024;
            }
            omni_free(block);
            omni_free(filler);
            size
        };

        assert_eq!(sizes_reached, TINY_REQUEST_BYTES);
    }

    #[test]
    fn stops_serving_tiny_requests_once_the_reserve_is_spent() {
        let budget = Arc::new(Budget::new(0));
        let _scope = Scope::enter(&budget);

        // SAFETY: the blocks come from the hooks, are never read, and are freed once.
        let served = unsafe {
            let blocks: Vec<*mut c_void> = (0..RESERVE_FOR_TINY_REQUESTS_BYTES)
                .map(|_| omni_malloc(TINY_REQUEST_BYTES))
                .take_while(|block| !block.is_null())
                .collect();
            for block in &blocks {
                omni_free(*block);
            }
            blocks.len()
        };

        assert_eq!(
            served,
            RESERVE_FOR_TINY_REQUESTS_BYTES / (TINY_REQUEST_BYTES + HEADER_BYTES)
        );
        assert_eq!(budget.used_bytes(), 0);
    }
}
