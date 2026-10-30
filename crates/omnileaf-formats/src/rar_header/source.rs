use std::{
    io::{Read, Seek, SeekFrom},
    path::Path,
};

use crate::{FormatError, error::read_failed};

const ENDS_EARLY: &str = "a header or its data runs past the end of the file";
const CRC_CHUNK_BYTES: u64 = 64 * 1024;

pub(super) struct Source<'a, S> {
    inner: &'a mut S,
    path: &'a Path,
    position: u64,
    length: u64,
}

impl<'a, S: Read + Seek> Source<'a, S> {
    pub(super) fn new(inner: &'a mut S, path: &'a Path) -> Result<Self, FormatError> {
        let length = inner
            .seek(SeekFrom::End(0))
            .and_then(|length| inner.seek(SeekFrom::Start(0)).map(|_| length))
            .map_err(read_failed(path))?;
        Ok(Self {
            inner,
            path,
            position: 0,
            length,
        })
    }

    pub(super) const fn position(&self) -> u64 {
        self.position
    }

    pub(super) const fn is_at_end(&self) -> bool {
        self.position >= self.length
    }

    pub(super) fn starts_with(&mut self, signature: &[u8]) -> Result<bool, FormatError> {
        let length = signature.len() as u64;
        if length > self.length {
            return Ok(false);
        }
        let start = self.read(length)?;
        if start == signature {
            return Ok(true);
        }
        self.seek_to(0)?;
        Ok(false)
    }

    pub(super) fn read(&mut self, length: u64) -> Result<Vec<u8>, FormatError> {
        self.end_of(length)?;
        let mut bytes = vec![0; usize::try_from(length).map_err(|_| self.ends_early())?];
        self.inner
            .read_exact(&mut bytes)
            .map_err(read_failed(self.path))?;
        self.position += length;
        Ok(bytes)
    }

    pub(super) fn byte(&mut self) -> Result<u8, FormatError> {
        Ok(self.read(1)?.first().copied().unwrap_or_default())
    }

    pub(super) fn skip(&mut self, length: u64) -> Result<(), FormatError> {
        let end = self.end_of(length)?;
        self.seek_to(end)
    }

    pub(super) fn add_to_crc32(
        &mut self,
        crc: &mut flate2::Crc,
        length: u64,
    ) -> Result<(), FormatError> {
        let end = self.end_of(length)?;
        while self.position < end {
            let chunk = self.read((end - self.position).min(CRC_CHUNK_BYTES))?;
            crc.update(&chunk);
        }
        Ok(())
    }

    pub(super) fn ends_early(&self) -> FormatError {
        FormatError::CorruptRar {
            path: self.path.to_owned(),
            message: ENDS_EARLY.to_owned(),
        }
    }

    fn end_of(&self, length: u64) -> Result<u64, FormatError> {
        self.position
            .checked_add(length)
            .filter(|&end| end <= self.length)
            .ok_or_else(|| self.ends_early())
    }

    fn seek_to(&mut self, position: u64) -> Result<(), FormatError> {
        self.inner
            .seek(SeekFrom::Start(position))
            .map_err(read_failed(self.path))?;
        self.position = position;
        Ok(())
    }
}
