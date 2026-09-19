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
| `covers/` `hero/` | 표지·홈 카드 사진 (Unsplash) |
| `news/latest.json` | 여행 추천 자료 (월 1회 `news-maker.html` 로 생성) |
| `news-maker.html` | 운영자용 소식지 생성 페이지 (한국 IP에서만 동작) |

## 파일을 고쳤을 때

1. 고친 파일을 `backup/v12/` 에 날짜와 함께 복사해 둔다.
2. `index.html` 의 `?v=12.x.x-YYYYMMDD.n` 문자열을 전부 올린다. (안 올리면 폰이 옛 파일을 씀)
3. `assets/app.js` 의 `APP_VERSION` 과 `assets/release-config.js` 의 `version` 을 맞춘다.
4. GitHub 저장소에 고친 파일 + `index.html` 을 올린다.
5. 폰에서 [내 계정] 맨 아래 버전 표시로 새 파일이 적용됐는지 확인한다.

## 콘솔에서만 하는 설정

- **Firestore 규칙**: `firestore_보안규칙_붙여넣기.txt` (5판, 2026-09-19). 컬렉션을 새로 만들면 규칙부터 쓴다.
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
하루 한 번만(호출 한도 1,000건).
