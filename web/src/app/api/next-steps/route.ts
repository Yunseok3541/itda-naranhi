import { demoSessionRequired, lookupDemoSession } from '@/lib/demo-session';
import { fail, toResponse } from '../_lib/http';
import { chooseNext, pendingNext, suggestNext } from './service';

async function handle(request: Request) {
  const session = await lookupDemoSession();
  if (session.status === 'none') return demoSessionRequired();
  if (session.status === 'error') return toResponse(fail(503, 'LOAD_FAILED', '지금은 기록을 확인하지 못했어요.'));
  if (request.method === 'GET') return toResponse(await pendingNext(session.userId));
  const body: unknown = await request.json().catch(() => null);
  return toResponse(await (request.method === 'PATCH' ? chooseNext(session.userId, body) : suggestNext(session.userId, body)));
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
