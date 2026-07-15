CREATE TABLE `medications` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`rp_number` integer,
	`name` text NOT NULL,
	`dose` text,
	`dose_unit` text,
	`usage_text` text,
	`quantity` text,
	`quantity_unit` text,
	`dose_form_code` text,
	`note` text,
	`generic_name` text,
	`drug_code_type` text,
	`drug_code` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `medications_record_idx` ON `medications` (`record_id`);--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`dispensed_at` text NOT NULL,
	`pharmacy_name` text,
	`pharmacy_phone` text,
	`hospital_name` text,
	`doctor_name` text,
	`notes` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`raw_qr` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `records_user_dispensed_idx` ON `records` (`user_id`,`dispensed_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`google_sub` text,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`avatar_url` text,
	`last_seen_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_sub_unique` ON `users` (`google_sub`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);