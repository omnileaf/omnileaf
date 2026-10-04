#![no_main]

use libfuzzer_sys::fuzz_target;
use omnileaf_formats::parse_comic_info;

fuzz_target!(|bytes: &[u8]| {
    let _ = parse_comic_info(bytes);
});
