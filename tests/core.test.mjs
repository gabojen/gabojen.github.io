/* 순수 데이터 계층(release-core.js) 단위 시험 — 외부 연결 없이 node 만으로 돕니다.
   실행: node tests/core.test.mjs  (실패하면 종료 코드 1 → 배포 중단) */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const require = createRequire(import.meta.url);
const C = require(path.join(root, 'assets/release-core.js'));

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); } }
const eq = (a, b, msg) => { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error((msg || '값이 다름') + `\n      기대: ${y}\n      실제: ${x}`); };
const throws = (fn, re) => { try { fn(); } catch (e) { if (re && !re.test(e.message)) throw new Error('다른 오류: ' + e.message); return; } throw new Error('오류가 나야 하는데 통과함'); };
const it = (id, time, extra = {}) => ({ _id: id, cat: 'plan', time, title: id, place: '', sub: '', comments: [], ...extra });

console.log('release-core 단위 시험');

/* ── 3자 병합: 동시 편집에서 남의 변경이 사라지지 않는가 ── */
test('동시 추가: 내가 b, 남이 x → a, x, b 모두 남는다', () => {
  const base = { days: [{ date: '2026-11-01', items: [it('a', '10:00')] }] };
  const local = { days: [{ date: '2026-11-01', items: [it('a', '10:00'), it('b', '12:00')] }] };
  const remote = { days: [{ date: '2026-11-01', items: [it('a', '10:00'), it('x', '09:00')] }] };
  eq(C.merge(base, local, remote).days[0].items.map(i => i._id), ['a', 'x', 'b']);
});
test('내가 지운 항목은 남이 안 건드렸으면 지워진다', () => {
  const base = { days: [{ date: 'd', items: [it('a', '10:00'), it('b', '11:00')] }] };
  const local = { days: [{ date: 'd', items: [it('a', '10:00')] }] };
  eq(C.merge(base, local, base).days[0].items.map(i => i._id), ['a']);
});
test('같은 항목의 같은 값을 서로 다르게 고치면 충돌 오류', () => {
  const base = { days: [{ date: 'd', items: [it('a', '10:00')] }] };
  const local = { days: [{ date: 'd', items: [it('a', '11:00')] }] };
  const remote = { days: [{ date: 'd', items: [it('a', '12:00')] }] };
  throws(() => C.merge(base, local, remote), /다른 구성원이 수정/);
});
test('의견(comments) 동시 추가는 둘 다 남는다', () => {
  const b = { comments: [{ uid: 'u1', text: '1', at: 1 }] };
  const l = { comments: [{ uid: 'u1', text: '1', at: 1 }, { uid: 'u1', text: '2', at: 2 }] };
  const r = { comments: [{ uid: 'u1', text: '1', at: 1 }, { uid: 'u2', text: '3', at: 3 }] };
  eq(C.merge(b, l, r).comments.map(c => c.text), ['1', '3', '2']);
});
test('memberUids(문자열 배열) 동시 추가', () => {
  eq(C.merge({ m: ['a'] }, { m: ['a', 'b'] }, { m: ['a', 'c'] }).m, ['a', 'c', 'b']);
});
/* 2026-10-19 실사용 버그: 서버는 필드를 알파벳순으로 돌려주고 앱은 만든 순서로 들고 있음. 순서만 달라도 "겹침"이 됐음 */
const appOrder = { _id: 'a', cat: 'plan', time: '10:00', title: '속초', place: '', sub: '', by: '나', createdBy: 'u1', comments: [], map: false };
const serverOrder = { _id: 'a', by: '나', cat: 'plan', comments: [], createdBy: 'u1', map: false, place: '', sub: '', time: '10:00', title: '속초' };
test('필드 순서만 다른 기준본·서버본: 혼자 쓰는 여행에서 삭제가 겹침이 되지 않는다', () => {
  const base = { days: [{ date: 'd', items: [appOrder] }] }, remote = { days: [{ date: 'd', items: [serverOrder] }] };
  eq(C.merge(base, { days: [{ date: 'd', items: [] }] }, remote).days[0].items, []);
});
test('필드 순서만 다른 기준본·서버본: 수정도 겹침 없이 반영된다', () => {
  const base = { days: [{ date: 'd', items: [appOrder] }] }, remote = { days: [{ date: 'd', items: [serverOrder] }] };
  const local = { days: [{ date: 'd', items: [{ ...appOrder, time: '11:00' }] }] };
  eq(C.merge(base, local, remote).days[0].items[0].time, '11:00');
});
test('기준본에만 남은 좌표(geo)처럼 undefined 로 비운 값은 없는 것과 같게 본다', () => {
  const base = { days: [{ date: 'd', items: [{ ...serverOrder, geo: undefined }] }] }, remote = { days: [{ date: 'd', items: [serverOrder] }] };
  eq(C.merge(base, { days: [{ date: 'd', items: [] }] }, remote).days[0].items, []);
});
test('진짜 충돌은 여전히 잡는다: 내가 지운 항목을 남이 고쳤으면 겹침', () => {
  const base = { days: [{ date: 'd', items: [serverOrder] }] }, remote = { days: [{ date: 'd', items: [{ ...serverOrder, title: '남이 고침' }] }] };
  throws(() => C.merge(base, { days: [{ date: 'd', items: [] }] }, remote), /다른 구성원이 수정/);
});
test('기준본이 서버본과 같으면 내 변경이 그대로 반영된다 (기준본 없을 때의 대체 경로)', () => {
  const remote = { title: '여행', days: [{ date: 'd', items: [it('a', '10:00'), it('x', '09:00')] }] };
  const local = { title: '여행', days: [{ date: 'd', items: [it('a', '10:00'), it('x', '09:00'), it('b', '12:00')] }] };
  eq(C.merge(remote, local, remote).days[0].items.map(i => i._id), ['a', 'x', 'b']);
});

/* ── 여행 검증 ── */
test('validateTrip: 정상 여행 통과', () => {
  const t = { id: 'abcd1234', title: '여행', place: '강원', start: '2026-11-01', end: '2026-11-02', days: [{ date: '2026-11-01', items: [it('a', '10:00')] }, { date: '2026-11-02', items: [] }] };
  C.validateTrip(t);
});
test('validateTrip: 시간 형식이 틀리면 거부', () => {
  const t = { id: 'abcd1234', title: '여행', start: '2026-11-01', end: '2026-11-01', days: [{ date: '2026-11-01', items: [it('a', '9시')] }] };
  throws(() => C.validateTrip(t), /시간과 분류/);
});
test('dateRange: 90일 초과 거부, 종료일이 앞서면 거부', () => {
  throws(() => C.dateRange('2026-01-01', '2026-06-01'), /90일/);
  throws(() => C.dateRange('2026-01-02', '2026-01-01'), /종료일/);
  eq(C.dateRange('2026-01-01', '2026-01-03').length, 3);
});

/* ── 회원 추천 검증 ── */
test('validateRec: 전화번호·링크·연락 안내 거부', () => {
  const ok = { region: '강원', cat: 'plan', title: '속초 해변', note: '바다가 예쁘고 사람이 적어요', month: 8 };
  C.validateRec(ok);
  throws(() => C.validateRec({ ...ok, note: '연락주세요 010-1234-5678' }), /전화번호/);
  throws(() => C.validateRec({ ...ok, note: '여기 www.naver.com 보세요 정말 좋아요' }), /전화번호|링크/);
  throws(() => C.validateRec({ ...ok, note: '카톡 주세요 정말 좋은 곳이에요' }), /전화번호|링크|연락/);
  throws(() => C.validateRec({ ...ok, cat: 'transport' }), /장소·입장권·숙소/);
  throws(() => C.validateRec({ ...ok, note: '짧음' }), /10~300자/);
});
test('validateRec: 사진은 jpeg 작은 그림만, 사진 번호와 짝이 맞아야', () => {
  const ok = { region: '강원', cat: 'plan', title: '속초 해변', note: '바다가 예쁘고 사람이 적어요', month: 8 };
  eq(C.validateRec({ ...ok, thumbs: ['data:image/jpeg;base64,AAAA'], photoIds: ['p1'] }).photoIds, ['p1']);
  throws(() => C.validateRec({ ...ok, thumbs: ['data:image/png;base64,AAAA'], photoIds: ['p1'] }), /사진/);
  throws(() => C.validateRec({ ...ok, thumbs: ['data:image/jpeg;base64,AAAA'], photoIds: [] }), /사진 정보/);
});

/* ── 소식지 파일 ── */
const news = JSON.parse(readFileSync(path.join(here, 'fixtures/news.json'), 'utf8'));
test('normalizeNews: 시험 소식지 통과, 코스·이용시간 보존', () => {
  const n = C.normalizeNews(news);
  if (!n.courses['강원'] || n.courses['강원'][0].spots.length !== 5) throw new Error('코스 보존 실패');
  if (n.spots['강원'][0].hours !== '09:00~18:00') throw new Error('이용시간 보존 실패');
  if (n.spots['강원'][0].pet !== true) throw new Error('반려동물 판정 보존 실패');
});
test('normalizeNews: 옛 형식(코스·상세 없음)도 통과', () => {
  const n = C.normalizeNews({ festivals: [], spots: { 서울: [{ id: 1, title: 'x' }] } });
  eq(Object.keys(n.courses), []);
  eq(n.spots['서울'][0].hours, '');
});
test('discoveryFor: 쇼핑(38)·숙박(32)·코스(25) 제외, 코스 목록 반환', () => {
  const n = C.normalizeNews({ ...news, spots: { 강원: [...news.spots['강원'], { id: 's1', title: '쇼핑', contentTypeId: '38' }] } });
  const d = C.discoveryFor(n, '강원', '20261019');
  if (d.places.some(p => p.contentTypeId === '38')) throw new Error('쇼핑이 섞임');
  if (d.courses.length !== 1) throw new Error('코스 누락');
  if (d.festivals.length !== news.festivals.filter(f => f.region === '강원').length) throw new Error('축제 수 다름');
});
test('discoveryFor: 수련관·홍보관 같은 곳은 대표 명소가 아니면 거르고, 자료가 갖춰진 곳을 앞에 둔다 (레드팀 2026-10-26)', () => {
  const n = C.normalizeNews(news);
  const d = C.discoveryFor(n, '강원', '20261019');
  if (d.places.some(p => /수련관/.test(p.title))) throw new Error('청소년수련관이 걸러지지 않음');
  const first12 = d.places.filter(p => String(p.contentTypeId) === '12');
  const thinIdx = first12.findIndex(p => p.id === 'thin1');
  if (thinIdx !== first12.length - 1) throw new Error('자료 없는 장소가 맨 뒤가 아님: ' + thinIdx + '/' + first12.length);
  const food = d.places.filter(p => String(p.contentTypeId) === '39');
  if (!food.length) throw new Error('맛집이 사라짐');
  const withMark = C.discoveryFor(C.normalizeNews({ ...news, spots: { 강원: [{ id: 'm1', title: '설악산청소년수련원 전망대', contentTypeId: '12', img: 'covers/sea1.webp', landmark: '설악산' }] } }), '강원', '20261019');
  if (!withMark.places.length) throw new Error('대표 명소는 이름에 수련원이 있어도 남아야 함');
});
test('discoveryFor: 전통시장(38)은 대표 명소로 찾은 것만 남는다', () => {
  const n = C.normalizeNews({ ...news, spots: { 강원: [...news.spots['강원'], { id: 'mk1', title: '속초관광수산시장', contentTypeId: '38', img: 'covers/sea1.webp', landmark: '속초관광수산시장' }, { id: 'mk2', title: '아무 상가', contentTypeId: '38', img: 'covers/sea1.webp' }] } });
  const d = C.discoveryFor(n, '강원', '20261019');
  if (!d.places.some(p => p.id === 'mk1')) throw new Error('대표 명소 시장이 빠짐');
  if (d.places.some(p => p.id === 'mk2')) throw new Error('일반 쇼핑이 섞임');
});
test('safeImage/safeURL: 위험한 값 거부', () => {
  eq(C.safeImage('javascript:alert(1)'), '');
  eq(C.safeURL('ftp://x'), '');
  eq(C.safeImage('covers/sea1.webp'), 'covers/sea1.webp');
});
if (typeof C.normalizeTrend === 'function') test('normalizeTrend: 형식 밖 값은 null', () => {
  eq(C.normalizeTrend({}), null);
  const t = C.normalizeTrend({ items: { '1': { lv: 3, g: 1.4, up: true } }, madeAt: '2026-10-18' });
  if (!t || !t.items['1'].up) throw new Error('트렌드 항목 보존 실패');
});

console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
