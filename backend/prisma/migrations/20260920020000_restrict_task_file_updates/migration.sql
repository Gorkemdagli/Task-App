-- Allow authenticated users to soft-delete task files without mutating identity or storage columns.
REVOKE UPDATE ON "task_files" FROM authenticated;
GRANT UPDATE ("deleted_at", "deleted_by_id") ON "task_files" TO authenticated;
