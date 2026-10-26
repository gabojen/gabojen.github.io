# 여행가보젠 — 배포·운영 안내

> 서비스 주소: https://gabojen.github.io · Firebase 프로젝트 `happytravel-11758`
> 자세한 기획·변경 이력은 `여행가보젠_개발명세서.md`, 디자인·코드 규칙은 `.project/design.md` 를 봅니다.

## 올리는 파일 (GitHub Pages 저장소 루트)

| 파일 | 역할 |
|---|---|
| `index.html` | 뼈대. 파일을 고칠 때마다 안의 `?v=…` 캐시 문자열을 올린다 |
| `assets/app.js` | 앱 로직 |
| `assets/firebase.js` | 인증·저장·AI·초대 (ES 모듈) |
| `assets/release-core.js` | 데이터 검증·병합·추천 필터 |
| `assets/release-ui.js` | 저장 복구, 접근성, 초대 UI, 약관·개인정보 본문 |
| `assets/release-config.js` | 운영자 정보·AI 모델·정책 버전 (비밀값 금지) |
| `assets/release.css` `legacy.css` `onboarding.css` `onboarding.js` | 스타일·첫 사용 안내 |
| `assets/brand.svg` `icon-*.png` `apple-touch-icon.png` `favicon.ico` | 아이콘 |
| `manifest.webmanifest` `sw.js` `offline.html` | 설치형 앱(PWA)·오프라인 안내 |
| `covers/` `hero/` | 표지·홈 카드 사진 (Unsplash). 못 불러올 때는 앱이 직접 그린 풍경 그림이 대신 보임 |
| `news/latest.json` | 여행 추천 자료 (월 1회 `news-maker.html` 로 생성) |
| `news-maker.html` | 운영자용 소식지 생성 페이지 (한국 IP에서만 동작) |

## 파일을 고쳤을 때

1. 고친 파일을 `backup/v12/` 에 날짜와 함께 복사해 둔다.
2. `index.html` 의 `?v=12.x.x-YYYYMMDD.n` 문자열을 전부 올린다. (안 올리면 폰이 옛 파일을 씀)
3. `assets/app.js` 의 `APP_VERSION` 과 `assets/release-config.js` 의 `version` 을 맞춘다.
4. GitHub 저장소에 고친 파일 + `index.html` 을 올린다.
5. 폰에서 [내 계정] 맨 아래 버전 표시로 새 파일이 적용됐는지 확인한다.

## 출시 안전장치 (2026-10-19부터)

파일을 올리면 `.github/workflows/release.yml` 이 자동으로 돈다. 검사를 **전부 통과한 것만** 사이트에 올라가고, 하나라도 실패하면 사이트는 이전 버전 그대로이고 GitHub 에서 실패 메일이 온다.

| 단계 | 무엇을 보나 | 파일 |
|---|---|---|
| ① 정합성 | 자바스크립트 문법, `?v=` 캐시 문자열 9개 일치, 버전 표기 3곳 일치, 코드가 쓰는 Firestore 컬렉션마다 규칙 존재, 필수 파일, 비밀값 유출 | `tests/check-release.mjs` |
| ① 단위 시험 | 3자 병합(동시 추가·삭제·충돌), 여행·추천 검증, 소식지 형식 | `tests/core.test.mjs` |
| ② 규칙 시험 | 실제 보안 규칙을 에뮬레이터에 올려 구성원/남/미인증의 읽기·쓰기, 일정 추가·삭제 저장, 초대·참여·나가기, 추천·도움돼요·담은 횟수·이달의 추천 허용/거부 22항목 | `tests/rules.test.mjs` |
| ③ 화면 시험 | 폰 크기 브라우저로 실제 `index.html` 을 열어 로그인 화면·가입 보호·분류 버튼·일정 추가/실패 되돌림/중복 확인/삭제·여행 추천 화면·추천 올리기·AI 한도·여행책 삭제·가로 넘침 11항목 | `tests/smoke.spec.mjs` |
| 규칙 배포 | 비밀값 `FIREBASE_SERVICE_ACCOUNT` 가 있으면 `firestore_보안규칙_붙여넣기.txt` 본문을 Firestore 에 자동 게시(없으면 건너뜀 → 콘솔에 붙여넣기) | `tests/extract-rules.mjs` |
| 사이트 배포 | `tests/`·`backup/`·`.github/` 를 뺀 나머지를 GitHub Pages 로 | — |

처음 한 번 할 일: 저장소 **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 바꾼다. (이전 "Deploy from a branch" 로 두면 검사와 무관하게 바로 올라간다.)
규칙 자동 배포까지 하려면: Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → **새 비공개 키 생성** → 받은 JSON 파일 내용 전체를 GitHub **Settings → Secrets and variables → Actions → New repository secret** 에 이름 `FIREBASE_SERVICE_ACCOUNT` 로 넣는다. 이 JSON 은 서버 비밀키이므로 저장소 파일에는 절대 넣지 않는다.

내 컴퓨터에서 미리 돌려 보기 (Node 20 · Java 21 · firebase-tools 필요):

```bash
cd tests && npm install && npm run unit && npm run rules && npm run smoke
```

실패 결과는 GitHub → Actions → 실패한 실행 → 아래 `smoke-report` 에서 화면 캡처와 함께 볼 수 있다.

## 콘솔에서만 하는 설정

- **Firestore 규칙**: `firestore_보안규칙_붙여넣기.txt` (8판, 2026-10-19 — 회원 추천 `recs`·`reports`·사진 `recPhotos`·도움돼요 `recVotes`·담은 횟수 `placeStats`·이달의 추천 `picks`). 컬렉션을 새로 만들면 규칙부터 쓴다.
- **이달의 추천**: 앱 [내 계정 → 운영 현황 → 이달의 추천 관리]에서 매달 3~6곳을 직접 적는다(장소·지역·이유). 가장 최근 달이 [여행 추천] 맨 위에 보인다.
- **추천 검수**: 회원이 올린 '다녀온 곳' 추천은 검수 대기로 들어온다. 앱 [내 계정 → 운영 현황 → 추천 검수]에서 공개/숨김. 신고도 같은 화면에서 처리.
- **관리자 지정**: Firestore `admins/{uid}` 문서를 콘솔에서 만든다.
- **App Check**: reCAPTCHA Enterprise. AI Logic 에 적용(enforce)돼 있어야 남이 AI 할당량을 못 쓴다.
- **Authentication 승인된 도메인**: `gabojen.github.io`
- **카카오 개발자 콘솔**: 플랫폼 Web 도메인과 JavaScript SDK 도메인에 `https://gabojen.github.io`
- **Storage**: 버킷 없음(`USE_PHOTO_STORAGE=false`). 사진은 Firestore `photos` 문서에 저장.
- **AI 사용 상한(프로젝트 전체)**: Google Cloud 콘솔 → API 및 서비스 → 할당량 → Generative Language API 에서 하루 요청 수 상한을 건다.
  앱 안의 '여행당 5회' 제한(`release-config.aiPerTrip`)은 정상 사용자용이고, 이 콘솔 상한이 진짜 방어선이다.
- **가입 할당량**: Firebase 콘솔 → Authentication → 설정 → 가입 할당량(Sign-up quota). 기본 IP당 시간당 100건을 10건 정도로 낮춘다.
  앱 안의 장치(일회용 메일·별칭 주소·봇 함정·기기당 하루 3계정, `release-config.signupsPerDevice`)는 손쉬운 대량 가입만 막는다.

## 비밀값 원칙

이 저장소는 공개다. Firebase 설정값·카카오 JavaScript 키·reCAPTCHA 사이트 키는 원래 공개되는 값이고,
실제 보호는 Firestore 규칙·도메인 제한·App Check 가 맡는다. Gemini 키는 Firebase AI Logic 이 서버에서
들고 있으므로 앱 파일 어디에도 적지 않는다. 관광공사 인증키는 운영자 브라우저에만 저장한다.

## 매달 하는 일

https://gabojen.github.io/news-maker.html → [소식지 만들기] → [파일 내려받기] → 저장소 `news/latest.json` 교체.
하루 한 번만(호출 한도 1,000건). 생성기는 950건에서 스스로 멈추고, 사이트의 지난 `latest.json`에 이미 있는 장소의 소개·이용시간·사진은 다시 받지 않는다.
지역마다 관광지 12·문화시설 8·레포츠 8·맛집/카페 20곳(최대 48곳, 2026-10-19부터)을 모으며, 지난 파일의 장소는 유지하고 정원의 30%만 매달 새 장소로 바꾼다.
장소가 많이 늘어난 달(처음 한 번)은 예산이 모자라 일부 장소가 소개·이용시간 없이 실린다. 로그에 "다음에 이어서"가 보이면 **다음 날 한 번 더** 만들어 올리면 채워진다. 그 뒤로는 한 달에 한 번이면 충분하다. 파일에는 장소별 이용시간·쉬는 날·주차·문의·반려동물·유모차·대표메뉴·사진과 지역별 추천 코스(`courses`)가 들어간다.
