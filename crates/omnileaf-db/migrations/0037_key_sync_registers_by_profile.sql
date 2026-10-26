ALTER TABLE sync_register RENAME TO sync_register_before_profiles;

CREATE TABLE sync_register (
    profile BLOB NOT NULL CHECK (length(profile) = 16),
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
    PRIMARY KEY (profile, entity, id, field)
) STRICT, WITHOUT ROWID;

INSERT INTO sync_register (profile, entity, id, field, class, hlc, node, seq, rank, value, ext)
SELECT x'767c5c13abfd8f4a8c579d6a095c701d', entity, id, field, class, hlc, node, seq, rank,
    value, ext
FROM sync_register_before_profiles;

DROP TABLE sync_register_before_profiles;

ALTER TABLE sync_local ADD COLUMN profile BLOB NOT NULL
    DEFAULT x'767c5c13abfd8f4a8c579d6a095c701d' CHECK (length(profile) = 16);
