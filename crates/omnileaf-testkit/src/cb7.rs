use std::io::Cursor;

use sevenz_rust2::{
    ArchiveEntry as SevenZipEntry, ArchiveWriter, SourceReader, encoder_options::Lzma2Options,
};

use crate::{ArchiveEntry, FixtureError};

const FOLDER_SUFFIX: char = '/';
const FASTEST_PRESET: u32 = 1;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Packing {
    Solid,
    PerEntry,
}

pub fn cb7(entries: &[ArchiveEntry], packing: Packing) -> Result<Vec<u8>, FixtureError> {
    let mut writer = ArchiveWriter::new(Cursor::new(Vec::new()))?;
    writer.set_content_methods(vec![Lzma2Options::from_level(FASTEST_PRESET).into()]);
    let (folders, files): (Vec<_>, Vec<_>) = entries
        .iter()
        .partition(|entry| entry.name.ends_with(FOLDER_SUFFIX));
    for folder in folders {
        let name = folder.name.trim_end_matches(FOLDER_SUFFIX);
        writer.push_archive_entry::<&[u8]>(SevenZipEntry::new_directory(name), None)?;
    }
    let (empty, files): (Vec<_>, Vec<_>) =
        files.into_iter().partition(|file| file.bytes.is_empty());
    for file in empty {
        writer.push_archive_entry::<&[u8]>(SevenZipEntry::new_file(&file.name), None)?;
    }
    match packing {
        Packing::Solid if !files.is_empty() => {
            let names = files
                .iter()
                .map(|file| SevenZipEntry::new_file(&file.name))
                .collect();
            let contents = files
                .iter()
                .map(|file| SourceReader::new(file.bytes.as_slice()))
                .collect();
            writer.push_archive_entries(names, contents)?;
        }
        Packing::Solid => {}
        Packing::PerEntry => {
            for file in files {
                writer.push_archive_entry(
                    SevenZipEntry::new_file(&file.name),
                    Some(file.bytes.as_slice()),
                )?;
            }
        }
    }
    let output = writer.finish().map_err(sevenz_rust2::Error::from)?;
    Ok(output.into_inner())
}
