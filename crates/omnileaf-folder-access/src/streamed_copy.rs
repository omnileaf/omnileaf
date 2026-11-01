use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Seek, SeekFrom},
    path::PathBuf,
    process,
    sync::atomic::{AtomicU64, Ordering},
};

use omnileaf_formats::Limits;

static COPIES_MADE: AtomicU64 = AtomicU64::new(0);

/// Holds the copies of streamed documents a reader can seek in, each unlinked as soon as it is made.
#[derive(Debug)]
pub(crate) struct StreamedCopies {
    folder: PathBuf,
    limit: u64,
}

impl StreamedCopies {
    pub(crate) fn new(folder: PathBuf) -> Self {
        Self {
            folder,
            limit: Limits::default().max_total_bytes,
        }
    }

    pub(crate) fn seekable(&self, document: File) -> io::Result<File> {
        if document.metadata().is_ok_and(|metadata| metadata.is_file()) {
            Ok(document)
        } else {
            self.copy(document)
        }
    }

    fn copy(&self, streamed: File) -> io::Result<File> {
        let mut copy = self.unnamed_copy()?;
        let copied = io::copy(&mut streamed.take(self.limit.saturating_add(1)), &mut copy)?;
        if copied > self.limit {
            return Err(io::Error::new(
                io::ErrorKind::FileTooLarge,
                format!("streamed document is over {} bytes", self.limit),
            ));
        }
        copy.seek(SeekFrom::Start(0))?;
        Ok(copy)
    }

    fn unnamed_copy(&self) -> io::Result<File> {
        fs::create_dir_all(&self.folder)?;
        loop {
            let serial = COPIES_MADE.fetch_add(1, Ordering::Relaxed);
            let path = self.folder.join(format!("{}-{serial}", process::id()));
            let created = OpenOptions::new()
                .read(true)
                .write(true)
                .create_new(true)
                .open(&path);
            match created {
                Ok(copy) => {
                    fs::remove_file(&path)?;
                    return Ok(copy);
                }
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
                Err(error) => return Err(error),
            }
        }
    }
}

#[cfg(all(test, unix))]
mod tests {
    use std::{io::Write, os::fd::OwnedFd, thread};

    use omnileaf_testkit::ScratchFolder;

    use super::*;

    const BOOK: &[u8] = b"book";

    fn streamed(bytes: &'static [u8]) -> File {
        let (reader, mut writer) = io::pipe().unwrap();
        thread::spawn(move || {
            let _ = writer.write_all(bytes);
        });
        File::from(OwnedFd::from(reader))
    }

    fn read_all(mut file: File) -> Vec<u8> {
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).unwrap();
        bytes
    }

    #[test]
    fn copies_a_streamed_document_into_a_file_it_can_seek() {
        let folder = ScratchFolder::new("streamed-copies");
        let copies = StreamedCopies::new(folder.path().to_path_buf());

        let mut file = copies.seekable(streamed(BOOK)).unwrap();
        file.seek(SeekFrom::Start(1)).unwrap();

        assert_eq!(read_all(file), b"ook");
        assert_eq!(fs::read_dir(folder.path()).unwrap().count(), 0);
    }

    #[test]
    fn copies_a_streamed_document_past_a_copy_left_behind() {
        let folder = ScratchFolder::new("left-behind-copies");
        let copies = StreamedCopies::new(folder.path().to_path_buf());
        let left_behind = format!("{}-{}", process::id(), COPIES_MADE.load(Ordering::SeqCst));
        folder.write(&left_behind, b"");

        let file = copies.seekable(streamed(BOOK)).unwrap();

        assert_eq!(read_all(file), BOOK);
    }

    #[test]
    fn refuses_a_streamed_document_larger_than_the_limit() {
        let folder = ScratchFolder::new("limited-copies");
        let copies = StreamedCopies {
            limit: 3,
            ..StreamedCopies::new(folder.path().to_path_buf())
        };

        let copied = copies.seekable(streamed(BOOK));

        assert_eq!(copied.unwrap_err().kind(), io::ErrorKind::FileTooLarge);
    }

    #[test]
    fn leaves_a_document_that_is_already_a_file_alone() {
        let folder = ScratchFolder::new("seekable-copies");
        let book = File::open(folder.write("a.cbz", BOOK)).unwrap();
        let copies = StreamedCopies::new(folder.path().join("copies"));

        let file = copies.seekable(book).unwrap();

        assert_eq!(read_all(file), BOOK);
        assert!(!folder.path().join("copies").exists());
    }
}
