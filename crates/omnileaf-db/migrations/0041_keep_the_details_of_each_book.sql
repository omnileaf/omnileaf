CREATE TABLE book_details (
    book_id BLOB PRIMARY KEY REFERENCES book (id) ON DELETE CASCADE,
    series TEXT,
    number TEXT,
    title TEXT,
    volume INTEGER CHECK (volume >= 0),
    summary TEXT,
    publisher TEXT,
    format TEXT,
    language TEXT,
    reading_direction TEXT CHECK (reading_direction IN ('left_to_right', 'right_to_left')),
    age_rating TEXT CHECK (
        age_rating IN (
            'early_childhood', 'everyone', 'everyone_10', 'g', 'kids_to_adults', 'pg', 'teen',
            'ma_15', 'mature_17', 'm', 'adults_only_18', 'r_18', 'x_18'
        )
    ),
    year INTEGER CHECK (year >= 0)
) STRICT, WITHOUT ROWID;
