import { db } from '@/lib/db';
import { demoSessionRequired, lookupDemoSession } from '@/lib/demo-session';

async function handle(req:Request, remove:boolean) {
  const session = await lookupDemoSession();
  if(session.status==='none') return demoSessionRequired();
  if(session.status==='error') return Response.json({error:'세션을 확인해 주세요.'},{status:503});
  const id = new URL(req.url).searchParams.get('id');
  const headers = {'Cache-Control':'private, no-store'};
  try {
    if(id || remove) {
      if(!id || !/^\d{1,10}$/.test(id)) return new Response(null,{status:400});
      const result = await db.query(remove
        ? 'UPDATE memory_photos SET photo=NULL WHERE user_id=$1 AND attempt_id=$2 AND photo IS NOT NULL RETURNING attempt_id'
        : 'SELECT photo FROM memory_photos WHERE user_id=$1 AND attempt_id=$2 AND photo IS NOT NULL',[session.userId,id]);
      if(!result.rows.length) return new Response(null,{status:404,headers});
      return remove ? Response.json({removed:true},{headers}) : new Response(new Uint8Array(result.rows[0].photo),{headers:{...headers,'Content-Type':'image/jpeg'}});
    }
    const {rows}=await db.query(`SELECT a.id,a.status,c.id AS "group", c.name, s.id AS star, coalesce(a.custom_title,s.title) AS title,
      a.reflection AS note,a.created_at AS date, '/api/memories?id=' || a.id AS src
      FROM memory_photos m JOIN star_attempts a ON a.id=m.attempt_id JOIN stars s ON s.id=a.star_id JOIN constellations c ON c.id=s.constellation_id
      WHERE m.user_id=$1 AND m.photo IS NOT NULL ORDER BY a.created_at,a.id`,[session.userId]);
    return Response.json(rows,{headers});
  } catch { return Response.json({error:'사진 보관함을 열지 못했어요. 잠시 뒤 다시 시도해 주세요.'},{status:503,headers}); }
}
export const GET=(req:Request)=>handle(req,false);
export const DELETE=(req:Request)=>handle(req,true);
