// Offline checks only: no .env loading, network requests, or real DB writes.
// Run from web/: node node_modules/tsx/dist/cli.mjs scripts/verify-next-steps.mts
import assert from 'node:assert/strict';
import { catalogConstellations, catalogQuest, catalogQuests } from '../src/lib/quest-catalog';
import { defaultNextKey, nextOptions, type AvailableQuest, type NextPlan, type NextSource } from '../src/lib/next-step';
import { chooseNext, pendingNext, suggestNext } from '../src/app/api/next-steps/service';
import { createAttempt } from '../src/app/api/_lib/attempts';
import { client } from '../src/lib/mobile-data';
import type { Db } from '../src/app/api/_lib/http';
import type { generateJson } from '../src/lib/gemini';

let passed = 0;
function check(name: string, test: () => void) { test(); passed++; console.log(`PASS ${name}`); }
const quests: AvailableQuest[] = catalogQuests.map(q => ({
  id: q.id, title: q.title, stage: q.stage, outside: q.is_outside, status: 'untried',
  constellationId: catalogConstellations.find(c => c.quests.includes(q.id))!.id,
  subQuests: [{ id: q.id + 1000, title: q.easier_title }],
}));
const source: NextSource = { attemptId: 81, starId: 6, status: 'dim', stopReason: 'tired', reflection: '' };
const small = nextOptions(source, quests, 'out');
check('uses reviewed smaller title', () => assert.equal(small.find(o => o.action === 'smaller')?.title, catalogQuest(6)!.easier_title));
check('tired -> smaller default', () => assert.equal(defaultNextKey(source, small), 'smaller:1006'));
check('weather -> retry default', () => assert.equal(defaultNextKey({ ...source, stopReason: 'weather' }, small), 'retry'));
check('never increases stage', () => assert(small.filter(o => o.action === 'swap').every(o => catalogQuest(o.starId!)!.stage <= 2)));
check('home excludes actual outdoor quests, including stage 1 outdoor quest', () => {
  const opts = nextOptions(source, quests, 'home');
  assert(opts.filter(o => o.action !== 'stop').every(o => !catalogQuest(o.starId!)!.is_outside));
});
check('rest leaves stop only', () => assert.deepEqual(nextOptions(source, quests, 'rest').map(o => o.action), ['stop']));
check('cost does not suggest buying again or paid smaller versions', () => {
  const opts = nextOptions({ ...source, starId: 10, stopReason: 'cost' }, quests, 'out');
  assert(opts.every(o => o.action === 'swap' || o.action === 'stop'));
  assert(opts.some(o => o.action === 'swap'));
  assert(!opts.some(o => [6, 10, 26, 27, 30].includes(o.starId ?? 0)));
});
check('crowded excludes social alternatives', () => assert(nextOptions({ ...source, stopReason: 'crowded' }, quests, 'out')
  .filter(o => o.action === 'swap').every(o => !catalogQuest(o.starId!)!.tags.includes('social'))));
check('retry retains exact smaller activity', () => assert.equal(nextOptions({ ...source, subQuestId: 1006 }, quests, 'out').find(o => o.action === 'retry')?.subQuestId, 1006));
check('completed attempt suggests another star without promoting stage', () => {
  const done = { ...source, status: 'bright' as const };
  assert(!nextOptions(done, quests, 'out').some(o => o.action === 'retry' || o.action === 'smaller'));
});

let selectedRows = 0;
function fakeDb(owner = true, risk: string | null = null): Db {
  return { query: (async (sql: string) => {
    if (sql.includes('FROM star_attempts WHERE id = $1 AND user_id = $2')) return { rows: owner ? [{ ...source, risk }] : [] };
    if (sql.includes('FROM stars s JOIN constellations')) return { rows: quests };
    if (sql.includes("start_answers->>'range'")) return { rows: [{ choice: 'out', range: 'near' }] };
    if (sql.includes('UPDATE star_attempts a SET next_action')) { selectedRows++; return { rows: [{ id: 81 }], rowCount: 1 }; }
    if (sql.includes('UPDATE star_attempts SET suggested_action')) return { rows: [], rowCount: 1 };
    if (sql.includes('a.next_action AS action')) return { rows: [{ attemptId: 81, action: 'stop', done: false }] };
    throw new Error(`Unhandled test query: ${sql.slice(0, 70)}`);
  }) as Db['query'] };
}
let aiCalls = 0;
const fakeAi = ((async () => {
  aiCalls++;
  return { data: { key: 'swap:99999', reason: '없는 별' }, usedFallback: false, modelVersion: 'test', fallbackReason: null };
}) as unknown) as typeof generateJson;
const recommendation = await suggestNext(1, { attemptId: 81 }, fakeDb(), fakeAi);
check('AI hallucinated ID falls back', () => { assert.equal(recommendation.status, 200); assert.equal(recommendation.body.usedFallback, true); assert.equal(recommendation.body.recommendedKey, 'smaller:1006'); });
const callsBefore = aiCalls;
const missing = await suggestNext(2, { attemptId: 81 }, fakeDb(false), fakeAi);
check('other user attempt is hidden and does not call AI', () => { assert.equal(missing.status, 404); assert.equal(aiCalls, callsBefore); });
const danger = await suggestNext(1, { attemptId: 81 }, fakeDb(true, 'danger'), fakeAi);
check('safety guidance overrides recommendation and does not call AI', () => { assert.equal(danger.body.recommendedKey, 'stop'); assert(danger.body.help); assert.equal(aiCalls, callsBefore); });
const invalid = await chooseNext(1, { attemptId: 81, key: 'swap:99999' }, fakeDb());
check('client cannot choose unoffered target', () => { assert.equal(invalid.status, 400); assert.equal(selectedRows, 0); });
const chosen = await chooseNext(1, { attemptId: 81, key: 'smaller:1006' }, fakeDb());
check('valid choice resolves server-side title and target', () => { const p = chosen.body.plan as NextPlan; assert.equal(p.title, catalogQuest(6)!.easier_title); assert.equal(p.subQuestId, 1006); });
const stopped = await pendingNext(1, fakeDb());
check('stop does not resurrect older plans', () => assert.equal(stopped.body.plan, null));
const throwAi = (async () => { throw new Error('timeout'); }) as typeof generateJson;
const fallback = await suggestNext(1, { attemptId: 81 }, fakeDb(), throwAi);
check('AI failure retains usable choices', () => { assert.equal(fallback.status, 200); assert.equal(fallback.body.usedFallback, true); });

let insertedValues: unknown[] | undefined;
const attemptDb: Db = { query: (async (sql: string, values?: unknown[]) => {
  if (sql.includes('SELECT star_id, next_action')) return { rows: [{ star_id: 6, next_action: 'smaller', next_sub_quest_id: 1006, next_star_id: null, sub_quest_id: null }] };
  if (sql.includes('SELECT title FROM sub_quests')) return { rows: [{ title: catalogQuest(6)!.easier_title }] };
  if (sql.includes('SELECT title FROM stars')) return { rows: [{ title: catalogQuest(6)!.title }] };
  if (sql.includes('INSERT INTO star_attempts')) { insertedValues = values; return { rows: [{ id: 82, date: '2026-11-20', had_bright: false, total_before: 0, star_points: 20 }] }; }
  throw new Error('Unexpected attempt query');
}) as Db['query'] };
const continued = await createAttempt(1, { starId: 6, status: 'bright', parentAttemptId: 81, subQuestId: 1006 }, attemptDb);
check('follow-up attempt saves parent and reviewed smaller title', () => { assert.equal(continued.status, 201); assert.equal(insertedValues?.[9], 81); assert.equal(insertedValues?.[10], 1006); assert.equal(insertedValues?.[11], catalogQuest(6)!.easier_title); });
const wrong = await createAttempt(1, { starId: 7, status: 'bright', parentAttemptId: 81, subQuestId: 1006 }, attemptDb);
check('follow-up cannot change chosen target', () => assert.equal(wrong.status, 400));

const storage = new Map<string, string>([['naranhi-example-v1', 'legacy-record-not-to-be-deleted']]);
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v),
  removeItem: (k: string) => storage.delete(k),
}, configurable: true });
const example = client('example');
await example.start();
const sky = await example.sky();
check('example uses all 40 reviewed quests and 10 constellations', () => { assert.equal(sky.stars.length, 40); assert.equal(new Set(sky.stars.map(s => s.constellationId)).size, 10); });
check('legacy example records untouched', () => assert.equal(storage.get('naranhi-example-v1'), 'legacy-record-not-to-be-deleted'));
const saved = await example.attempt({ starId: 6, status: 'dim', reflection: '', stopReason: 'tired', verifyMethod: 'self' });
const next = await example.nextSteps(saved.attemptId);
const plan = await example.chooseNext(saved.attemptId, next.recommendedKey);
check('example pending choice survives next client instance', () => assert.equal(plan.plan?.title, catalogQuest(6)!.easier_title));
assert.equal((await client('example').pendingNext()).plan?.attemptId, saved.attemptId);
const child = await example.attempt({ starId: 6, status: 'bright', reflection: '', verifyMethod: 'self', parentAttemptId: saved.attemptId, subQuestId: plan.plan!.subQuestId });
check('example follow-up consumes plan and stores actual smaller action', () => assert.equal(child.status, 'bright'));
check('first completion still earns existing stage-based points', () => { assert.equal(saved.pointsEarned, 0); assert.equal(child.pointsEarned, 20); assert.equal(child.totalPoints, 20); });
assert.equal((await example.pendingNext()).plan, null);
const history = (await example.sky()).stars.find(s => s.starId === 6)!.memories;
check('example records linked parent without erasing prior attempt', () => { assert.equal(history.length, 2); assert.equal(history[1].parentAttemptId, history[0].attemptId); assert.equal(history[1].customTitle, catalogQuest(6)!.easier_title); });
const again = await example.attempt({ starId: 6, status: 'bright', reflection: '', verifyMethod: 'self' });
check('repeat completion does not duplicate points', () => { assert.equal(again.pointsEarned, 0); assert.equal(again.totalPoints, 20); });
console.log(`\n${passed} offline next-step checks passed. No real DB / AI requests made.`);
