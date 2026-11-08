-- Full-text index over task titles and descriptions (SQLite FTS5, supported on D1).
-- A contentful table keyed by task_id instead of an external-content table: tasks has a text primary key,
-- so its implicit rowid can change on VACUUM and would silently desync an external-content index.
CREATE VIRTUAL TABLE `tasks_fts` USING fts5(task_id UNINDEXED, title, description, tokenize = 'unicode61 remove_diacritics 2');
--> statement-breakpoint
INSERT INTO `tasks_fts` (task_id, title, description) SELECT id, title, description FROM `tasks`;
--> statement-breakpoint
CREATE TRIGGER `tasks_fts_ai` AFTER INSERT ON `tasks` BEGIN
  INSERT INTO `tasks_fts` (task_id, title, description) VALUES (new.id, new.title, new.description);
END;
--> statement-breakpoint
CREATE TRIGGER `tasks_fts_ad` AFTER DELETE ON `tasks` BEGIN
  DELETE FROM `tasks_fts` WHERE task_id = old.id;
END;
--> statement-breakpoint
CREATE TRIGGER `tasks_fts_au` AFTER UPDATE OF title, description ON `tasks` BEGIN
  UPDATE `tasks_fts` SET title = new.title, description = new.description WHERE task_id = old.id;
END;
