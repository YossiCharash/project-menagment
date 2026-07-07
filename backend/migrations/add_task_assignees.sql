-- Add the task_assignees join table for multiple assignees per task.
--
-- Rationale: A task may now be assigned to SEVERAL true assignees (co-owners),
-- not just one. The single tasks.assigned_to_user_id column remains the PRIMARY
-- assignee (the first of the set); this table layers the full assignee set on
-- top. The Task model declares an ``assignees`` many-to-many relationship, but
-- the live schema was created via create_all (which never alters existing
-- tables), so the join table must be added by hand.
--
-- Backfill: every existing task's current single assignee becomes its first
-- assignee, so already-created tasks behave identically after the change.

CREATE TABLE IF NOT EXISTS task_assignees (
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_task_assignees_user_id ON task_assignees (user_id);

INSERT INTO task_assignees (task_id, user_id)
SELECT id, assigned_to_user_id FROM tasks
WHERE assigned_to_user_id IS NOT NULL
ON CONFLICT DO NOTHING;
