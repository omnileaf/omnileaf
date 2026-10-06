CREATE TABLE sync_local (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    node_id BLOB NOT NULL CHECK (length(node_id) = 16),
    hlc INTEGER NOT NULL CHECK (hlc >= 0),
    next_seq INTEGER NOT NULL CHECK (next_seq >= 1),
    install_nonce BLOB NOT NULL CHECK (length(install_nonce) = 16)
) STRICT;

INSERT INTO sync_local (id, node_id, hlc, next_seq, install_nonce)
VALUES (1, randomblob(16), 0, 1, randomblob(16));

CREATE TABLE sync_register (
    entity TEXT NOT NULL,
    id BLOB NOT NULL CHECK (length(id) = 16),
    field TEXT NOT NULL,
    class TEXT NOT NULL CHECK (class IN ('lww', 'max')),
    hlc INTEGER NOT NULL CHECK (hlc >= 0),
    node BLOB NOT NULL CHECK (length(node) = 16),
    seq INTEGER NOT NULL CHECK (seq >= 1),
    rank INTEGER CHECK (rank >= 0 AND (rank IS NULL) = (class = 'lww')),
    value BLOB NOT NULL,
    ext BLOB,
    PRIMARY KEY (entity, id, field)
) STRICT, WITHOUT ROWID;
