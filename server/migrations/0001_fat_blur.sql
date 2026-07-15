ALTER TABLE `users` ADD `apple_sub` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_apple_sub_unique` ON `users` (`apple_sub`);