-- Reports read activity by time range; retention deletes it by end time.
CREATE INDEX activity_range ON activity(started_at, ended_at);
CREATE INDEX activity_ended ON activity(ended_at);
