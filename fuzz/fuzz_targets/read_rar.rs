#![no_main]

use libfuzzer_sys::{fuzz_mutator, fuzz_target, fuzzer_mutate};
use omnileaf_fuzz::read_every_page;
use omnileaf_testkit::refresh_rar_header_checksums;

const RAR_SIGNATURE: &[u8] = b"Rar!\x1a\x07";

fuzz_target!(|bytes: &[u8]| {
    if bytes.starts_with(RAR_SIGNATURE) {
        read_every_page(bytes);
    }
});

fuzz_mutator!(
    |data: &mut [u8], size: usize, max_size: usize, _seed: u32| {
        let mutated_size = fuzzer_mutate(data, size, max_size);
        if let Some(mutated) = data.get_mut(..mutated_size) {
            refresh_rar_header_checksums(mutated);
        }
        mutated_size
    }
);
