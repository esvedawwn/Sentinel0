CREATE TABLE `scans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text NOT NULL,
	`mode` text DEFAULT 'simulate' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`files_scanned` integer DEFAULT 0 NOT NULL,
	`folders_scanned` integer DEFAULT 0 NOT NULL,
	`files_total` integer DEFAULT 0 NOT NULL,
	`bytes_scanned` integer DEFAULT 0 NOT NULL,
	`progress_percent` integer DEFAULT 0 NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`error_message` text,
	`duplicates_found` integer DEFAULT 0 NOT NULL,
	`corrupted_found` integer DEFAULT 0 NOT NULL,
	`findings_count` integer DEFAULT 0 NOT NULL,
	`hashes_computed` integer DEFAULT 0 NOT NULL,
	`hashes_total` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`label` text NOT NULL,
	`icon` text NOT NULL,
	`subfolders` text DEFAULT '[]' NOT NULL,
	`extensions` text DEFAULT '[]' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scan_id` integer,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`extension` text DEFAULT '' NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`category` text DEFAULT 'Documents' NOT NULL,
	`subcategory` text,
	`status` text DEFAULT 'ready' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`renamed_name` text,
	`file_created_at` integer,
	`file_modified_at` integer,
	`created_at` integer NOT NULL,
	`indexed_at` integer NOT NULL,
	FOREIGN KEY (`scan_id`) REFERENCES `scans`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `files_path_idx` ON `files` (`path`);--> statement-breakpoint
CREATE INDEX `files_name_idx` ON `files` (`name`);--> statement-breakpoint
CREATE INDEX `files_extension_idx` ON `files` (`extension`);--> statement-breakpoint
CREATE INDEX `files_category_idx` ON `files` (`category`);--> statement-breakpoint
CREATE INDEX `files_scan_id_idx` ON `files` (`scan_id`);--> statement-breakpoint
CREATE INDEX `files_file_modified_at_idx` ON `files` (`file_modified_at`);--> statement-breakpoint
CREATE TABLE `duplicate_group_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` integer NOT NULL,
	`file_id` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `duplicate_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `duplicate_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scan_id` integer,
	`hash` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`total_size_bytes` integer DEFAULT 0 NOT NULL,
	`saved_bytes` integer DEFAULT 0 NOT NULL,
	`confidence` real DEFAULT 1 NOT NULL,
	`explanation` text DEFAULT '' NOT NULL,
	`canonical_finding_id` integer,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`scan_id`) REFERENCES `scans`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`canonical_finding_id`) REFERENCES `findings`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `duplicate_groups_scan_id_idx` ON `duplicate_groups` (`scan_id`);--> statement-breakpoint
CREATE INDEX `duplicate_groups_hash_idx` ON `duplicate_groups` (`hash`);--> statement-breakpoint
CREATE TABLE `activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scan_id` integer,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'info' NOT NULL,
	`timestamp` integer NOT NULL,
	`meta` text,
	FOREIGN KEY (`scan_id`) REFERENCES `scans`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `activity_scan_id_idx` ON `activity` (`scan_id`);--> statement-breakpoint
CREATE TABLE `findings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scan_id` integer NOT NULL,
	`type` text NOT NULL,
	`path` text NOT NULL,
	`name` text NOT NULL,
	`extension` text DEFAULT '' NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`hash` text,
	`duplicate_group_hash` text,
	`duplicate_group_id` integer,
	`finding_status` text NOT NULL,
	`risk_level` text DEFAULT 'low' NOT NULL,
	`review_status` text DEFAULT 'new' NOT NULL,
	`reviewed_at` integer,
	`reason` text DEFAULT '' NOT NULL,
	`file_created_at` integer,
	`file_modified_at` integer,
	`ai_category` text,
	`ai_subcategory` text,
	`ai_confidence` integer,
	`ai_explanation` text,
	`ai_tags` text,
	`ai_suggested_destination` text,
	`ai_suggested_action` text,
	`ai_provider` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`scan_id`) REFERENCES `scans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `findings_path_idx` ON `findings` (`path`);--> statement-breakpoint
CREATE INDEX `findings_name_idx` ON `findings` (`name`);--> statement-breakpoint
CREATE INDEX `findings_extension_idx` ON `findings` (`extension`);--> statement-breakpoint
CREATE INDEX `findings_ai_category_idx` ON `findings` (`ai_category`);--> statement-breakpoint
CREATE INDEX `findings_file_modified_at_idx` ON `findings` (`file_modified_at`);--> statement-breakpoint
CREATE INDEX `findings_hash_idx` ON `findings` (`hash`);--> statement-breakpoint
CREATE INDEX `findings_scan_id_idx` ON `findings` (`scan_id`);--> statement-breakpoint
CREATE INDEX `findings_duplicate_group_id_idx` ON `findings` (`duplicate_group_id`);--> statement-breakpoint
CREATE TABLE `scan_roots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text NOT NULL,
	`label` text,
	`scan_count` integer DEFAULT 0 NOT NULL,
	`last_scanned_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scan_roots_path_unique` ON `scan_roots` (`path`);--> statement-breakpoint
CREATE INDEX `scan_roots_path_idx` ON `scan_roots` (`path`);--> statement-breakpoint
CREATE TABLE `ai_classifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`finding_id` integer NOT NULL,
	`provider` text NOT NULL,
	`category` text NOT NULL,
	`subcategory` text,
	`confidence` integer NOT NULL,
	`explanation` text DEFAULT '' NOT NULL,
	`suggested_destination` text,
	`suggested_action` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`finding_id`) REFERENCES `findings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_classifications_finding_id_idx` ON `ai_classifications` (`finding_id`);--> statement-breakpoint
CREATE INDEX `ai_classifications_category_idx` ON `ai_classifications` (`category`);--> statement-breakpoint
CREATE TABLE `semantic_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`finding_id` integer NOT NULL,
	`tag` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`finding_id`) REFERENCES `findings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `semantic_tags_finding_id_idx` ON `semantic_tags` (`finding_id`);--> statement-breakpoint
CREATE INDEX `semantic_tags_tag_idx` ON `semantic_tags` (`tag`);--> statement-breakpoint
CREATE UNIQUE INDEX `semantic_tags_finding_tag_unique` ON `semantic_tags` (`finding_id`,`tag`);--> statement-breakpoint
CREATE TABLE `ignored_findings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`finding_id` integer NOT NULL,
	`reason` text,
	`ignored_at` integer NOT NULL,
	FOREIGN KEY (`finding_id`) REFERENCES `findings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ignored_findings_finding_id_unique` ON `ignored_findings` (`finding_id`);--> statement-breakpoint
CREATE INDEX `ignored_findings_finding_id_idx` ON `ignored_findings` (`finding_id`);--> statement-breakpoint
CREATE TABLE `file_hashes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`modified_at` integer,
	`hash` text NOT NULL,
	`algo` text DEFAULT 'sha256' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_hashes_path_unique` ON `file_hashes` (`path`);--> statement-breakpoint
CREATE INDEX `file_hashes_path_idx` ON `file_hashes` (`path`);--> statement-breakpoint
CREATE INDEX `file_hashes_hash_idx` ON `file_hashes` (`hash`);--> statement-breakpoint
CREATE TABLE `saved_searches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`query` text DEFAULT '' NOT NULL,
	`filters` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `saved_searches_created_at_idx` ON `saved_searches` (`created_at`);--> statement-breakpoint
CREATE TABLE `search_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`query` text NOT NULL,
	`filters` text NOT NULL,
	`result_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `search_history_created_at_idx` ON `search_history` (`created_at`);--> statement-breakpoint
CREATE TABLE `finding_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`finding_id` integer NOT NULL,
	`action` text NOT NULL,
	`previous_review_status` text,
	`new_review_status` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`finding_id`) REFERENCES `findings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `finding_audit_finding_id_idx` ON `finding_audit` (`finding_id`);--> statement-breakpoint
CREATE INDEX `finding_audit_created_at_idx` ON `finding_audit` (`created_at`);--> statement-breakpoint
CREATE TABLE `action_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`finding_id` integer NOT NULL,
	`action_type` text NOT NULL,
	`proposed_destination` text,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`finding_id`) REFERENCES `findings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `action_queue_finding_id_idx` ON `action_queue` (`finding_id`);--> statement-breakpoint
CREATE INDEX `action_queue_status_idx` ON `action_queue` (`status`);--> statement-breakpoint
CREATE TABLE `extracted_text` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`finding_id` integer NOT NULL,
	`extractor` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`truncated` integer DEFAULT false NOT NULL,
	`sensitive_categories` text DEFAULT '[]' NOT NULL,
	`ocr_provider` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`finding_id`) REFERENCES `findings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `extracted_text_finding_id_idx` ON `extracted_text` (`finding_id`);--> statement-breakpoint
CREATE INDEX `extracted_text_created_at_idx` ON `extracted_text` (`created_at`);--> statement-breakpoint
CREATE TABLE `entities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`finding_id` integer NOT NULL,
	`type` text NOT NULL,
	`value` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`finding_id`) REFERENCES `findings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `entities_finding_id_idx` ON `entities` (`finding_id`);--> statement-breakpoint
CREATE INDEX `entities_type_idx` ON `entities` (`type`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`text_extraction_enabled` integer DEFAULT false NOT NULL,
	`ocr_enabled` integer DEFAULT false NOT NULL,
	`local_only_processing` integer DEFAULT true NOT NULL,
	`cloud_consent` integer DEFAULT false NOT NULL,
	`embeddings_enabled` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `embedding_chunks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`finding_id` integer NOT NULL,
	`extracted_text_id` integer NOT NULL,
	`chunk_index` integer DEFAULT 0 NOT NULL,
	`chunk_text` text NOT NULL,
	`vector` blob NOT NULL,
	`model` text DEFAULT 'local-hash-v1' NOT NULL,
	`dimensionality` integer DEFAULT 128 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`finding_id`) REFERENCES `findings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`extracted_text_id`) REFERENCES `extracted_text`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `embedding_chunks_finding_id_idx` ON `embedding_chunks` (`finding_id`);--> statement-breakpoint
CREATE INDEX `embedding_chunks_extracted_text_id_idx` ON `embedding_chunks` (`extracted_text_id`);--> statement-breakpoint
CREATE INDEX `embedding_chunks_model_idx` ON `embedding_chunks` (`model`);--> statement-breakpoint
CREATE TABLE `project_candidate_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`candidate_id` integer NOT NULL,
	`finding_id` integer NOT NULL,
	`contribution` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`candidate_id`) REFERENCES `project_candidates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`finding_id`) REFERENCES `findings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_candidate_files_candidate_id_idx` ON `project_candidate_files` (`candidate_id`);--> statement-breakpoint
CREATE INDEX `project_candidate_files_finding_id_idx` ON `project_candidate_files` (`finding_id`);--> statement-breakpoint
CREATE TABLE `project_candidates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`project_id` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`score` real DEFAULT 0 NOT NULL,
	`signals` text DEFAULT '{}' NOT NULL,
	`explanation` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `project_candidates_status_idx` ON `project_candidates` (`status`);--> statement-breakpoint
CREATE INDEX `project_candidates_score_idx` ON `project_candidates` (`score`);--> statement-breakpoint
CREATE TABLE `project_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`finding_id` integer NOT NULL,
	`added_by` text DEFAULT 'auto' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`finding_id`) REFERENCES `findings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_files_project_id_idx` ON `project_files` (`project_id`);--> statement-breakpoint
CREATE INDEX `project_files_finding_id_idx` ON `project_files` (`finding_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`confidence` real DEFAULT 1 NOT NULL,
	`explanation` text DEFAULT '' NOT NULL,
	`summary` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projects_status_idx` ON `projects` (`status`);--> statement-breakpoint
CREATE INDEX `projects_created_at_idx` ON `projects` (`created_at`);