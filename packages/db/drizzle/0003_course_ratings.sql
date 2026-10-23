CREATE TABLE "course_ratings" (
	"user_id" text NOT NULL,
	"course_id" uuid NOT NULL,
	"stars" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_ratings_user_id_course_id_pk" PRIMARY KEY("user_id","course_id"),
	CONSTRAINT "course_ratings_stars_check" CHECK ("course_ratings"."stars" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "course_ratings" ADD CONSTRAINT "course_ratings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_ratings" ADD CONSTRAINT "course_ratings_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;