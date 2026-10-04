use std::{
    cell::Cell,
    panic::{self, UnwindSafe},
    thread,
};

thread_local! {
    static CONTAINING: Cell<usize> = const { Cell::new(0) };
}

/// Runs `work`, catching a panic in it as one the app survives, so a crash report hook can leave it out.
pub fn contain_panic<T>(work: impl FnOnce() -> T + UnwindSafe) -> thread::Result<T> {
    CONTAINING.with(|depth| depth.set(depth.get().saturating_add(1)));
    let outcome = panic::catch_unwind(work);
    CONTAINING.with(|depth| depth.set(depth.get().saturating_sub(1)));
    outcome
}

/// Whether a panic on this thread happens inside [`contain_panic`].
#[must_use]
pub fn is_panic_contained() -> bool {
    CONTAINING.with(|depth| depth.get() > 0)
}
