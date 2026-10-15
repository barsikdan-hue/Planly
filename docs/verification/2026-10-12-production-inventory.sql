-- PLANLY READ-ONLY INVENTORY. Not executed against production by Task 01.
-- Run only on an already authorized connection with the private canonical owner ID:
-- psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -v owner_id="$PLANLY_OWNER_ID" -f this-file.sql
-- Variables above are supplied privately; never echo the connection string or owner ID.
-- No private text, object key, filename, token, or provider message ID is selected.
-- Counts are one SQL snapshot. Redis/R2/browser inventories are separate evidence.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';
SELECT current_timestamp AS inventory_at_utc,
  (SELECT count(*) FROM users WHERE id = :'owner_id') AS owner_matches;
-- Abort on absent owner; this does not replace private ownership confirmation.
SELECT 1 / CASE WHEN count(*)=1 THEN 1 ELSE 0 END AS owner_scope_guard
FROM users WHERE id=:'owner_id';

SELECT s::text AS post_status, count(p.id) AS count
FROM unnest(enum_range(NULL::post_status)) AS s
LEFT JOIN posts p ON p.status=s AND p.user_id=:'owner_id'
GROUP BY s ORDER BY s;
-- PostTargets have active/scheduled_at; they have no status enum.
SELECT t.active, (t.scheduled_at IS NOT NULL) AS has_schedule, count(*) AS count
FROM post_targets t JOIN posts p ON p.id=t.post_id
WHERE p.user_id=:'owner_id' GROUP BY t.active, (t.scheduled_at IS NOT NULL);
SELECT count(*) AS total_targets FROM post_targets t JOIN posts p ON p.id=t.post_id
WHERE p.user_id=:'owner_id';
SELECT s::text AS publication_status, count(x.id) AS count
FROM unnest(enum_range(NULL::publication_status)) AS s
LEFT JOIN publications x ON x.status=s AND x.user_id=:'owner_id'
GROUP BY s ORDER BY s;
SELECT count(*) FILTER (WHERE status IN ('SCHEDULED','QUEUED')) AS pending,
 count(*) FILTER (WHERE status IN ('SCHEDULED','QUEUED') AND scheduled_at<=current_timestamp
  AND (next_retry_at IS NULL OR next_retry_at<=current_timestamp)) AS due_pending,
 count(*) FILTER (WHERE status='PUBLISHING') AS publishing,
 count(*) FILTER (WHERE next_retry_at IS NOT NULL) AS retry_marked,
 count(*) FILTER (WHERE status='FAILED' AND normalized_error_type='TEMPORARY') AS temporary_failed,
 count(*) FILTER (WHERE provider_error_code='AMBIGUOUS_DELIVERY') AS ambiguous
FROM publications WHERE user_id=:'owner_id';
SELECT count(*) AS mixed_terminal_pending_posts FROM posts p WHERE p.user_id=:'owner_id'
 AND EXISTS (SELECT 1 FROM publications x WHERE x.post_id=p.id AND x.status IN ('SCHEDULED','QUEUED'))
 AND EXISTS (SELECT 1 FROM publications x WHERE x.post_id=p.id AND
  (x.status IN ('PUBLISHED','PUBLISHING','REQUIRES_RECONNECT')
   OR (x.status='FAILED' AND x.provider_error_code='AMBIGUOUS_DELIVERY')));
SELECT s::text AS library_status, count(l.id) AS count
FROM unnest(enum_range(NULL::library_item_status)) AS s
LEFT JOIN library_items l ON l.status=s AND l.user_id=:'owner_id'
GROUP BY s ORDER BY s;
SELECT count(*) AS media_count, coalesce(sum(m.byte_size),0) AS db_declared_bytes,
 count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id=m.id)
  AND NOT EXISTS (SELECT 1 FROM library_item_media lm WHERE lm.media_id=m.id)) AS currently_unattached,
 count(*) FILTER (WHERE EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id=m.id)) AS attached_to_posts,
 count(*) FILTER (WHERE EXISTS (SELECT 1 FROM library_item_media lm WHERE lm.media_id=m.id)) AS attached_to_library,
 count(*) FILTER (WHERE EXISTS (SELECT 1 FROM post_media pm WHERE pm.media_id=m.id)
  AND EXISTS (SELECT 1 FROM library_item_media lm WHERE lm.media_id=m.id)) AS shared_post_library
FROM media_assets m WHERE m.user_id=:'owner_id';
SELECT count(*) AS post_media_links FROM post_media pm JOIN posts p ON p.id=pm.post_id
WHERE p.user_id=:'owner_id';
SELECT count(*) AS library_media_links FROM library_item_media lm JOIN library_items l ON l.id=lm.library_item_id
WHERE l.user_id=:'owner_id';
SELECT count(*) AS media_references_of_published_posts FROM post_media pm JOIN publications x ON x.post_id=pm.post_id
WHERE x.user_id=:'owner_id' AND x.status='PUBLISHED';
-- This last count is per media/Publications pair, not unique object count.

-- Exact cascade impact if every owned Post/Library is approved for deletion.
SELECT
 (SELECT count(*) FROM posts WHERE user_id=:'owner_id') AS posts_to_delete,
 (SELECT count(*) FROM post_targets t JOIN posts p ON p.id=t.post_id WHERE p.user_id=:'owner_id') AS targets_cascaded,
 (SELECT count(*) FROM publications x JOIN posts p ON p.id=x.post_id WHERE p.user_id=:'owner_id') AS publications_cascaded,
 (SELECT count(*) FROM publication_metrics m JOIN publications x ON x.id=m.publication_id
  JOIN posts p ON p.id=x.post_id WHERE p.user_id=:'owner_id') AS metrics_cascaded,
 (SELECT count(*) FROM library_items WHERE user_id=:'owner_id') AS library_items_to_delete,
 (SELECT count(*) FROM posts WHERE user_id=:'owner_id' AND creation_key IS NOT NULL) AS post_creation_keys_lost,
 (SELECT count(*) FROM media_assets m WHERE m.user_id=:'owner_id'
  AND NOT EXISTS (SELECT 1 FROM post_media pm JOIN posts p ON p.id=pm.post_id
   WHERE pm.media_id=m.id AND p.user_id<>:'owner_id')
  AND NOT EXISTS (SELECT 1 FROM library_item_media lm JOIN library_items l ON l.id=lm.library_item_id
   WHERE lm.media_id=m.id AND l.user_id<>:'owner_id')) AS media_free_after_owned_content_removal;

SELECT count(*) AS analytics_rows_now FROM publication_metrics m JOIN publications x ON x.id=m.publication_id
WHERE x.user_id=:'owner_id';
SELECT count(*) AS retained_receipts,
 coalesce(sum(jsonb_array_length(receipt->'rows')),0) AS retained_receipt_rows,
 (SELECT count(*) FROM scheduling_plan_operations o
  CROSS JOIN LATERAL jsonb_array_elements(o.receipt->'rows') r
  WHERE o.user_id=:'owner_id' AND NOT EXISTS (SELECT 1 FROM posts p
   WHERE p.id=r->>'postId' AND p.user_id=:'owner_id')) AS receipt_rows_with_absent_owned_post
FROM scheduling_plan_operations WHERE user_id=:'owner_id';
SELECT s::text AS retained_intent_state, count(a.creation_key) AS count
FROM unnest(enum_range(NULL::library_creation_state)) AS s
LEFT JOIN library_creation_attempts a ON a.state=s AND a.user_id=:'owner_id'
GROUP BY s ORDER BY s;
SELECT
 (SELECT count(*) FROM users WHERE id=:'owner_id') AS users_retained,
 (SELECT count(*) FROM sessions WHERE user_id=:'owner_id') AS sessions_retained,
 (SELECT count(*) FROM social_accounts WHERE user_id=:'owner_id') AS accounts_retained,
 (SELECT count(*) FROM vk_credentials c JOIN social_accounts a ON a.id=c.account_id WHERE a.user_id=:'owner_id') AS encrypted_credentials_retained,
 (SELECT count(*) FROM vk_oauth_intents WHERE user_id=:'owner_id') AS oauth_intents_retained;
SELECT provider::text, enabled, connection_status::text, count(*) AS retained_accounts
FROM social_accounts WHERE user_id=:'owner_id' GROUP BY provider,enabled,connection_status;

-- Any anomaly is a STOP, not authorization for cross-owner cleanup.
SELECT
 (SELECT count(*) FROM post_media pm JOIN posts p ON p.id=pm.post_id JOIN media_assets m ON m.id=pm.media_id
  WHERE (p.user_id=:'owner_id' OR m.user_id=:'owner_id') AND p.user_id<>m.user_id) AS cross_owner_post_media,
 (SELECT count(*) FROM library_item_media lm JOIN library_items l ON l.id=lm.library_item_id JOIN media_assets m ON m.id=lm.media_id
  WHERE (l.user_id=:'owner_id' OR m.user_id=:'owner_id') AND l.user_id<>m.user_id) AS cross_owner_library_media,
 (SELECT count(*) FROM publications x JOIN posts p ON p.id=x.post_id WHERE
  (x.user_id=:'owner_id' OR p.user_id=:'owner_id') AND x.user_id<>p.user_id) AS cross_owner_publications,
 (SELECT count(*) FROM post_targets t JOIN posts p ON p.id=t.post_id JOIN social_accounts a ON a.id=t.social_account_id
  WHERE (p.user_id=:'owner_id' OR a.user_id=:'owner_id') AND p.user_id<>a.user_id) AS cross_owner_targets;
COMMIT;
