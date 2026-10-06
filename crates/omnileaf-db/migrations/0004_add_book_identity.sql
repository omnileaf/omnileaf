ALTER TABLE book ADD COLUMN content_fp BLOB CHECK (length(content_fp) = 32);

ALTER TABLE book ADD COLUMN fp_kind TEXT
    CHECK (fp_kind IN ('pmf1', 'dir1', 'raw1') AND (fp_kind IS NULL) = (content_fp IS NULL));

ALTER TABLE book ADD COLUMN logical_key TEXT;
