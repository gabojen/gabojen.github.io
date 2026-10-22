/* Firestore 보안 규칙 시험 — 에뮬레이터에 실제 규칙을 올리고, 앱이 하는 쓰기를 그대로 흉내 내 허용/거부를 확인합니다.
   실행: cd tests && npm run rules   (Java 11 이상 + firebase-tools 필요. 자동 검사(GitHub Actions)에서도 돕니다) */
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, updateDoc, writeBatch, runTransaction, Timestamp, collection, getDocs, query, where } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8089').split(':');

const env = await initializeTestEnvironment({ projectId: 'demo-gabojen', firestore: { rules: readFileSync(path.join(here, 'firestore.rules'), 'utf8'), host, port: Number(port) } });
const as = (uid, verified = true) => env.authenticatedContext(uid, { email: uid + '@t.test', email_verified: verified }).firestore();
/* withSecurityRulesDisabled 는 콜백의 반환값을 돌려주지 않으므로 직접 받아 둡니다 */
const seed = async fn => { let out; await env.withSecurityRulesDisabled(async ctx => { out = await fn(ctx.firestore()); }); return out; };
const readRaw = async (col, id) => seed(async db => (await getDoc(doc(db, col, id))).data());
let pass = 0, fail = 0;
async function test(name, fn) { try { await fn(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n     ', String(e.message || e).split('\n')[0].slice(0, 200)); } }

const member = (uid, n) => ({ uid, n: n[0], nm: n, joinedAt: '2026-10-01' });
const item = (id, title) => ({ _id: id, cat: 'plan', time: '10:00', title, place: '', sub: '', by: '연세아빠', createdBy: 'owner', comments: [] });
/* 앱이 저장하는 여행 문서 모양 (shape() 를 통과해야 하는 최소 필드 + 실제 필드) */
const tripDoc = (id, extra = {}) => ({ id, title: '가을 여행', place: '강원 속초', groupType: '가족', status: 'active', start: '2026-11-10', end: '2026-11-11',
  days: [{ date: '2026-11-10', items: [item('a', '속초 해변'), item('b', '속초 호텔')] }, { date: '2026-11-11', items: [] }],
  members: [member('owner', '연세아빠')], memberUids: ['owner'], owner: 'owner', pack: [], proposals: [], _rev: 3, updatedAt: 1760000000000, ...extra });
/* 앱의 writeTripDraft 와 같은 저장: 전체 문서 set, _rev+1, updatedAt 갱신 (트랜잭션 안에서 get → set) */
async function appSave(db, t) {
  const ref = doc(db, 'trips', t.id);
  return runTransaction(db, async tx => { const snap = await tx.get(ref); const next = { ...t, _rev: (snap.data()?._rev || 0) + 1, updatedAt: Date.now() }; tx.set(ref, next); });
}

console.log('보안 규칙 시험 (' + host + ':' + port + ')');
await env.clearFirestore();
await seed(db => Promise.all([
  setDoc(doc(db, 'admins', 'admin'), { ok: true }),
  setDoc(doc(db, 'trips', 'trip1'), tripDoc('trip1')),
  setDoc(doc(db, 'trips', 'trip2'), tripDoc('trip2', { members: [member('owner', '연세아빠'), member('mate', '동행')], memberUids: ['owner', 'mate'] })),
  setDoc(doc(db, 'recs', 'pub1'), { uid: 'writer', region: '강원', title: '영금정', note: '일출이 정말 예쁜 곳이에요.', cat: 'plan', month: 8, tripId: 'trip1', status: 'public', createdAt: '2026-09-01', helpful: 0 }),
  setDoc(doc(db, 'recs', 'pend1'), { uid: 'writer', region: '강원', title: '대기중', note: '검수 대기 중인 글입니다.', cat: 'plan', month: 8, tripId: 'trip1', status: 'pending', createdAt: '2026-09-01' }),
  setDoc(doc(db, 'placeStats', '강원_1'), { count: 4, title: '영금정', region: '강원', updatedAt: '2026-10-01' }),
]));

/* ── 여행 읽기 ── */
await test('구성원만 여행을 읽는다 (남·비로그인 거부)', async () => {
  await assertSucceeds(getDoc(doc(as('owner'), 'trips', 'trip1')));
  await assertFails(getDoc(doc(as('stranger'), 'trips', 'trip1')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'trips', 'trip1')));
});
await test('내 여행 목록(list)은 구성원 조건이 있어야 한다', async () => {
  await assertSucceeds(getDocs(query(collection(as('owner'), 'trips'), where('memberUids', 'array-contains', 'owner'))));
  await assertFails(getDocs(collection(as('owner'), 'trips')));
});

/* ── 여행 만들기 ── */
await test('인증 회원이 자기 한 명으로 여행을 만든다 / 미인증·남 끼워 넣기 거부', async () => {
  await assertSucceeds(setDoc(doc(as('owner'), 'trips', 'new1'), tripDoc('new1', { _rev: 1 })));
  await assertFails(setDoc(doc(as('owner', false), 'trips', 'new2'), tripDoc('new2', { _rev: 1 })));
  await assertFails(setDoc(doc(as('owner'), 'trips', 'new3'), tripDoc('new3', { _rev: 1, members: [member('owner', 'a'), member('x', 'b')], memberUids: ['owner', 'x'] })));
});

/* ── 일정 추가·삭제 (앱 저장 흐름 그대로) ── */
await test('구성원이 일정을 지우고 저장(_rev+1)하면 허용된다 — 삭제 실패 보고 회귀 방지', async () => {
  const t = tripDoc('trip1'); t.days[0].items = t.days[0].items.filter(i => i._id !== 'b');
  await assertSucceeds(appSave(as('owner'), t));
  const after = await readRaw('trips', 'trip1');
  if (after.days[0].items.length !== 1 || after._rev !== 4) throw new Error('저장 결과가 다름: ' + JSON.stringify({ n: after.days[0].items.length, rev: after._rev }));
});
await test('다른 구성원(주인 아님)도 일정 추가·삭제 저장 가능', async () => {
  const t = (await readRaw('trips', 'trip2'));
  t.days[0].items.push(item('c', '동행이 추가'));
  await assertSucceeds(appSave(as('mate'), t));
});
await test('_rev 를 올리지 않거나 2 올리면 거부 (동시 수정 보호)', async () => {
  const t = tripDoc('trip1', { _rev: 4 });
  await assertFails(setDoc(doc(as('owner'), 'trips', 'trip1'), { ...t, _rev: 4 }));
  await assertFails(setDoc(doc(as('owner'), 'trips', 'trip1'), { ...t, _rev: 6 }));
});
await test('일반 수정으로 구성원·주인을 바꿀 수 없다 / 남은 저장 못 한다', async () => {
  const cur = await readRaw('trips', 'trip1');
  await assertFails(setDoc(doc(as('owner'), 'trips', 'trip1'), { ...cur, _rev: cur._rev + 1, members: [...cur.members, member('x', 'x')], memberUids: [...cur.memberUids, 'x'] }));
  await assertFails(setDoc(doc(as('owner'), 'trips', 'trip1'), { ...cur, _rev: cur._rev + 1, owner: 'x' }));
  await assertFails(appSave(as('stranger'), cur));
});
await test('여행 삭제는 주인만', async () => {
  await assertFails(deleteDoc(doc(as('mate'), 'trips', 'trip2')));
  await assertSucceeds(deleteDoc(doc(as('owner'), 'trips', 'new1')));
});

/* ── 초대 링크·참여·나가기 ── */
const token = 'a'.repeat(40);
await test('초대: 주인만 7일 이내 토큰을 만들고, 초대받은 인증 회원은 토큰으로 자기만 추가한다', async () => {
  const exp = Timestamp.fromMillis(Date.now() + 3 * 86400000);
  await assertFails(setDoc(doc(as('mate'), 'invites', token), { tripId: 'trip1', createdBy: 'mate', expiresAt: exp, revoked: false }));
  await assertFails(setDoc(doc(as('owner'), 'invites', 'b'.repeat(40)), { tripId: 'trip1', createdBy: 'owner', expiresAt: Timestamp.fromMillis(Date.now() + 30 * 86400000), revoked: false }));
  await assertSucceeds(setDoc(doc(as('owner'), 'invites', token), { tripId: 'trip1', createdBy: 'owner', expiresAt: exp, revoked: false }));
  const cur = await readRaw('trips', 'trip1');
  const joined = { ...cur, members: [...cur.members, member('guest', '손님')], memberUids: [...cur.memberUids, 'guest'], _joinToken: token };
  await assertFails(setDoc(doc(as('guest'), 'trips', 'trip1'), { ...joined, _joinToken: 'c'.repeat(40) }));
  await assertFails(setDoc(doc(as('guest'), 'trips', 'trip1'), { ...joined, members: [...cur.members, member('guest', '손님'), member('z', 'z')], memberUids: [...cur.memberUids, 'guest', 'z'] }));
  await assertSucceeds(setDoc(doc(as('guest'), 'trips', 'trip1'), joined));
});
await test('참여한 뒤 토큰이 남은 여행도 구성원은 일정을 저장할 수 있다 (_joinToken 유지)', async () => {
  const cur = await readRaw('trips', 'trip1');
  cur.days[0].items.push(item('g', '손님이 추가'));
  await assertSucceeds(appSave(as('guest'), cur));
});
await test('나가기: 주인 아닌 구성원이 자기만 뺀다 / 남을 빼면 거부', async () => {
  const cur = await readRaw('trips', 'trip1');
  await assertFails(setDoc(doc(as('guest'), 'trips', 'trip1'), { ...cur, members: cur.members.filter(m => m.uid !== 'owner'), memberUids: cur.memberUids.filter(u => u !== 'owner') }));
  await assertSucceeds(setDoc(doc(as('guest'), 'trips', 'trip1'), { ...cur, members: cur.members.filter(m => m.uid !== 'guest'), memberUids: cur.memberUids.filter(u => u !== 'guest') }));
});

/* ── 사진·프로필·통계 ── */
await test('사진: 구성원만 올리고, 올린 본인·주인만 지운다', async () => {
  await assertSucceeds(setDoc(doc(as('mate'), 'photos', 'p1'), { tripId: 'trip2', u: 'data:image/jpeg;base64,AAA', by: '동행', uid: 'mate', at: 1 }));
  await assertFails(setDoc(doc(as('stranger'), 'photos', 'p2'), { tripId: 'trip2', u: 'x', by: 'x', uid: 'stranger', at: 1 }));
  await assertFails(deleteDoc(doc(as('stranger'), 'photos', 'p1')));
  await assertSucceeds(deleteDoc(doc(as('owner'), 'photos', 'p1')));
});
await test('프로필: 허용된 필드만, 남의 프로필은 못 쓴다', async () => {
  await assertSucceeds(setDoc(doc(as('owner'), 'users', 'owner'), { name: '연세아빠', email: 'o@t.test', photo: '', createdAt: 1, policyVersion: '2026-09-30', age14Confirmed: true }));
  await assertFails(setDoc(doc(as('owner'), 'users', 'owner'), { name: '연세아빠', role: 'admin' }));
  await assertFails(setDoc(doc(as('mate'), 'users', 'owner'), { name: '바꿈' }));
});
await test('여행 수(tripCount): 내 프로필에는 합쳐 쓰기로 적을 수 있고, 남의 프로필에는 못 쓴다', async () => {
  await assertSucceeds(setDoc(doc(as('owner'), 'users', 'owner'), { tripCount: 3 }, { merge: true }));
  await assertFails(setDoc(doc(as('mate'), 'users', 'owner'), { tripCount: 99 }, { merge: true }));
  const v = await readRaw('users', 'owner'); if (v.tripCount !== 3 || v.name !== '연세아빠') throw new Error('합쳐 쓰기 결과가 다름: ' + JSON.stringify(v));
});
await test('stats 는 앱에서 쓸 수 없고, leaveLog 는 두 필드만', async () => {
  await assertFails(setDoc(doc(as('owner'), 'stats', 'x'), { n: 1 }));
  await assertSucceeds(setDoc(doc(as('owner'), 'leaveLog', 'l1'), { date: '2026-10-19', daysUsed: 3 }));
  await assertFails(setDoc(doc(as('owner'), 'leaveLog', 'l2'), { date: '2026-10-19', daysUsed: 3, email: 'x' }));
});

/* ── 회원 추천 ── */
const rec = { uid: 'writer', region: '강원', title: '속초 해변', note: '오후 다섯 시쯤 가면 사람이 적고 노을이 예뻐요.', cat: 'plan', month: 8, tripId: 'trip1', status: 'pending', createdAt: '2026-10-19' };
await test('추천: 인증 회원은 검수 대기로만 올린다 (공개 지정·링크·미인증 거부)', async () => {
  await assertSucceeds(setDoc(doc(as('writer'), 'recs', 'r1'), rec));
  await assertFails(setDoc(doc(as('writer'), 'recs', 'r2'), { ...rec, status: 'public' }));
  await assertFails(setDoc(doc(as('writer'), 'recs', 'r3'), { ...rec, note: '여기 www.naver.com 에서 보세요 좋아요' }));
  await assertFails(setDoc(doc(as('writer', false), 'recs', 'r4'), rec));
  await assertFails(setDoc(doc(as('writer'), 'recs', 'r5'), { ...rec, thumbs: ['data:image/jpeg;base64,AA'], photoIds: [] }));
});
await test('추천 읽기: 공개 글은 모두, 대기 글은 작성자·관리자만', async () => {
  await assertSucceeds(getDoc(doc(as('reader'), 'recs', 'pub1')));
  await assertFails(getDoc(doc(as('reader'), 'recs', 'pend1')));
  await assertSucceeds(getDoc(doc(as('writer'), 'recs', 'pend1')));
  await assertSucceeds(getDoc(doc(as('admin'), 'recs', 'pend1')));
});
await test('검수: 상태 변경은 관리자만, 삭제는 작성자·관리자', async () => {
  await assertFails(updateDoc(doc(as('writer'), 'recs', 'r1'), { status: 'public' }));
  await assertSucceeds(updateDoc(doc(as('admin'), 'recs', 'r1'), { status: 'public' }));
  await assertFails(deleteDoc(doc(as('reader'), 'recs', 'r1')));
  await assertSucceeds(deleteDoc(doc(as('writer'), 'recs', 'r1')));
});
await test('도움돼요: 표시 문서와 함께 +1 만 허용, 두 번째는 거부, 표시 없이 +1 거부', async () => {
  const vote = (uid, n) => { const db = as(uid); const b = writeBatch(db); b.update(doc(db, 'recs', 'pub1'), { helpful: n }); b.set(doc(db, 'recVotes', 'pub1_' + uid), { recId: 'pub1', uid, createdAt: '2026-10-19' }); return b.commit(); };
  await assertSucceeds(vote('reader', 1));
  await assertFails(vote('reader', 2));
  await assertFails(updateDoc(doc(as('other'), 'recs', 'pub1'), { helpful: 2 }));
  await assertFails(vote('other', 5));
  await assertSucceeds(vote('other', 2));
});
await test('신고: 인증 회원이 만들고 관리자가 읽는다', async () => {
  await assertSucceeds(setDoc(doc(as('reader'), 'reports', 'rp1'), { recId: 'pub1', reason: '광고 같아요', uid: 'reader', createdAt: '2026-10-19' }));
  await assertFails(getDoc(doc(as('writer'), 'reports', 'rp1')));
  await assertSucceeds(getDoc(doc(as('admin'), 'reports', 'rp1')));
});

/* ── 담은 횟수·이달의 추천 ── */
await test('일정에 담은 횟수: 처음은 1, 그 뒤 +1 만', async () => {
  await assertSucceeds(setDoc(doc(as('owner'), 'placeStats', '강원_9'), { count: 1, title: '영금정', region: '강원', updatedAt: '2026-10-19' }));
  await assertFails(setDoc(doc(as('owner'), 'placeStats', '강원_8'), { count: 5, title: '영금정', region: '강원', updatedAt: '2026-10-19' }));
  await assertSucceeds(updateDoc(doc(as('owner'), 'placeStats', '강원_1'), { count: 5, updatedAt: '2026-10-19' }));
  await assertFails(updateDoc(doc(as('owner'), 'placeStats', '강원_1'), { count: 7, updatedAt: '2026-10-19' }));
});
await test('이달의 추천: 관리자만 쓰고, 로그인한 사람은 읽는다', async () => {
  const pick = { title: '영금정', region: '강원', reason: '일출', month: '2026-10', order: 1, link: '', createdAt: '2026-10-19' };
  await assertFails(setDoc(doc(as('owner'), 'picks', 'k1'), pick));
  await assertSucceeds(setDoc(doc(as('admin'), 'picks', 'k1'), pick));
  await assertSucceeds(getDoc(doc(as('owner'), 'picks', 'k1')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'picks', 'k1')));
});
await test('규칙에 없는 컬렉션은 전부 차단', async () => {
  await assertFails(setDoc(doc(as('admin'), 'anything', 'x'), { a: 1 }));
});

await env.cleanup();
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
