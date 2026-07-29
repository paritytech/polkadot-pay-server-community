UPDATE "events"
SET "type" = 'payment.received',
    "payload" = replace("payload", '"type":"payment.completed"', '"type":"payment.received"')
WHERE "type" = 'payment.completed';--> statement-breakpoint
UPDATE "webhook_endpoints"
SET "events" = replace("events", '"payment.completed"', '"payment.received"')
WHERE "events" LIKE '%"payment.completed"%';
