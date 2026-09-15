/* Public settings only. Never put a Gemini/server secret in this file.
   Fill the operator fields and verify the deployed rules before release. */
window.GABOJEN_RELEASE = Object.freeze({
  version: '12.0.0-rc.3',
  aiModel: 'gemini-3.1-flash-lite',
  supportEmail: 'aznail@hanmail.net',
  operatorName: '김광석',
  privacyRegion: 'Firestore 여행·사진 데이터: 대한민국 서울(asia-northeast3). 인증·AI 처리 지역과 이전 조건은 서비스별로 구분합니다.',
  privacyContact: 'aznail@hanmail.net',
  policyVersion: '2026-09-15',
  // This release uses memory-only Firestore cache. A session never persists shared trip data.
});
