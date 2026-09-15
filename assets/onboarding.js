/* Scoped replacement keeps older cached entry pages compatible during deployment. */
(function () {
/* Public, illustrative content only. Opening this guide never reads or saves a trip. */
function introExampleDates(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  // Use a weekend at least seven days ahead, including across month/year boundaries.
  start.setDate(start.getDate() + 7 + (6 - start.getDay() + 7) % 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const short = d => `${d.getMonth() + 1}/${d.getDate()}`;
  const day = d => `${short(d)}(${'일월화수목금토'[d.getDay()]})`;
  return { start: day(start), end: day(end), range: `${short(start)}–${short(end)}`, year: start.getFullYear() };
}

function introExampleRow(icon, time, title, detail = '') {
  return `<div class="intro-row"><span class="intro-row-icon">${svg(icon)}</span>
    <div><small>${esc(time)}</small><strong>${esc(title)}</strong>${detail ? `<span>${esc(detail)}</span>` : ''}</div></div>`;
}
function introTripVisual(dates) {
  return `<div class="intro-card">
    <div class="intro-cover" style="background-image:${brandCover()}"><span>함께 떠나는 제주</span><strong>우리의 제주 여행</strong><small>${dates.year} · ${dates.range} · 1박 2일</small></div>
    <div class="intro-day">DAY 1 <span>${dates.start}</span></div>
    ${introExampleRow('i-plane', '09:30', '제주행 항공편')}
    ${introExampleRow('i-bed', '15:00', '숙소 체크인')}
    ${introExampleRow('i-pin', '17:30', '바닷길 산책')}
    <div class="intro-tags"><span>${svg('i-check')} 준비물</span><span>${svg('i-ticket')} 이용권</span><span>${svg('i-clock')} 시간순 일정</span></div>
  </div>`;
}
function introShareVisual() {
  return `<div class="intro-card intro-share-card">
    <div class="intro-card-title">${svg('i-users')} 우리의 제주 여행 <span>구성원 3명</span></div>
    <div class="intro-people"><span>나</span><span>친구</span><span>가족</span><p>초대 링크로 함께해요</p></div>
    <div class="intro-contribution"><span class="intro-avatar">친구</span><div><strong>오후 일정에 바닷길 산책을 추가했어요</strong><small>함께 편집하는 일정</small></div></div>
    <div class="intro-contribution"><span class="intro-avatar alt">가족</span><div><strong>저녁은 여기 어때요?</strong><small>장소를 제안하고 의견 남기기</small></div></div>
    <div class="intro-note-band">${svg('i-lock')} 여행에 참여한 구성원과 공유해요</div>
  </div>`;
}
function introAiVisual() {
  return `<div class="intro-card intro-ai-card">
    <div class="intro-card-title">${svg('i-compass')} 어디로 떠나볼까요?</div>
    <div class="intro-ideas"><span>${svg('i-wave')} 바다</span><span>${svg('i-tree')} 자연</span><span>${svg('i-city')} 도시</span></div>
    <div class="intro-divider">여행 아이디어를 고른 다음</div>
    <div class="intro-card-title">${svg('i-spark')} AI로 일정 짜기</div>
    <div class="intro-tags"><span>여유롭게</span><span>자연 위주</span><span>렌터카</span></div>
    <div class="intro-options"><div><small>제안 A</small><strong>바다 따라 천천히</strong><span>해변 산책 · 카페</span></div><div><small>제안 B</small><strong>숲에서 쉬어가기</strong><span>숲길 · 전망대</span></div></div>
    <div class="intro-note-band">${svg('i-check')} 제안을 확인하고 일정에 추가해요</div>
  </div>`;
}
function introBookingVisual(dates) {
  return `<div class="intro-card">
    <div class="intro-message"><small>예약 문자 예시</small><p>[숙소 예약 안내]<br>${dates.start} 체크인 15:00<br>${dates.end} 체크아웃 11:00<br>제주 · 바다 곁 숙소</p></div>
    <div class="intro-divider">${svg('i-spark')} 필요한 정보를 골라 정리</div>
    ${introExampleRow('i-bed', `${dates.start} · 15:00`, '바다 곁 숙소 체크인', '장소와 날짜를 확인한 뒤 추가')}
    <div class="intro-note-band">${svg('i-edit')} 잘못 읽은 내용은 직접 고칠 수 있어요</div>
  </div>`;
}
function introMemoryVisual() {
  return `<div class="intro-card intro-memory-card">
    <div class="intro-book-cover" style="background-image:${brandCover()}"><span>OUR TRAVEL NOTES</span><strong>우리의 제주 여행</strong><small>1박 2일의 순간들</small></div>
    <div class="intro-memory-caption"><span>${svg('i-camera')} 함께 남긴 사진</span><span>${svg('i-pin')} 다녀온 장소</span></div>
    <div class="intro-memory-note">“같이 걸어서 더 좋았던 길.”<small>사진과 기록을 한 권의 여행책으로</small></div>
  </div>`;
}
const INTRO = [
  { label: '일정 한눈에', title: '여행에 필요한 것을 한곳에',
    body: '항공편과 숙소부터 갈 곳, 준비물까지. 날짜별 일정에서 필요한 정보를 바로 확인해요.',
    hint: '내 여행 → 여행 선택 → 일정', visual: introTripVisual },
  { label: '함께 계획하기', title: '같이 가는 사람과, 같이 짜요',
    body: '초대 링크로 구성원을 모으고, 함께 일정을 추가·수정해요. 가고 싶은 곳을 제안하고 의견도 남겨요.',
    hint: '여행 메뉴 → 멤버 초대', visual: introShareVisual },
  { label: '추천과 AI', title: '막막한 계획에는 아이디어를',
    body: '여행 추천에서 갈 곳을 찾고, 여행 안에서 AI로 일정을 짜 보세요. 취향에 맞춘 제안 중 골라 담을 수 있어요.',
    hint: '여행 추천 · 여행 안의 AI로 일정 짜기',
    note: 'AI 제안의 운영시간·이동시간·예약 가능 여부는 확인해 주세요.', visual: introAiVisual },
  { label: '예약 정리', title: '예약 정보도 일정 속으로',
    body: '예약 문자나 사진에서 날짜·시간·장소를 정리해요. 읽어온 내용을 확인하고 일정에 추가하세요.',
    hint: '일정 추가 → 예약 문자 붙여넣기 · 사진으로 추가',
    note: 'AI에 전달할 문자·사진에서 이름·연락처·예약번호는 먼저 가려 주세요.', visual: introBookingVisual },
  { label: '추억 기록', title: '다녀온 여행은 오래 기억해요',
    body: '함께 찍은 사진과 다녀온 장소, 남긴 기록을 모아 보세요. 추억에서 우리만의 여행책을 다시 펼칠 수 있어요.',
    hint: '추억 → 지난 여행 선택', visual: introMemoryVisual },
];

let introPage = 0;
let introReturnFocus = null;
let introDates = null;
function introSeen() {
  try { return localStorage.getItem('gbj_intro_' + (ME.uid || 'guest')) === '1'; } catch (_) { return true; }
}
function markIntroSeen() {
  try { localStorage.setItem('gbj_intro_' + (ME.uid || 'guest'), '1'); } catch (_) {}
}
function openIntro(explicit = false) {
  if (!explicit && (!ME.uid || location.hash.startsWith('#invite='))) return;
  closeIntro();
  introReturnFocus = document.activeElement;
  introDates = introExampleDates();
  introPage = 0;
  const dialog = document.createElement('dialog');
  dialog.id = 'intro';
  dialog.className = 'service-intro';
  dialog.setAttribute('aria-labelledby', 'introDialogTitle');
  dialog.innerHTML = `<div class="intro-shell">
    <header class="intro-header"><div><img src="assets/brand.svg" alt="" width="30" height="30"><span id="introDialogTitle">서비스 둘러보기</span></div><button class="intro-close" onclick="closeIntro(true)" aria-label="둘러보기 닫기">${svg('i-x')}</button></header>
    <div class="intro-progress" aria-hidden="true">${INTRO.map(() => '<i></i>').join('')}</div>
    <p class="intro-live sr-only" id="introStatus" role="status" aria-live="polite" aria-atomic="true"></p>
    <section class="intro-content" id="introContent" aria-labelledby="introTitle"></section>
    <footer class="intro-footer"><p id="introFootnote">옆으로 넘기거나 다음을 눌러 주세요</p><div class="intro-actions"><button class="btn ghost" id="introPrev" onclick="introPrevious()">${svg('i-left')} 이전</button><button class="btn brand" id="introBtn" onclick="introNext()">다음 ${svg('i-right')}</button></div></footer>
  </div>`;
  document.body.appendChild(dialog);
  introPaint();
  dialog.addEventListener('cancel', e => { e.preventDefault(); closeIntro(true); });
  dialog.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      const buttons = [...dialog.querySelectorAll('button:not(:disabled)')];
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault(); introGo(introPage + (e.key === 'ArrowRight' ? 1 : -1));
    }
  });
  setupIntroSwipe($('introContent'));
  dialog.showModal();
  $('introTitle').focus({ preventScroll: true });
}
function introPaint() {
  const page = INTRO[introPage], last = introPage === INTRO.length - 1;
  $('introContent').innerHTML = `<div class="intro-eyebrow"><span>${esc(page.label)}</span><span>${introPage + 1} / ${INTRO.length}</span></div>
    <h2 id="introTitle" tabindex="-1">${esc(page.title)}</h2><p class="intro-description">${esc(page.body)}</p>
    <figure class="intro-example">${page.visual(introDates)}<figcaption>기능 이해를 돕는 예시 화면입니다</figcaption></figure>
    <p class="intro-path">${svg('i-right')} ${esc(page.hint)}</p>${page.note ? `<p class="intro-caution">${esc(page.note)}</p>` : ''}`;
  $('introContent').scrollTop = 0;
  document.querySelectorAll('#intro .intro-progress i').forEach((bar, i) => bar.classList.toggle('on', i <= introPage));
  $('introStatus').textContent = `${introPage + 1} / ${INTRO.length}. ${page.title}`;
  // Keep the back control focusable at the boundary so repeated keyboard navigation is stable.
  $('introPrev').setAttribute('aria-disabled', String(introPage === 0));
  $('introBtn').innerHTML = last ? (ME.uid ? '내 여행으로' : '로그인하고 시작하기') : `다음 ${svg('i-right')}`;
  $('introFootnote').textContent = last ? (ME.uid ? '이제 우리 여행을 이어서 만들어 볼까요?' : '계정이 없다면 로그인 화면에서 회원가입할 수 있어요') : '옆으로 넘기거나 다음을 눌러 주세요';
  document.querySelectorAll('#intro svg').forEach(icon => { icon.setAttribute('aria-hidden', 'true'); icon.setAttribute('focusable', 'false'); });
}
function introGo(page) {
  const next = Math.max(0, Math.min(INTRO.length - 1, page));
  if (!$('intro') || next === introPage) return;
  const focusInContent = $('introContent').contains(document.activeElement);
  introPage = next;
  introPaint();
  if (focusInContent) $('introTitle').focus({ preventScroll: true });
}
function introNext() {
  if (introPage < INTRO.length - 1) { introGo(introPage + 1); return; }
  const signedIn = !!ME.uid;
  closeIntro(true);
  if (signedIn) switchTab('trips');
  else { authMode('login'); $('aEmail')?.focus(); }
}
function closeIntro(seen = false) {
  const dialog = $('intro');
  if (!dialog) return;
  dialog.close();
  dialog.remove();
  if (seen) markIntroSeen();
  if (introReturnFocus?.isConnected) introReturnFocus.focus({ preventScroll: true });
  introReturnFocus = null;
}
function setupIntroSwipe(content) {
  let start = null;
  content.addEventListener('touchstart', e => {
    start = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }, { passive: true });
  content.addEventListener('touchend', e => {
    if (!start || !e.changedTouches.length) return;
    const dx = e.changedTouches[0].clientX - start.x, dy = e.changedTouches[0].clientY - start.y;
    start = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) introGo(introPage + (dx < 0 ? 1 : -1));
  }, { passive: true });
  content.addEventListener('touchcancel', () => { start = null; }, { passive: true });
}

Object.assign(window, { openIntro, closeIntro, introNext, introGo, introPrevious: () => introGo(introPage - 1) });
})();
