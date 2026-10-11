#![no_main]

use libfuzzer_sys::fuzz_target;
use omnileaf_fuzz::read_every_page;

const SEVEN_ZIP_SIGNATURE: &[u8] = b"7z\xbc\xaf\x27\x1c";

fuzz_target!(|bytes: &[u8]| {
    if bytes.starts_with(SEVEN_ZIP_SIGNATURE) {
        read_every_page(bytes);
    }
});
