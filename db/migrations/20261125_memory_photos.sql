CREATE TABLE IF NOT EXISTS memory_photos (
  attempt_id integer PRIMARY KEY REFERENCES star_attempts(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  photo bytea,
  UNIQUE (user_id, request_id)
);
