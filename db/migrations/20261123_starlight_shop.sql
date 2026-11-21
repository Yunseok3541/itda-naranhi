BEGIN;
CREATE TABLE IF NOT EXISTS shop_purchases (
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  paid integer NOT NULL CHECK (paid > 0),
  purchased_at timestamptz NOT NULL DEFAULT now(),
  equipped boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, item_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS shop_one_equipped ON shop_purchases(user_id) WHERE equipped;

CREATE OR REPLACE VIEW v_user_balance AS
SELECT p.user_id, p.total_points - COALESCE(s.spent, 0)::int AS total_points,
       p.bright_stars, p.star_points, p.meteor_points, p.checkin_points
FROM v_user_points p
LEFT JOIN (SELECT user_id, sum(paid) AS spent FROM shop_purchases GROUP BY user_id) s USING (user_id);
COMMIT;
