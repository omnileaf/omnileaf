ALTER TABLE series ADD COLUMN cover_file_id INTEGER;

CREATE VIEW series_cover_file (series_local_id, file_id) AS
SELECT series.local_id, (
    SELECT (SELECT min(book_file.id) FROM book_file WHERE book_file.book_id = book.id)
    FROM book
    WHERE book.series_local_id = series.local_id
        AND EXISTS (SELECT 1 FROM book_file WHERE book_file.book_id = book.id)
    ORDER BY book.reading_order_key, book.id
    LIMIT 1
)
FROM series;

UPDATE series SET cover_file_id = (
    SELECT file_id FROM series_cover_file WHERE series_local_id = series.local_id
);

CREATE TRIGGER book_file_covers_series_after_insert AFTER INSERT ON book_file BEGIN
    UPDATE series SET cover_file_id = recovered.file_id
    FROM series_cover_file AS recovered
    WHERE recovered.series_local_id = series.local_id
        AND cover_file_id IS NOT recovered.file_id
        AND local_id = (SELECT series_local_id FROM book WHERE id = new.book_id)
        AND (
            cover_file_id IS NULL
            OR cover_file_id > new.id
            OR EXISTS (
                SELECT 1 FROM book_file AS covering
                JOIN book AS covered ON covered.id = covering.book_id
                JOIN book AS gaining ON gaining.id = new.book_id
                WHERE covering.id = series.cover_file_id
                    AND (gaining.reading_order_key, gaining.id)
                        < (covered.reading_order_key, covered.id)
            )
        );
END;

CREATE TRIGGER book_file_uncovers_series_after_delete AFTER DELETE ON book_file BEGIN
    UPDATE series SET cover_file_id = recovered.file_id
    FROM series_cover_file AS recovered
    WHERE recovered.series_local_id = series.local_id
        AND cover_file_id IS NOT recovered.file_id
        AND local_id = (SELECT series_local_id FROM book WHERE id = old.book_id)
        AND cover_file_id = old.id;
END;

CREATE TRIGGER book_file_covers_series_again_after_move AFTER UPDATE OF book_id ON book_file
WHEN old.book_id != new.book_id
BEGIN
    UPDATE series SET cover_file_id = recovered.file_id
    FROM series_cover_file AS recovered
    WHERE recovered.series_local_id = series.local_id
        AND cover_file_id IS NOT recovered.file_id
        AND local_id IN (
            (SELECT series_local_id FROM book WHERE id = old.book_id),
            (SELECT series_local_id FROM book WHERE id = new.book_id)
        );
END;

CREATE TRIGGER book_uncovers_series_after_delete AFTER DELETE ON book BEGIN
    UPDATE series SET cover_file_id = recovered.file_id
    FROM series_cover_file AS recovered
    WHERE recovered.series_local_id = series.local_id
        AND cover_file_id IS NOT recovered.file_id
        AND local_id = old.series_local_id
        AND cover_file_id IS NOT NULL;
END;

CREATE TRIGGER book_covers_series_again_after_move
AFTER UPDATE OF series_local_id, reading_order_key ON book
WHEN (
    old.series_local_id != new.series_local_id
    OR old.reading_order_key IS NOT new.reading_order_key
) AND EXISTS (SELECT 1 FROM book_file WHERE book_id = new.id)
BEGIN
    UPDATE series SET cover_file_id = recovered.file_id
    FROM series_cover_file AS recovered
    WHERE recovered.series_local_id = series.local_id
        AND cover_file_id IS NOT recovered.file_id
        AND local_id IN (old.series_local_id, new.series_local_id);
END;
