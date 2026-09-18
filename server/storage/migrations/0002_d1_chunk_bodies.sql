-- Personal D1-only Workers keep upload and published chunks in D1 BLOBs.
-- Official and legacy R2-backed Workers leave both columns NULL.
ALTER TABLE object_chunks ADD COLUMN data BLOB;
ALTER TABLE upload_chunks ADD COLUMN data BLOB;
