-- Store the Things Cloud task UUID created for a Telemail reminder.
-- NULL means Things sync was disabled, not attempted yet, or failed before a task id was recorded.
ALTER TABLE reminders ADD COLUMN things_task_id TEXT;
