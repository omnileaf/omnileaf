use std::io::{self, Read, Seek, SeekFrom};

const BLOCK_LENGTH: u64 = 64 * 1024;

/// Serves small reads from one cached block, so listing an archive costs a few reads of the file rather than several per entry.
#[derive(Debug)]
pub(crate) struct BlockReader<R> {
    inner: R,
    length: u64,
    position: u64,
    block: Vec<u8>,
    block_start: u64,
}

impl<R: Read + Seek> BlockReader<R> {
    pub(crate) fn new(mut inner: R) -> io::Result<Self> {
        let length = inner.seek(SeekFrom::End(0))?;
        Ok(Self {
            inner,
            length,
            position: 0,
            block: Vec::new(),
            block_start: 0,
        })
    }

    fn cached(&self) -> &[u8] {
        self.position
            .checked_sub(self.block_start)
            .and_then(|offset| usize::try_from(offset).ok())
            .and_then(|offset| self.block.get(offset..))
            .unwrap_or_default()
    }

    fn fill_block(&mut self) -> io::Result<()> {
        self.inner.seek(SeekFrom::Start(self.position))?;
        self.block.clear();
        (&mut self.inner)
            .take(BLOCK_LENGTH)
            .read_to_end(&mut self.block)?;
        self.block_start = self.position;
        Ok(())
    }

    fn read_past_the_block(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        self.inner.seek(SeekFrom::Start(self.position))?;
        self.inner.read(buf)
    }
}

impl<R: Read + Seek> Read for BlockReader<R> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let count = if !self.cached().is_empty() {
            self.cached().read(buf)?
        } else if u64::try_from(buf.len()).is_ok_and(|wanted| wanted >= BLOCK_LENGTH) {
            self.read_past_the_block(buf)?
        } else {
            self.fill_block()?;
            self.cached().read(buf)?
        };
        self.position = self.position.saturating_add(count as u64);
        Ok(count)
    }
}

impl<R: Read + Seek> Seek for BlockReader<R> {
    fn seek(&mut self, to: SeekFrom) -> io::Result<u64> {
        let position = match to {
            SeekFrom::Start(offset) => Some(offset),
            SeekFrom::End(offset) => self.length.checked_add_signed(offset),
            SeekFrom::Current(offset) => self.position.checked_add_signed(offset),
        };
        self.position = position.ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidInput,
                "seek before the start of the file",
            )
        })?;
        Ok(self.position)
    }
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use proptest::prelude::*;

    use super::*;

    const MAX_FILE_LENGTH: usize = 200_000;
    const MAX_OFFSET: i64 = 200_000;
    const MAX_READ: usize = 100_000;
    const BYTE_MODULUS: usize = 251;

    #[derive(Clone, Debug)]
    enum Step {
        Read(usize),
        Seek(SeekFrom),
    }

    fn step() -> impl Strategy<Value = Step> {
        let offset = -MAX_OFFSET..MAX_OFFSET;
        prop_oneof![
            (0..MAX_READ).prop_map(Step::Read),
            (0..MAX_FILE_LENGTH as u64 + 10).prop_map(|to| Step::Seek(SeekFrom::Start(to))),
            offset.clone().prop_map(|by| Step::Seek(SeekFrom::End(by))),
            offset.prop_map(|by| Step::Seek(SeekFrom::Current(by))),
        ]
    }

    fn take(reader: &mut impl Read, length: usize) -> Vec<u8> {
        let mut bytes = Vec::new();
        reader.take(length as u64).read_to_end(&mut bytes).unwrap();
        bytes
    }

    proptest! {
        #[test]
        fn reads_and_seeks_exactly_like_the_file_beneath(
            length in 0..MAX_FILE_LENGTH,
            steps in proptest::collection::vec(step(), 1..40),
        ) {
            let content: Vec<u8> = (0..length).map(|index| u8::try_from(index % BYTE_MODULUS).unwrap()).collect();
            let mut plain = Cursor::new(content.clone());
            let mut cached = BlockReader::new(Cursor::new(content)).unwrap();

            for step in steps {
                match step {
                    Step::Read(length) => {
                        prop_assert_eq!(take(&mut cached, length), take(&mut plain, length));
                    }
                    Step::Seek(to) => {
                        prop_assert_eq!(cached.seek(to).ok(), plain.seek(to).ok());
                    }
                }
                prop_assert_eq!(cached.stream_position().unwrap(), plain.stream_position().unwrap());
            }
        }
    }
}
