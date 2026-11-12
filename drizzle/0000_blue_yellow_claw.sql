CREATE TABLE `deals` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`work_id` text NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`owner_id`, `id`),
	FOREIGN KEY (`owner_id`,`work_id`) REFERENCES `works`(`owner_id`,`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `works` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`owner_id`, `id`)
);
