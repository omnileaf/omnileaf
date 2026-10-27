CREATE INDEX series_with_duplicates_by_stage ON series (reading_stage)
    WHERE duplicated_books > 0;
