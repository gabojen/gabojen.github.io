/* Public settings only. Never put a Gemini/server secret in this file.
   Fill the operator fields and verify the deployed rules before release. */
window.GABOJEN_RELEASE = Object.freeze({
  version: '12.0.6',
  aiModel: 'gemini-3.1-flash-lite',
  supportEmail: 'aznail@hanmail.net',
  operatorName: '김광석',
  privacyRegion: 'Firestore 여행·사진 데이터: 대한민국 서울(asia-northeast3) · 인증 정보: 미국(Google) · AI 처리: Google Gemini',
  privacyContact: 'aznail@hanmail.net',
  policyVersion: '2026-09-19',
  aiPerTrip: 5,            // 여행 1건당 구성원 1명이 쓸 수 있는 AI 호출 횟수 (일정 짜기·빈 시간·문자/사진 읽기·서류 초안 모두 포함)
  signupsPerDevice: 3,     // 한 기기(브라우저)에서 하루에 만들 수 있는 계정 수
  // This release uses memory-only Firestore cache. A session never persists shared trip data.
});
