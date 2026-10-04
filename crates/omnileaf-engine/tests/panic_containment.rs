use std::{
    panic,
    sync::atomic::{AtomicBool, Ordering},
};

use omnileaf_engine::{contain_panic, is_panic_contained};

static SEEN_AS_CONTAINED: AtomicBool = AtomicBool::new(false);

#[test]
fn gives_back_what_contained_work_returns() {
    let outcome = contain_panic(|| 42);

    assert_eq!(outcome.ok(), Some(42));
}

#[test]
fn a_panic_hook_sees_a_contained_panic_as_contained_only_while_it_runs() {
    panic::set_hook(Box::new(|_| {
        SEEN_AS_CONTAINED.store(is_panic_contained(), Ordering::SeqCst);
    }));

    let outcome = contain_panic(|| contain_panic(|| panic!("a damaged page")).is_err());

    drop(panic::take_hook());
    assert_eq!(outcome.ok(), Some(true));
    assert!(SEEN_AS_CONTAINED.load(Ordering::SeqCst));
    assert!(!is_panic_contained());
}
