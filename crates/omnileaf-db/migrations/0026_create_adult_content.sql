CREATE TABLE adult_content (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    treatment TEXT NOT NULL CHECK (treatment IN ('show', 'blur', 'hide')),
    counts_age_ratings INTEGER NOT NULL CHECK (counts_age_ratings IN (0, 1))
) STRICT;
