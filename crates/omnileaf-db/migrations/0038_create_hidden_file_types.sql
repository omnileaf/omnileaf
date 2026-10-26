CREATE TABLE hidden_file_type (
    file_type TEXT PRIMARY KEY CHECK (file_type != '' AND file_type = lower(file_type))
) STRICT, WITHOUT ROWID;
