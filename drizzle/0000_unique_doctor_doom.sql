CREATE TABLE `collaboration_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`document` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
