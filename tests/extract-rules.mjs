/* firestore_보안규칙_붙여넣기.txt 의 ▼▼▼ ~ ▲▲▲ 사이 본문을 tests/firestore.rules 로 뽑아냅니다.
   규칙 시험(rules.test.mjs)과 자동 배포(release.yml)가 이 파일을 씁니다. 손으로 고치지 마세요. */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
/* 맥에서 올린 한글 파일 이름(자모 분리형)도 찾도록 글자 모양으로 비교 */
const hit = readdirSync(root).find(f => f.normalize('NFC') === 'firestore_보안규칙_붙여넣기.txt'.normalize('NFC'));
if (!hit) { console.error('firestore_보안규칙_붙여넣기.txt 파일이 저장소 루트에 없습니다'); process.exit(1); }
const txt = readFileSync(path.join(root, hit), 'utf8');
const s = txt.indexOf('▼▼▼ 여기부터'), e = txt.indexOf('▲▲▲ 여기까지');
if (s < 0 || e < 0 || e < s) { console.error('규칙 파일에 ▼▼▼ 여기부터 / ▲▲▲ 여기까지 표시가 없습니다'); process.exit(1); }
const body = txt.slice(txt.indexOf('\n', s) + 1, e).trim() + '\n';
if (!body.startsWith("rules_version = '2';")) { console.error('규칙 본문이 rules_version 으로 시작하지 않습니다'); process.exit(1); }
writeFileSync(path.join(here, 'firestore.rules'), body);
console.log(`firestore.rules 생성 (${body.split('\n').length}줄)`);
