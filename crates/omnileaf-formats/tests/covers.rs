#![expect(
    clippy::unwrap_used,
    reason = "the book is generated in a scratch folder, so a failed set-up should stop the test"
)]

mod support;

use omnileaf_formats::{Book, ComicInfo, PageInfo, PageKind, open_book};
use omnileaf_testkit::{Compression, PageShape, cbz, page_png};
use support::{ScratchFolder, entry};

const PAGES: u32 = 3;

fn three_page_book(scratch: &ScratchFolder) -> Book {
    let pages: Vec<_> = (0..PAGES)
        .map(|index| {
            let page = page_png(4, index, PageShape::Portrait).unwrap();
            entry(&format!("{:02}.png", index + 1), page)
        })
        .collect();
    let path = scratch.write("book.cbz", &cbz(&pages, Compression::Stored).unwrap());
    open_book(&path).unwrap()
}

fn marking_front_covers(images: &[u32]) -> ComicInfo {
    ComicInfo {
        pages: images
            .iter()
            .map(|&image| PageInfo {
                image,
                kind: Some(PageKind::FrontCover),
                ..PageInfo::default()
            })
            .collect(),
        ..ComicInfo::default()
    }
}

#[test]
fn shows_the_first_page_of_a_book_without_comic_info() {
    let scratch = ScratchFolder::new("no-comic-info");
    let book = three_page_book(&scratch);

    let cover = book.cover_page(None);

    assert_eq!(cover, 0);
}

#[test]
fn shows_the_page_comic_info_marks_as_the_front_cover() {
    let scratch = ScratchFolder::new("marked");
    let book = three_page_book(&scratch);
    let info = ComicInfo {
        pages: vec![
            PageInfo {
                image: 0,
                kind: Some(PageKind::Advertisement),
                ..PageInfo::default()
            },
            PageInfo {
                image: 2,
                kind: Some(PageKind::FrontCover),
                ..PageInfo::default()
            },
        ],
        ..ComicInfo::default()
    };

    let cover = book.cover_page(Some(&info));

    assert_eq!(cover, 2);
}

#[test]
fn takes_the_first_of_several_pages_marked_as_the_front_cover() {
    let scratch = ScratchFolder::new("marked-twice");
    let book = three_page_book(&scratch);

    let cover = book.cover_page(Some(&marking_front_covers(&[1, 2])));

    assert_eq!(cover, 1);
}

#[test]
fn shows_the_first_page_when_the_marked_front_cover_is_not_one_of_its_pages() {
    let scratch = ScratchFolder::new("marked-missing");
    let book = three_page_book(&scratch);

    let cover = book.cover_page(Some(&marking_front_covers(&[PAGES])));

    assert_eq!(cover, 0);
}
