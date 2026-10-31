mod rar4;
mod rar5;

const RAR4_SIGNATURE: &[u8] = b"Rar!\x1a\x07\x00";
const RAR5_SIGNATURE: &[u8] = b"Rar!\x1a\x07\x01\x00";

pub fn refresh_rar_header_checksums(archive: &mut [u8]) {
    if archive.starts_with(RAR5_SIGNATURE) {
        rar5::refresh(archive, RAR5_SIGNATURE.len());
    } else if archive.starts_with(RAR4_SIGNATURE) {
        rar4::refresh(archive, RAR4_SIGNATURE.len());
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        ops::Range,
        path::{Path, PathBuf},
    };

    use super::refresh_rar_header_checksums;
    use crate::{
        ArchiveEntry, Packing, RarEncryption, RarFormat, RarMethod, RarOptions, RarVolume, cbr,
        rar::crc32,
    };

    const RAR4_MAIN_CRC: Range<usize> = 7..9;
    const RAR4_FILE_BLOCK_AT: usize = 20;
    const RAR4_END_BLOCK_BYTES: usize = 7;
    const RAR5_MAIN_CRC: Range<usize> = 8..12;
    const RAR5_FILE_HEADER_AT: usize = 16;
    const RAR5_END_HEADER_BYTES: usize = 8;
    const NAME: &str = "page.png";
    const RAR_FIXTURES: &str = "../omnileaf-formats/tests/rar_fixtures";

    fn one_page(format: RarFormat) -> Vec<u8> {
        let page = ArchiveEntry {
            name: NAME.to_owned(),
            bytes: b"x".to_vec(),
        };
        cbr(&[page], &RarOptions::of(format)).unwrap()
    }

    fn testkit_archives() -> Vec<Vec<u8>> {
        let entries: Vec<ArchiveEntry> = ["chapter/", "chapter/1.png", "2.png", "página.png"]
            .iter()
            .map(|&name| ArchiveEntry {
                name: name.to_owned(),
                bytes: if name.ends_with('/') {
                    Vec::new()
                } else {
                    name.as_bytes().to_vec()
                },
            })
            .collect();
        let mut archives = Vec::new();
        for format in [RarFormat::RAR4, RarFormat::RAR5] {
            for options in [
                RarOptions::of(format),
                RarOptions {
                    packing: Packing::Solid,
                    method: RarMethod::DeclaredCompressed,
                    ..RarOptions::of(format)
                },
                RarOptions {
                    encryption: RarEncryption::Entries,
                    volume: RarVolume::Middle,
                    ..RarOptions::of(format)
                },
                RarOptions {
                    encryption: RarEncryption::Headers,
                    declared_unpacked_size: Some((7 << 32) | 5),
                    ..RarOptions::of(format)
                },
            ] {
                archives.push(cbr(&entries, &options).unwrap());
            }
        }
        archives
    }

    fn archives_made_with_rar() -> Vec<(PathBuf, Vec<u8>)> {
        let folder = Path::new(env!("CARGO_MANIFEST_DIR")).join(RAR_FIXTURES);
        let mut archives: Vec<(PathBuf, Vec<u8>)> = fs::read_dir(folder)
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .filter(|path| {
                path.extension()
                    .is_some_and(|extension| extension == "cbr" || extension == "rar")
            })
            .map(|path| {
                let bytes = fs::read(&path).unwrap();
                (path, bytes)
            })
            .collect();
        archives.sort();
        archives
    }

    fn refreshed(archive: &[u8]) -> Vec<u8> {
        let mut refreshed = archive.to_vec();
        refresh_rar_header_checksums(&mut refreshed);
        refreshed
    }

    fn rar4_block_crc_holds(archive: &[u8], start: usize) -> bool {
        let size = usize::from(u16::from_le_bytes([archive[start + 5], archive[start + 6]]));
        let crc16 = u16::from_le_bytes([archive[start], archive[start + 1]]);
        crc32(&archive[start + 2..start + size]) & 0xFFFF == u32::from(crc16)
    }

    fn rar5_header_crc_holds(archive: &[u8], start: usize) -> bool {
        let size = usize::from(archive[start + 4]);
        let crc = u32::from_le_bytes(archive[start..start + 4].try_into().unwrap());
        crc32(&archive[start + 4..start + 5 + size]) == crc
    }

    fn name_at(archive: &[u8]) -> usize {
        archive
            .windows(NAME.len())
            .position(|window| window == NAME.as_bytes())
            .unwrap()
    }

    fn damaged_copies(archive: &[u8]) -> impl Iterator<Item = Vec<u8>> + '_ {
        let truncated = (0..archive.len()).map(|length| archive[..length].to_vec());
        let flipped = (0..archive.len()).flat_map(move |at| {
            [0x01, 0x80, 0xFF].into_iter().map(move |flip| {
                let mut flipped = archive.to_vec();
                flipped[at] ^= flip;
                flipped
            })
        });
        truncated.chain(flipped)
    }

    #[test]
    fn keeps_every_archive_the_testkit_makes_byte_for_byte() {
        let archives = testkit_archives();

        let refreshed: Vec<Vec<u8>> = archives.iter().map(|archive| refreshed(archive)).collect();

        assert_eq!(refreshed, archives);
    }

    #[test]
    fn keeps_every_archive_made_with_rar_byte_for_byte() {
        let archives = archives_made_with_rar();

        let refreshed: Vec<(PathBuf, Vec<u8>)> = archives
            .iter()
            .map(|(path, archive)| (path.clone(), refreshed(archive)))
            .collect();

        assert!(!archives.is_empty());
        assert_eq!(refreshed, archives);
    }

    #[test]
    fn rewrites_the_crc16_of_a_rar4_file_block_whose_name_or_size_changed() {
        let archive = one_page(RarFormat::RAR4);
        let unpacked_size_at = RAR4_FILE_BLOCK_AT + 11;

        let holds: Vec<bool> = [name_at(&archive), unpacked_size_at]
            .into_iter()
            .map(|at| {
                let mut changed = archive.clone();
                changed[at] ^= 0x01;
                rar4_block_crc_holds(&refreshed(&changed), RAR4_FILE_BLOCK_AT)
            })
            .collect();

        assert_eq!(holds, [true, true]);
    }

    #[test]
    fn rewrites_the_crc32_of_a_rar5_file_header_whose_name_or_size_changed() {
        let archive = one_page(RarFormat::RAR5);
        let unpacked_size_at = RAR5_FILE_HEADER_AT + 9;

        let holds: Vec<bool> = [name_at(&archive), unpacked_size_at]
            .into_iter()
            .map(|at| {
                let mut changed = archive.clone();
                changed[at] ^= 0x01;
                rar5_header_crc_holds(&refreshed(&changed), RAR5_FILE_HEADER_AT)
            })
            .collect();

        assert_eq!(holds, [true, true]);
    }

    #[test]
    fn restores_the_main_and_end_checksums_of_every_whole_plain_archive_made_with_rar() {
        let archives: Vec<(PathBuf, Vec<u8>)> = archives_made_with_rar()
            .into_iter()
            .filter(|(path, _)| {
                let name = path.to_string_lossy();
                !name.contains("multivolume") && !name.contains("encrypted-headers")
            })
            .collect();
        let zeroed: Vec<(PathBuf, Vec<u8>)> = archives
            .iter()
            .map(|(path, archive)| {
                let (main_crc, end_crc) = if archive.starts_with(b"Rar!\x1a\x07\x01") {
                    let end = archive.len() - RAR5_END_HEADER_BYTES;
                    (RAR5_MAIN_CRC, end..end + 4)
                } else {
                    let end = archive.len() - RAR4_END_BLOCK_BYTES;
                    (RAR4_MAIN_CRC, end..end + 2)
                };
                let mut zeroed = archive.clone();
                zeroed[main_crc].fill(0);
                zeroed[end_crc].fill(0);
                (path.clone(), zeroed)
            })
            .collect();

        let restored: Vec<(PathBuf, Vec<u8>)> = zeroed
            .iter()
            .map(|(path, archive)| (path.clone(), refreshed(archive)))
            .collect();

        assert_eq!(archives.len(), 12);
        assert_eq!(restored, archives);
    }

    #[test]
    fn leaves_bytes_without_a_rar_signature_untouched() {
        let inputs: [&[u8]; 4] = [
            b"",
            b"Rar!\x1a\x07",
            b"Rar!\x1a\x07\x02\x00\x00\x00\x00\x00",
            b"PK\x03\x04\x14\x00\x00\x00\x08\x00",
        ];

        let refreshed: Vec<Vec<u8>> = inputs.iter().map(|input| refreshed(input)).collect();

        assert_eq!(refreshed, inputs);
    }

    #[test]
    fn settles_after_one_pass_on_every_truncation_and_flipped_byte() {
        let mut archives = testkit_archives();
        archives.extend(archives_made_with_rar().into_iter().map(|(_, bytes)| bytes));

        let unsettled = archives
            .iter()
            .flat_map(|archive| damaged_copies(archive))
            .map(|archive| refreshed(&archive))
            .filter(|once| refreshed(once) != *once)
            .count();

        assert_eq!(unsettled, 0);
    }
}
