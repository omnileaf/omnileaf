ALTER TABLE series_folder ADD COLUMN group_key BLOB NOT NULL DEFAULT x'';

CREATE INDEX series_folder_by_group
ON series_folder (group_key, root_id, group_location, series_local_id);

CREATE INDEX series_folder_in_group ON series_folder (root_id, group_location, series_local_id);

UPDATE title_key_stamp SET stamp = zeroblob(16);
