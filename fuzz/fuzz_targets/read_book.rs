#![no_main]

use libfuzzer_sys::fuzz_target;
use omnileaf_fuzz::read_every_page;

fuzz_target!(|bytes: &[u8]| read_every_page(bytes));
