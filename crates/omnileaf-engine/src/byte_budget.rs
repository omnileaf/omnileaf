use crate::{
    library_layout::BookForm,
    weighted_semaphore::{Held, WeightedSemaphore},
};

pub(crate) struct ByteBudget(WeightedSemaphore);

impl ByteBudget {
    pub(crate) const fn new(total: u64) -> Self {
        Self(WeightedSemaphore::new(total))
    }

    pub(crate) fn hold_for(&self, form: BookForm) -> Option<Held<'_>> {
        match form {
            BookForm::File { listed_bytes } => Some(self.0.hold(listed_bytes.get())),
            BookForm::FileOfUnlistedSize => Some(self.0.hold_all()),
            BookForm::FolderOfImages => None,
        }
    }
}
