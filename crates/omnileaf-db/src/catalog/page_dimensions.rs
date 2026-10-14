use rusqlite::{Connection, OptionalExtension, Transaction};

use crate::{Error, catalog::BookFileId};

const PAGES_OF_FILE: &str = "SELECT manifest FROM book_pages WHERE file_id = ?1 AND rev = ?2";
const STORE_PAGES: &str = "INSERT INTO book_pages (file_id, rev, manifest) VALUES (?1, ?2, ?3)
    ON CONFLICT (file_id) DO UPDATE SET rev = excluded.rev, manifest = excluded.manifest";
const BYTES_PER_PAGE: usize = 8;
const UNKNOWN: u32 = 0;

/// A page's size in pixels, as its image's header gives it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct PageDimensions {
    pub width: u32,
    pub height: u32,
}

/// The size of each page of a book file at `rev`, in reading order, or nothing until they are stored for that revision.
#[tracing::instrument(skip_all, fields(%file, rev))]
pub fn page_dimensions(
    connection: &Connection,
    file: BookFileId,
    rev: u32,
) -> Result<Option<Vec<Option<PageDimensions>>>, Error> {
    let manifest: Option<Vec<u8>> = connection
        .prepare(PAGES_OF_FILE)?
        .query_row((file.0, rev), |row| row.get(0))
        .optional()?;
    Ok(manifest.as_deref().map(from_manifest))
}

/// Replaces whatever sizes were stored for the file, a page whose size isn't known included as unknown.
#[tracing::instrument(skip_all, fields(%file, rev, pages = pages.len()))]
pub fn store_page_dimensions(
    transaction: &Transaction<'_>,
    file: BookFileId,
    rev: u32,
    pages: &[Option<PageDimensions>],
) -> Result<(), Error> {
    transaction.execute(STORE_PAGES, (file.0, rev, to_manifest(pages)))?;
    Ok(())
}

fn to_manifest(pages: &[Option<PageDimensions>]) -> Vec<u8> {
    pages
        .iter()
        .flat_map(|page| {
            let PageDimensions { width, height } = page.unwrap_or(PageDimensions {
                width: UNKNOWN,
                height: UNKNOWN,
            });
            [width.to_le_bytes(), height.to_le_bytes()]
        })
        .flatten()
        .collect()
}

fn from_manifest(manifest: &[u8]) -> Vec<Option<PageDimensions>> {
    let (pages, _) = manifest.as_chunks::<BYTES_PER_PAGE>();
    pages
        .iter()
        .map(|page| {
            let (width, height) = page.split_at(BYTES_PER_PAGE / 2);
            let dimensions = PageDimensions {
                width: u32::from_le_bytes(width.try_into().ok()?),
                height: u32::from_le_bytes(height.try_into().ok()?),
            };
            (dimensions.width != UNKNOWN && dimensions.height != UNKNOWN).then_some(dimensions)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use proptest::prelude::*;

    use super::*;
    use crate::scratch::ScratchLibrary;

    fn dimensions() -> impl Strategy<Value = Option<PageDimensions>> {
        prop::option::of(
            (1_u32.., 1_u32..).prop_map(|(width, height)| PageDimensions { width, height }),
        )
    }

    proptest! {
        #[test]
        fn reads_back_every_page_size_it_stored(pages in prop::collection::vec(dimensions(), 0..64)) {
            let manifest = to_manifest(&pages);

            let read = from_manifest(&manifest);

            prop_assert_eq!(manifest.len(), pages.len() * BYTES_PER_PAGE);
            prop_assert_eq!(read, pages);
        }
    }

    #[test]
    fn reads_a_file_s_page_sizes_by_its_key() {
        let scratch = ScratchLibrary::new("page-dimensions-plan");

        let plan = scratch.query_plan(PAGES_OF_FILE);

        assert_eq!(
            plan,
            ["SEARCH book_pages USING INTEGER PRIMARY KEY (rowid=?)"]
        );
    }
}
