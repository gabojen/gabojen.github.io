/* 배포 전 정합성 검사 — 캐시 문자열·버전 표기·보안 규칙 컬렉션·문법.
   실행: node tests/check-release.mjs   (하나라도 어긋나면 종료 코드 1) */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(path.join(root, f), 'utf8');
const problems = [];
const bad = m => problems.push(m);

/* 1. 자바스크립트 문법 */
for (const f of ['assets/app.js', 'assets/release-ui.js', 'assets/release-core.js', 'assets/release-config.js', 'assets/onboarding.js', 'sw.js']) {
  if (!existsSync(path.join(root, f))) { bad(`파일 없음: ${f}`); continue; }
  try { execFileSync('node', ['--check', path.join(root, f)], { stdio: 'pipe' }); } catch (e) { bad(`문법 오류: ${f}\n${String(e.stderr || e.message).slice(0, 400)}`); }
}
/* firebase.js 는 ES 모듈(import) — import 줄을 떼고 문법만 확인 */
try { new Function(read('assets/firebase.js').replace(/^import[\s\S]*?;\n/gm, '')); } catch (e) { bad('문법 오류: assets/firebase.js — ' + e.message); }

/* 2. index.html 캐시 문자열이 모든 자산에서 같은가 */
const html = read('index.html');
const vs = [...html.matchAll(/assets\/(?:app|release-core|release-config|release-ui|onboarding|firebase)\.js\?v=([^"']+)|assets\/(?:legacy|release|onboarding)\.css\?v=([^"']+)/g)].map(m => m[1] || m[2]);
if (vs.length < 9) bad(`index.html 에 ?v= 캐시 문자열이 ${vs.length}개뿐입니다 (9개여야 함)`);
if (new Set(vs).size > 1) bad(`index.html 캐시 문자열이 섞여 있습니다: ${[...new Set(vs)].join(', ')} — 고친 파일만 올리면 폰이 옛 파일을 씁니다`);

/* 3. 버전 표기 일치: APP_VERSION · release-config.version · index.html 주석 */
const appVer = (read('assets/app.js').match(/APP_VERSION='v([\d.]+)/) || [])[1];
const cfgVer = (read('assets/release-config.js').match(/version:\s*'([\d.]+)'/) || [])[1];
const cmtVer = (html.match(/Release ([\d.]+)/) || [])[1];
if (!appVer || !cfgVer || !cmtVer) bad(`버전 표기를 찾지 못함 (app ${appVer}, config ${cfgVer}, index ${cmtVer})`);
else if (appVer !== cfgVer || appVer !== cmtVer) bad(`버전 표기 불일치: app.js v${appVer} · release-config ${cfgVer} · index.html 주석 ${cmtVer}`);
if (appVer && vs[0] && !vs[0].startsWith(appVer)) bad(`캐시 문자열(${vs[0]})이 버전(${appVer})으로 시작하지 않습니다`);

/* 4. 코드가 쓰는 Firestore 컬렉션마다 보안 규칙이 있는가 */
const fb = read('assets/firebase.js');
const used = new Set([...fb.matchAll(/(?:collection|doc)\(db,\s*'([A-Za-z_]+)'/g)].map(m => m[1]));
const rulesTxt = read('firestore_보안규칙_붙여넣기.txt');
const ruled = new Set([...rulesTxt.matchAll(/match \/([A-Za-z_]+)\/\{/g)].map(m => m[1]));
for (const c of used) if (!ruled.has(c)) bad(`컬렉션 '${c}' 를 코드가 쓰는데 보안 규칙 파일에 match 가 없습니다 (기본 차단 → 기능이 조용히 실패)`);
const start = rulesTxt.indexOf('▼▼▼ 여기부터'), end = rulesTxt.indexOf('▲▲▲ 여기까지');
if (start < 0 || end < 0 || end < start) bad('보안 규칙 파일에 ▼▼▼ / ▲▲▲ 표시가 없습니다');
else {
  const body = rulesTxt.slice(start, end);
  if (!/rules_version = '2'/.test(body)) bad('보안 규칙 본문에 rules_version 이 없습니다');
  const open = (body.match(/\{/g) || []).length, close = (body.match(/\}/g) || []).length;
  if (open !== close) bad(`보안 규칙 본문의 중괄호가 맞지 않습니다 ({ ${open} / } ${close})`);
}

/* 5. 서비스 워커·매니페스트가 가리키는 파일 존재 */
for (const f of ['offline.html', 'assets/brand.svg', 'assets/icon-192.png', 'assets/icon-512.png', 'assets/icon-maskable-512.png', 'manifest.webmanifest', 'privacy.html', 'account-deletion.html'])
  if (!existsSync(path.join(root, f))) bad(`배포에 필요한 파일이 없습니다: ${f}`);

/* 6. 비밀값이 섞여 들어오지 않았는가 (서버 비밀키·개인 토큰 형태) */
for (const f of ['assets/app.js', 'assets/firebase.js', 'assets/release-config.js', 'news-maker.html', 'index.html'])
  if (/(sk-[A-Za-z0-9]{20,}|-----BEGIN PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,})/.test(read(f))) bad(`비밀값으로 보이는 문자열이 있습니다: ${f}`);

if (problems.length) { console.log('배포 정합성 검사 실패:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log(`배포 정합성 검사 통과 (버전 v${appVer}, 캐시 ${vs[0]}, 규칙 컬렉션 ${[...used].join('·')})`);
