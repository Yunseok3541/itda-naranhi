import { db } from '@/lib/db';
import { demoSessionRequired, lookupDemoSession } from '@/lib/demo-session';
import { accessoryById, type ShopState } from '@/lib/shop';
import type { Db } from '../_lib/http';

async function user() {
  const session = await lookupDemoSession();
  if (session.status === 'none') return demoSessionRequired();
  if (session.status === 'error') return Response.json({ error: '세션을 확인하지 못했어요.' }, { status: 503 });
  return session.userId;
}

async function wardrobe(connection: Db, userId: number): Promise<ShopState> {
  const { rows } = await connection.query<ShopState>(`
    SELECT COALESCE((SELECT total_points FROM v_user_balance WHERE user_id=$1),0) AS balance,
           COALESCE(array_agg(item_id ORDER BY purchased_at), ARRAY[]::text[]) AS owned,
           max(item_id) FILTER (WHERE equipped) AS equipped
    FROM shop_purchases WHERE user_id=$1`, [userId]);
  return rows[0];
}

export async function GET() {
  const id = await user();
  if (typeof id !== 'number') return id;
  try { return Response.json(await wardrobe(db, id)); }
  catch { return Response.json({ error: '상점을 불러오지 못했어요.' }, { status: 503 }); }
}

export async function PUT(request: Request) {
  const id = await user();
  if (typeof id !== 'number') return id;
  const body = await request.json().catch(() => null);
  const item = accessoryById(body?.item);
  const action = body?.action;
  if (!item || !['buy', 'equip', 'remove'].includes(action))
    return Response.json({ error: '장식과 동작을 확인해 주세요.' }, { status: 400 });

  const connection = await db.connect().catch(() => null);
  if (!connection) return Response.json({ error: '상점에 연결하지 못했어요.' }, { status: 503 });
  try {
    await connection.query('BEGIN');
    await connection.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [id]);
    const state = await wardrobe(connection, id);
    if (!state.owned.includes(item.id)) {
      if (action !== 'buy' || state.balance < item.price) {
        await connection.query('ROLLBACK');
        return Response.json({ error: action === 'buy' ? '포인트가 부족해요.' : '보유한 장식을 골라 주세요.' }, { status: 409 });
      }
      await connection.query('INSERT INTO shop_purchases(user_id,item_id,paid) VALUES ($1,$2,$3)', [id,item.id,item.price]);
    }
    if (action === 'remove') {
      await connection.query('UPDATE shop_purchases SET equipped=false WHERE user_id=$1 AND item_id=$2', [id,item.id]);
    } else {
      await connection.query('UPDATE shop_purchases SET equipped=false WHERE user_id=$1 AND equipped', [id]);
      await connection.query('UPDATE shop_purchases SET equipped=true WHERE user_id=$1 AND item_id=$2', [id,item.id]);
    }
    const result = await wardrobe(connection, id);
    await connection.query('COMMIT');
    return Response.json(result);
  } catch {
    await connection.query('ROLLBACK').catch(() => {});
    return Response.json({ error: '장식을 저장하지 못했어요. 다시 시도해 주세요.' }, { status: 503 });
  } finally { connection.release(); }
}
