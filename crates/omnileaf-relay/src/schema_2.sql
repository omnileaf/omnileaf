ALTER TABLE reports ADD COLUMN problem BLOB CHECK (problem IS NULL OR length(problem) = 32);

CREATE INDEX reports_by_problem ON reports (problem, platform) WHERE problem IS NOT NULL AND issue IS NOT NULL;
