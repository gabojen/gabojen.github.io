/* 화면 시험(연기 시험) — 실제 index.html 을 폰 크기 브라우저로 열고, Firebase 대신 가짜 저장소를 끼워 주요 흐름을 돌립니다.
   하나라도 실패하면 배포가 멈춥니다. 실행: cd tests && npm run smoke */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const NEWS = readFileSync(path.join(here, 'fixtures/news.json'), 'utf8');

const TRIP = (id, title, start, end, items, extra = {}) => ({ id, title, place: '강원 속초', groupType: '가족', status: 'active', start, end,
  days: [{ date: start, items }, { date: end, items: [] }], members: [{ uid: 'u1', n: '연', nm: '연세아빠' }], memberUids: ['u1'], owner: 'u1', pack: [], proposals: [], ...extra });
const ITEM = (id, cat, time, title, place = '') => ({ _id: id, cat, time, title, place, sub: '', by: '연세아빠', createdBy: 'u1', comments: [] });

/* 앱을 열고 로그인한 상태를 흉내 냅니다. 저장은 window.__saved 에 쌓이고, 실패를 흉내 내려면 window.__fail=true */
async function boot(page, { trips = [], recs = [] } = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('**/news/latest.json*', r => r.fulfill({ status: 200, contentType: 'application/json', body: NEWS }));
  await page.route('**/news/trend.json*', r => r.fulfill({ status: 404, body: 'nf' }));
  await page.goto('/index.html?test=1');
  await page.waitForFunction(() => window.FB && typeof window.FB.saveTrip === 'function', null, { timeout: 30000 });
  await page.evaluate(({ trips, recs }) => {
    window.__saved = []; window.__fail = false; window.__deleted = []; window.__recs = [];
    ME = { uid: 'u1', name: '연세아빠', email: 't@t', photo: '', verified: true };
    TRIPS = trips; TRIPS_READY = true; kakaoReady = false;
    Object.assign(window.FB, {
      saveTrip: async t => { if (window.__fail) { const e = new Error('시험용 실패'); e.code = 'permission-denied'; throw e; } window.__saved.push(JSON.parse(JSON.stringify(t))); return t; },
      deleteTrip: async id => { window.__deleted.push(id); TRIPS = TRIPS.filter(t => t.id !== id); },
      watchPhotos: () => {}, reloadTrips: () => {}, listRecs: async () => recs, myRecs: async () => [], myVotes: async () => [],
      addRec: async (r, tid, photos) => { window.__recs.push({ r, tid, photos }); return 'n1'; },
      listPicks: async () => [], placeStats: async () => ({}), bumpPlace: async () => {},
      checkAppCheck: async () => ({ ok: true, msg: 'ok' }),
    });
    hideSplash(); document.getElementById('nav').classList.remove('hidden'); document.getElementById('topbar').classList.remove('hidden');
  }, { trips, recs });
  return errors;
}
const wait = (page, ms) => page.waitForTimeout(ms);

test('로그인 화면이 오류 없이 뜨고 버전 표기가 일치한다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/index.html?test=0');
  await expect(page.locator('#login.active')).toBeVisible();
  const v = await page.evaluate(() => ({ app: APP_VERSION, cfg: GABOJEN_RELEASE.version }));
  expect(v.app).toContain(v.cfg);
  expect(errors).toEqual([]);
});

test('가입 보호: 일회용 메일·별칭·봇 칸·기기 한도', async ({ page }) => {
  await page.goto('/index.html?test=2');
  const r = await page.evaluate(() => {
    try { localStorage.removeItem('gbj_signups'); } catch (_) {}
    authMode('signup'); signupTabAt = Date.now() - 5000;
    const out = { ok: signupGuard('leo@example.com'), temp: signupGuard('a@mailinator.com'), alias: signupGuard('leo+1@example.com') };
    document.getElementById('aWebsite').value = 'x'; out.bot = signupGuard('leo@example.com'); document.getElementById('aWebsite').value = '';
    noteSignup(); noteSignup(); noteSignup(); out.limit = signupGuard('leo@example.com'); try { localStorage.removeItem('gbj_signups'); } catch (_) {}
    return out;
  });
  expect(r.ok).toBe(''); expect(r.temp).toContain('일회용'); expect(r.alias).toContain('별칭'); expect(r.bot).not.toBe(''); expect(r.limit).toContain('기기');
});

test('일정 추가: 분류 버튼으로 고르고 저장하면 목록에 보이고 저장이 호출된다', async ({ page }) => {
  const errors = await boot(page, { trips: [TRIP('t1', '가을 여행', '2026-11-10', '2026-11-11', [ITEM('a', 'plan', '10:00', '속초 해변')])] });
  await page.evaluate(() => { openTrip('t1'); openAddItem(0); });
  await expect(page.locator('#ovc .cat-pick .cp')).toHaveCount(6);
  await page.locator('#ovc .cat-pick .cp[data-cat="stay"]').click();
  expect(await page.evaluate(() => document.getElementById('aCat').value)).toBe('stay');
  await page.fill('#aTitle', '속초 호텔');
  await page.evaluate(() => saveAddItem());
  await wait(page, 500);
  const r = await page.evaluate(() => ({ saved: window.__saved.length, items: trip('t1').days[0].items.map(i => i.cat + ':' + i.title), savedCats: window.__saved[0].days[0].items.map(i => i.cat) }));
  expect(r.saved).toBe(1); expect(r.items).toContain('stay:속초 호텔'); expect(r.savedCats).toContain('stay');
  expect(errors).toEqual([]);
});

test('일정 추가 실패 시 화면에서도 되돌린다 (보이기만 하고 사라지는 일 방지)', async ({ page }) => {
  await boot(page, { trips: [TRIP('t1', '가을 여행', '2026-11-10', '2026-11-11', [ITEM('a', 'plan', '10:00', '속초 해변')])] });
  await page.evaluate(() => { openTrip('t1'); openAddItem(0); window.__fail = true; });
  await page.fill('#aTitle', '실패할 일정');
  await page.evaluate(() => saveAddItem());
  await wait(page, 500);
  const titles = await page.evaluate(() => trip('t1').days[0].items.map(i => i.title));
  expect(titles).not.toContain('실패할 일정');
  expect(await page.evaluate(() => document.getElementById('ov').classList.contains('on'))).toBe(true);
});

test('중복 확인 팝업: 취소하면 저장 없음, 사본이 바뀐 뒤 "그래도 추가"해도 최신 사본에 저장된다', async ({ page }) => {
  await boot(page, { trips: [TRIP('t1', '가을 여행', '2026-11-10', '2026-11-11', [ITEM('a', 'plan', '10:00', '속초 해변', '속초')])] });
  await page.evaluate(() => { openTrip('t1'); openAddItem(0); });
  await page.fill('#aTitle', '속초 해변'); await page.fill('#aPlace', '속초');
  await page.evaluate(() => { document.getElementById('aTime').value = '10:00'; return saveAddItem(); });
  await wait(page, 300);
  expect(await page.evaluate(() => document.getElementById('ovc').innerText)).toContain('이미 같은 일정');
  await page.evaluate(() => closeOv());
  await wait(page, 300);
  expect(await page.evaluate(() => window.__saved.length)).toBe(0);
  // 다시 열어 팝업까지 간 뒤, 서버 사본이 바뀐 상황(남이 x 추가)을 흉내
  await page.evaluate(() => { openAddItem(0); });
  await page.fill('#aTitle', '속초 해변'); await page.fill('#aPlace', '속초');
  await page.evaluate(() => { document.getElementById('aTime').value = '10:00'; return saveAddItem(); });
  await wait(page, 300);
  await page.evaluate(() => {
    const fresh = JSON.parse(JSON.stringify(TRIPS[0])); fresh.days[0].items.push({ _id: 'x', cat: 'plan', time: '09:00', title: '다른 회원 일정', place: '', sub: '', by: 'y', createdBy: 'u2', comments: [] }); TRIPS = [fresh];
    return dupOneGo();
  });
  await wait(page, 500);
  const saved = await page.evaluate(() => window.__saved[0].days[0].items.map(i => i.title));
  expect(saved).toContain('다른 회원 일정'); expect(saved.filter(t => t === '속초 해변').length).toBe(2);
});

test('일정 삭제: 취소하면 유지, 삭제하면 저장되고 목록에서 사라진다', async ({ page }) => {
  await boot(page, { trips: [TRIP('t1', '가을 여행', '2026-11-10', '2026-11-11', [ITEM('a', 'plan', '10:00', '속초 해변'), ITEM('b', 'stay', '15:00', '속초 호텔')])] });
  await page.evaluate(() => { openTrip('t1'); delItem('b'); });
  await wait(page, 300);
  await page.evaluate(() => closeOv());
  expect(await page.evaluate(() => trip('t1').days[0].items.length)).toBe(2);
  await page.evaluate(() => { delItem('b'); });
  await wait(page, 300);
  await page.evaluate(() => doDelItem('b'));
  await wait(page, 500);
  const r = await page.evaluate(() => ({ left: trip('t1').days[0].items.map(i => i._id), saved: window.__saved.length, savedIds: window.__saved[0].days[0].items.map(i => i._id) }));
  expect(r.left).toEqual(['a']); expect(r.saved).toBe(1); expect(r.savedIds).toEqual(['a']);
});

test('여행 추천: 분위기 타일·코스·회원 추천이 그려지고 타일을 눌러도 아래 상자가 밀리지 않는다', async ({ page }) => {
  const errors = await boot(page, { trips: [], recs: [{ id: 'r1', region: '강원', title: '영금정', note: '일출이 예뻐요. 주차는 근처 공영주차장.', cat: 'plan', month: 8, createdAt: '2026-09-01', mine: false, helpful: 1, thumbs: [], photoIds: [] }] });
  await page.evaluate(() => { switchTab('go'); });
  await page.waitForFunction(() => NEWS_STATE === 'ok' && RECS_STATE === 'ok');
  await page.evaluate(() => goPick('강원'));
  await wait(page, 400);
  await expect(page.locator('#go .mood-tiles .mood')).toHaveCount(4);
  await expect(page.locator('#go .course-card')).toHaveCount(1);
  await expect(page.locator('#go .rec-card')).toHaveCount(1);
  const shift = await page.evaluate(async () => { const g = document.getElementById('go'); g.scrollTop = 0; const b = g.querySelector('.region-picker').getBoundingClientRect().top; g.querySelector('.mood-tiles .mood').click(); await new Promise(r => setTimeout(r, 300)); return Math.round(g.querySelector('.region-picker').getBoundingClientRect().top - b); });
  expect(shift).toBe(0);
  expect(await page.evaluate(() => { const g = document.getElementById('go'); return g.scrollWidth > g.clientWidth; })).toBe(false);
  expect(errors).toEqual([]);
});

test('붐빔 정보: 장소끼리 등급이 아니라 그 장소의 평일·주말 비교로 보인다', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => switchTab('go'));
  await page.waitForFunction(() => NEWS_STATE === 'ok');
  await page.evaluate(() => goPick('강원'));
  await page.waitForTimeout(400);
  const chips = await page.locator('#go .sig').allInnerTexts();
  expect(chips).toContain('주말에 붐벼요'); expect(chips).toContain('요일 차이 적어요');
  expect(chips.join(' ')).not.toContain('붐빔 예상');
  await page.evaluate(() => openSpot('강원', NEWS.spots['강원'][0].id));
  await page.waitForTimeout(400);
  const t = await page.locator('#ovc').innerText();
  expect(t).toContain('주말이 평일보다 약 40% 더 붐벼요'); expect(t).toContain('11/7(토)'); expect(t).toContain('다른 장소와 붐빔 정도를 비교하는 숫자는 아니에요');
  expect(errors).toEqual([]);
});

test('회원 추천 올리기: 연락처는 거부, 정상 글은 검수 대기로 올라간다', async ({ page }) => {
  await boot(page, { trips: [TRIP('t0', '지난 여행', '2026-08-20', '2026-08-21', [ITEM('a', 'plan', '11:00', '속초 해변', '속초해수욕장')])] });
  await page.evaluate(() => openRecCompose('t0', 'a'));
  await wait(page, 400);
  await page.fill('#recNote', '연락은 010-1234-5678');
  await page.check('#recAgree');
  await page.evaluate(() => submitRec());
  await wait(page, 300);
  expect(await page.evaluate(() => window.__recs.length)).toBe(0);
  await page.fill('#recNote', '오후 다섯 시쯤 가면 사람이 적고 노을이 예뻐요.');
  await page.evaluate(() => submitRec());
  await wait(page, 800);
  const r = await page.evaluate(() => window.__recs[0]);
  expect(r.r.title).toBe('속초 해변'); expect(r.r.region).toBe('강원'); expect(r.tid).toBe('t0');
});

test('AI 사용 한도: 5회를 다 쓰면 호출 전에 막힌다', async ({ page }) => {
  await boot(page, { trips: [TRIP('t1', '가을 여행', '2026-11-10', '2026-11-11', [], { aiUse: { u1: 5 } })] });
  const r = await page.evaluate(() => { curTrip = 't1'; try { aiQuotaCheck(); return 'ok'; } catch (e) { return e.code; } });
  expect(r).toBe('travel/quota');
});

test('여행책(추억)에서도 ⋯ 메뉴로 여행을 지울 수 있다', async ({ page }) => {
  await boot(page, { trips: [TRIP('t9', '지난 여행', '2026-08-20', '2026-08-21', [ITEM('a', 'plan', '11:00', '속초 해변')])] });
  await page.evaluate(() => { openAlbum('t9'); });
  await wait(page, 600);
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('moreBtn')).display)).toBe('flex');
  await page.evaluate(() => openTripMenu());
  await wait(page, 300);
  await expect(page.locator('#ovc button', { hasText: '이 여행 삭제' })).toBeVisible();
});

test('운영 현황 회원 목록: 열 제목(가입일·여행·마지막 접속)이 보이고, 내 여행 수를 프로필에 적는다', async ({ page }) => {
  await boot(page, { trips: [TRIP('t1', '가을 여행', '2026-11-10', '2026-11-11', []), TRIP('t0', '지난 여행', '2026-08-20', '2026-08-21', [])] });
  const n = await page.evaluate(async () => { const got = []; window.FB.syncTripCount = async n => got.push(n); window.onTrips(TRIPS); return got; });
  expect(n).toEqual([2]);
  await page.evaluate(() => { window.__admMembers = [{ email: 'ye12345@kakaocorp.com', joined: '2026-09-30', seen: new Date().toISOString().slice(0, 10), trips: 2 }]; openAdminMembers(); });
  const head = await page.locator('#ovc .admhead').innerText();
  expect(head).toContain('가입일'); expect(head).toContain('마지막 접속');
  expect(await page.locator('#ovc .admlist .admrow').first().innerText()).toContain('2개');
});

test('화면 가로 넘침 없음 (홈·내 여행·일정·추억)', async ({ page }) => {
  await boot(page, { trips: [TRIP('t1', '가을 여행', '2026-11-10', '2026-11-11', [ITEM('a', 'plan', '10:00', '속초 해변')]), TRIP('t0', '지난 여행', '2026-08-20', '2026-08-21', [ITEM('b', 'plan', '11:00', '설악산')])] });
  for (const tab of ['today', 'trips', 'history']) {
    await page.evaluate(t => switchTab(t), tab);
    await wait(page, 400);
    expect(await page.evaluate(() => { const s = document.querySelector('.screen.active'); return s.scrollWidth - s.clientWidth; }), tab).toBeLessThanOrEqual(1);
  }
  await page.evaluate(() => openTrip('t1'));
  await wait(page, 400);
  expect(await page.evaluate(() => { const s = document.querySelector('.screen.active'); return s.scrollWidth - s.clientWidth; })).toBeLessThanOrEqual(1);
});
