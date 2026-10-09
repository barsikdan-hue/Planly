CREATE TABLE "scheduling_plan_operations" (
	"user_id" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"receipt" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_plan_operations_user_id_operation_id_pk" PRIMARY KEY("user_id","operation_id"),
	CONSTRAINT "scheduling_plan_request_hash_format" CHECK ("scheduling_plan_operations"."request_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "scheduling_plan_operations" ADD CONSTRAINT "scheduling_plan_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;