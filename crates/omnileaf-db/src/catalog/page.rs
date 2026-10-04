use crate::{
    Error,
    catalog::cursor::{Cursor, Position},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PageSize(u16);

impl PageSize {
    pub const MAX: u16 = 200;

    /// One row more than the page holds, so whether another page follows shows without a second query.
    pub(crate) fn rows_to_fetch(self) -> i64 {
        i64::from(self.0) + 1
    }

    fn items(self) -> usize {
        usize::from(self.0)
    }
}

impl TryFrom<u16> for PageSize {
    type Error = Error;

    fn try_from(requested: u16) -> Result<Self, Error> {
        if (1..=Self::MAX).contains(&requested) {
            Ok(Self(requested))
        } else {
            Err(Error::PageSize {
                requested,
                max: Self::MAX,
            })
        }
    }
}

#[derive(Clone, Debug)]
pub struct PageRequest {
    pub after: Option<Cursor>,
    pub size: PageSize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Page<T> {
    pub items: Vec<T>,
    /// Absent on the last page.
    pub next: Option<Cursor>,
}

impl<T> Page<T> {
    /// Takes the rows fetched for a page of `size`, where a row beyond the page means another page follows.
    pub(crate) fn of(mut rows: Vec<(T, Position)>, size: PageSize) -> Self {
        let has_more = rows.len() > size.items();
        rows.truncate(size.items());
        let next = rows
            .last()
            .filter(|_| has_more)
            .map(|(_, position)| Cursor(position.clone()));
        Self {
            items: rows.into_iter().map(|(item, _)| item).collect(),
            next,
        }
    }
}
