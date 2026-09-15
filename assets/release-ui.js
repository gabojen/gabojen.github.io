/* Release UI integration. No production data or credentials are stored here. */
'use strict';
const releaseState = {pending:0, failed:new Map(), lastFocus:null, aiConsent:false};
window.setSyncStatus = function(state, message) {
  const box=$('syncStatus'); if(!box)return;
  box.hidden=document.querySelector('.phone').dataset.screen==='login';
  box.dataset.state=state;
  box.innerHTML='<span class="sync-dot" aria-hidden="true"></span><span>'+esc(message)+'</span>'+
    (state==='error'?'<button onclick="reviewUnsaved()">저장하지 못한 내용 보기</button>':'');
};
function refreshConnection(){
  if(releaseState.failed.size){setSyncStatus('error','저장하지 못한 변경이 있어요');return;}
  setSyncStatus(navigator.onLine?'ready':'offline',navigator.onLine?'변경 내용이 함께 공유돼요':'연결이 끊겼어요 · 저장하려면 인터넷이 필요해요');
}
window.addEventListener('online',refreshConnection);window.addEventListener('offline',refreshConnection);
window.addEventListener('beforeunload',e=>{if(releaseState.pending||releaseState.failed.size){e.preventDefault();e.returnValue='';}});
window.showBootError=function(message){
  hideSplash();
  if(ME.uid){setSyncStatus('error','여행을 불러오지 못했어요. 연결 상태를 확인해 주세요.');return;}
  authError(message&& !/permission|Firebase|[a-z]+\//i.test(message)?message:'연결을 완료하지 못했어요. 인터넷을 확인한 뒤 다시 시도해 주세요.');
  if(!$('bootRetry'))$('authErr').insertAdjacentHTML('beforeend','<button id="bootRetry" class="btn ghost sm" onclick="location.reload()">다시 연결하기</button>');
};
setTimeout(()=>{if(!window.FB)showBootError();},12000);

function reviewUnsaved(){
  openSheet('<div class="grab"></div><h3>저장하지 못한 변경</h3><p class="muted small">다른 구성원이 수정했거나 연결이 끊겨 저장을 멈췄어요. 아래에서 입력한 내용을 내려받은 뒤 최신 일정을 확인할 수 있어요.</p><div class="draft-warning">이 페이지를 닫으면 아직 저장하지 못한 내용이 사라질 수 있어요.</div><button class="btn brand" style="margin-top:16px" onclick="exportUnsaved()">입력한 내용 내려받기</button><button class="btn ghost" style="margin-top:10px" onclick="retryUnsaved()">다시 저장하기</button><button class="lnk" onclick="dismissUnsaved()">변경을 버리고 최신 내용 보기</button>');
}
function downloadJSON(value,name){const u=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function exportUnsaved(){downloadJSON({exportedAt:new Date().toISOString(),drafts:[...releaseState.failed.values()].map(v=>v.local)},'여행가보젠-미저장-변경.json');}
async function retryUnsaved(){
  if(!window.FB)return;
  const entries=[...releaseState.failed.entries()];
  for(const [id,draft] of entries){try{await window.FB.retryTrip(draft);releaseState.failed.delete(id);}catch(e){toast(e.code==='travel/conflict'?'같은 항목의 수정이 충돌해요. 내용을 내려받고 최신 일정에 반영해 주세요.':'아직 저장하지 못했어요. 연결 상태를 확인해 주세요.');return;}}
  closeOv();refreshConnection();toast('변경 내용을 저장했어요');
}
function dismissUnsaved(){if(!confirm('저장하지 못한 변경을 버리고 서버에 저장된 내용으로 돌아갈까요?'))return;releaseState.failed.clear();closeOv();refreshConnection();window.FB.reloadTrips();}
function exportMyTrips(){downloadJSON({version:1,exportedAt:new Date().toISOString(),trips:TRIPS},'여행가보젠-여행백업.json');toast('일정과 사진 참조를 내려받았어요. 사진 파일은 여행책에서도 보관해 주세요.');}

const originalShow=show;
show=function(id,options){originalShow(id,options);const screen=$(id);screen.setAttribute('tabindex','-1');screen.setAttribute('role','main');screen.setAttribute('aria-label',id==='login'?'로그인':$('ptitle').textContent);document.querySelectorAll('.screen').forEach(x=>{if(x!==screen)x.removeAttribute('role');});refreshConnection();};

// Keep modal focus inside the active sheet, close with Escape, restore its trigger.
const oldAxOvIn=axOvIn;
axOvIn=function(){releaseState.lastFocus=$('ov').classList.contains('on')&&releaseState.lastFocus?releaseState.lastFocus:document.activeElement;oldAxOvIn();const c=$('ovc');c.setAttribute('role','dialog');c.setAttribute('aria-modal','true');c.setAttribute('tabindex','-1');const heading=c.querySelector('h3,b');if(heading){heading.id='dialogHeading';c.setAttribute('aria-labelledby','dialogHeading');}else c.setAttribute('aria-label','여행 정보');document.querySelectorAll('.phone>.screen,.phone>.topbar,.phone>.nav').forEach(x=>x.inert=true);requestAnimationFrame(()=>{if(c.isConnected)c.focus({preventScroll:true});});};
const oldCloseOv=closeOv;
closeOv=function(){oldCloseOv();document.querySelectorAll('.phone>.screen,.phone>.topbar,.phone>.nav').forEach(x=>x.inert=false);if(releaseState.lastFocus?.isConnected){releaseState.lastFocus.focus({preventScroll:true});releaseState.lastFocus=null;}};
document.addEventListener('keydown',e=>{
  if(!$('ov').classList.contains('on'))return;
  if(e.key==='Escape'){e.preventDefault();closeOv();return;}
  if(e.key!=='Tab')return;
  const nodes=[...$('ovc').querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select,textarea,[tabindex="0"]')].filter(x=>x.getClientRects().length);
  const first=nodes[0],last=nodes[nodes.length-1];
  if(!first){e.preventDefault();return;}
  if(e.shiftKey&&(document.activeElement===first||document.activeElement===$('ovc'))){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===$('ovc'))){e.preventDefault();first.focus();}
});
document.addEventListener('keydown',e=>{const t=e.target;if((e.key==='Enter'||e.key===' ')&&t.matches('[role=button]:not(button)')){e.preventDefault();t.click();}});
function enhanceAccessibility(){
  document.querySelectorAll('.screen.active [onclick]:not(button):not(a):not(input):not(select)').forEach(el=>{if(!el.closest('[onclick]')||el.matches('.ent,.card.trip,.fchip,.dseg,.crow,.gaprow,.mbtap')){el.setAttribute('role','button');el.tabIndex=0;}});
  document.querySelectorAll('.fld').forEach(label=>{if(label.tagName==='LABEL'&&!label.htmlFor){const input=label.nextElementSibling;if(input?.matches('input,select,textarea')&&input.id)label.htmlFor=input.id;}});
  document.querySelectorAll('input:not([aria-label]):not([type=checkbox]),textarea:not([aria-label])').forEach(input=>{if(input.placeholder&&!document.querySelector('label[for="'+input.id+'"]'))input.setAttribute('aria-label',input.placeholder);});
  document.querySelectorAll('svg.ic').forEach(x=>x.setAttribute('aria-hidden','true'));
}
let accessFrame=false;new MutationObserver(()=>{if(accessFrame)return;accessFrame=true;requestAnimationFrame(()=>{accessFrame=false;enhanceAccessibility();});}).observe(document.querySelector('.phone'),{childList:true,subtree:true});
enhanceAccessibility();

renderToday=function(){
  if(!TRIPS_READY&&!TRIPS.length){$('today').innerHTML=loadingCard();return;}
  const active=sortTrips(TRIPS.filter(t=>t.status!=='done'&&ddayOf(t)!=='종료'));
  if(!active.length){renderEmptyHome();return;}
  const t=active[0];curTrip=t.id;const next=nextItem(t), summary=tripSummary(t);
  const count=(t.days||[]).reduce((n,d)=>n+(d.items||[]).length,0);
  $('today').innerHTML=`<header class="page-lead"><span class="section-label">OUR NEXT JOURNEY</span><h2>우리, 어디로 떠날까요?</h2><p>${esc(ME.name)}님, 함께할 여행이 기다리고 있어요.</p></header>
    <section class="journey-feature" aria-label="다가오는 여행"><div class="journey-photo" style="background-image:${coverArt(t,{scenic:true})}"></div><div class="journey-content"><span class="badge">${summary.state==='now'?'지금 여행 중':ddayOf(t)} · ${memberCount(t)}명이 함께</span><h2>${esc(t.title)}</h2><p>${esc(t.place)} &nbsp; ${mdLabel(t.start)}–${mdLabel(t.end)}<br>${t.days.length}일의 여행 · ${count}개의 일정</p><button class="btn" onclick="openTrip('${TravelCore.jsText(t.id)}')">우리 일정 보기 ${svg('i-right','ic')}</button></div></section>
    <div class="home-actions"><button class="action-tile" onclick="openCreateTrip()">${svg('i-plus')}<span><b>새 여행 만들기</b><small>설레는 다음 계획</small></span></button><button class="action-tile" onclick="openShare()">${svg('i-users')}<span><b>함께할 사람 초대</b><small>일정을 함께 채워요</small></span></button><button class="action-tile" onclick="openPlanWizard()">${svg('i-spark')}<span><b>AI로 일정 짜기</b><small>빈 시간에 맞는 추천</small></span></button></div>
    <div class="home-columns"><section><div class="section-heading"><h3>다가오는 일정</h3><span class="muted small">${count}개 중</span></div><div class="next-card">${next?`<span class="next-date">${mdLabel(t.days[next.dayIdx].date)}(${dowOf(t.days[next.dayIdx].date)}) · ${esc(next.item.time)}</span><h4>${esc(next.item.title)}</h4><p>${svg('i-pin')} ${esc(next.item.place||'장소를 추가해 주세요')}</p><button class="btn ghost sm" onclick="openTripDay('${t.id}',${next.dayIdx})">이날의 일정 확인 ${svg('i-right')}</button>`:`<span class="next-date">아직 비어 있는 여행</span><h4>첫 일정을 담아볼까요?</h4><p>예약 문자부터 가고 싶은 장소까지 차근차근 모아보세요.</p><button class="btn ghost sm" onclick="openTrip('${t.id}');openAddChoice(0)">첫 일정 추가</button>`}</div></section>
    <section><div class="section-heading"><h3>여행 준비 한눈에</h3></div><div class="next-card"><span class="next-date">${memberCount(t)}명이 함께 만드는 여행</span><h4>예약도, 준비물도 한곳에</h4><p>일정에 예약을 담고, 필요한 준비를 함께 확인해요.</p><div class="ready-list">${['transport','stay','ticket'].map(c=>`<span>${CAT[c].name} ${(t.days||[]).reduce((n,d)=>n+d.items.filter(x=>x.cat===c).length,0)}</span>`).join('')}<span>준비물 ${(t.pack||[]).filter(p=>p.done).length}/${(t.pack||[]).length}</span></div><button class="btn ghost sm" onclick="openTrip('${t.id}')">여행 준비 확인 ${svg('i-right')}</button></div></section></div>
    ${active.length>1?`<div class="section-heading"><h3>다음 여행도 기다려요</h3><button class="lnk" onclick="switchTab('trips')">모두 보기</button></div><div class="trip-grid">${active.slice(1,3).map(x=>tripCard(x,false)).join('')}</div>`:''}`;
  afterRender();
};
const originalTrips=renderTrips;
renderTrips=function(){originalTrips();if(!TRIPS_READY)return;const box=$('trips');box.insertAdjacentHTML('afterbegin','<header class="page-lead"><span class="section-label">MY JOURNEYS</span><h2>함께 만들어갈 여행</h2><p>여행별 일정과 예약을 모아두었어요.</p></header>');const cards=[...box.querySelectorAll('.card.trip')];if(cards.length){const grid=document.createElement('div');grid.className='trip-grid';cards[0].before(grid);cards.forEach(x=>grid.append(x));}box.insertAdjacentHTML('beforeend','<button class="btn ghost" style="margin-top:14px" onclick="joinPrompt()">'+svg('i-key')+' 초대 링크로 참여하기</button>');};

async function copyText(text){
  try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return true;}}catch(_){}
  const input=document.createElement('textarea');input.value=text;input.style.cssText='position:fixed;top:0;opacity:0';document.body.append(input);input.focus();input.select();let ok=false;try{ok=document.execCommand('copy');}catch(_){}input.remove();return ok;
}
copyCode=async function(code){if(await copyText(code))toast('초대 링크를 복사했어요');else toast('복사하지 못했어요. 링크를 길게 눌러 복사해 주세요.');};
let activeInvite=null;
openShare=async function(){
  const t=trip(curTrip);if(!t)return;
  if(t.owner!==ME.uid){openSheet('<h3>함께할 사람 초대</h3><p class="muted small">새 구성원 초대는 여행을 만든 사람이 관리해요. 여행을 만든 분에게 초대 링크를 요청해 주세요.</p><button class="btn ghost" onclick="openMembers()">함께 가는 사람 보기</button>');return;}
  openSheet('<h3>함께할 사람 초대</h3><p class="muted small">링크를 열고 참여한 사람은 이 여행의 일정·의견·사진을 함께 보고 일정을 수정할 수 있어요.</p><div id="inviteContent">'+aiBusy('초대 링크를 준비하고 있어요')+'</div>');
  const inviteBox=$('inviteContent'),shareUid=ME.uid;
  try{const invite=await window.FB.createInvite(t.id);if(ME.uid!==shareUid||!sheetIsCurrent(inviteBox))return;activeInvite=invite;const out=inviteBox;const u=new URL('./',location.href);u.hash='invite='+activeInvite.token;activeInvite.url=u.href;out.innerHTML='<div class="invite-link" id="inviteText"></div><p class="muted small">'+esc(new Date(activeInvite.expiresAt).toLocaleString('ko-KR'))+'까지 유효해요. 신뢰하는 사람에게만 보내 주세요.</p><div class="invite-actions"><button class="btn brand" onclick="copyCode(activeInvite.url)">'+svg('i-copy')+' 초대 링크 복사</button><button class="btn ghost" onclick="shareInviteNative()">'+svg('i-share')+' 공유하기</button><button class="lnk" onclick="revokeInvite()">이 여행의 모든 초대 링크 중지</button></div>';$('inviteText').textContent=activeInvite.url;}catch(e){const out=$('inviteContent');if(out)out.innerHTML='<p class="draft-warning">초대 링크를 만들지 못했어요. 잠시 후 다시 시도해 주세요.</p>';}
};
async function shareInviteNative(){if(!activeInvite)return;try{if(navigator.share)await navigator.share({title:'여행가보젠 · 함께 여행해요',url:activeInvite.url});else await copyCode(activeInvite.url);}catch(e){if(e.name!=='AbortError')toast('공유하지 못했어요. 링크를 복사해 주세요.');}}
async function revokeInvite(){if(!activeInvite)return;try{await window.FB.revokeAllInvites(activeInvite.tripId);activeInvite=null;closeOv();toast('초대 링크 사용을 중지했어요');}catch(e){toast('중지하지 못했어요. 다시 시도해 주세요.');}}
function inviteToken(text){const raw=String(text||'').trim();try{const u=new URL(raw);return new URLSearchParams(u.hash.slice(1)).get('invite')||'';}catch(_){return raw.replace(/^#?invite=/,'');}}
joinPrompt=function(){let token=inviteToken(new URLSearchParams(location.hash.slice(1)).get('invite')||'');openSheet('<h3>초대받은 여행에 참여</h3><p class="muted small">받은 초대 링크 또는 코드를 붙여넣어 주세요. 참여하면 내 이름과 프로필이 구성원에게 표시되고 일정을 함께 수정할 수 있어요.</p><label class="fld" for="jCode">초대 링크 또는 코드</label><input class="input" id="jCode" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn brand" id="joinBtn" onclick="doJoin()">참여하기</button>');$('jCode').value=token;};
doJoin=async function(){if(!ME.verified){needVerify();return;}const code=inviteToken($('jCode').value);if(!/^[a-f0-9]{40}$/.test(code)){toast('초대 링크가 올바르지 않아요. 여행을 만든 분에게 새 링크를 요청해 주세요.');return;}const b=$('joinBtn');b.disabled=true;try{await window.FB.joinTrip(code);history.replaceState(null,'',location.pathname+location.search);closeOv();switchTab('trips');toast('여행에 참여했어요');}catch(e){toast('참여하지 못했어요. 링크가 만료되었거나 사용이 중지됐을 수 있어요.');b.disabled=false;}};
async function leaveCurrentTrip(){const t=trip(curTrip);if(!t||t.owner===ME.uid)return;if(!confirm('이 여행에서 나갈까요? 공유한 일정과 의견은 구성원에게 남습니다.'))return;try{await window.FB.leaveTrip(t.id);closeOv();curTrip=null;switchTab('trips');toast('여행에서 나왔어요');}catch(e){toast('나가지 못했어요. 다시 시도해 주세요.');}}
doDeleteTrip=async function(){const t=trip(curTrip);if(!t||t.owner!==ME.uid){toast('여행을 만든 사람만 삭제할 수 있어요.');return;}try{await window.FB.deleteTrip(t.id);closeOv();curTrip=null;switchTab('trips');toast('여행과 사진을 삭제했어요');}catch(e){toast('일부 내용을 삭제하지 못했어요. 다시 시도해 주세요.');}};

window.requestAIConsent=async function(kind){
  if(releaseState.aiConsent)return;
  return new Promise((resolve,reject)=>{const dialog=document.createElement('dialog');dialog.className='ai-dialog';dialog.innerHTML='<h3>AI와 함께 일정 만들기</h3><p>이 기능에 필요한 여행지·날짜·일정 또는 선택한 예약 문자·사진이 Google Gemini로 전송됩니다. 이름·연락처·예약번호 등 불필요한 정보는 먼저 가려 주세요.</p><p class="muted small">결과는 초안입니다. 운영시간, 휴무, 가격과 예약 가능 여부는 방문 전 확인해 주세요.</p><button class="btn brand" data-yes>확인하고 계속</button><button class="btn ghost" data-no>취소</button>';document.body.append(dialog);const finish=ok=>{releaseState.cancelAIConsent=null;dialog.close();dialog.remove();if(ok){releaseState.aiConsent=true;resolve();}else reject(Object.assign(new Error('AI 요청을 취소했어요.'),{code:'travel/cancelled'}));};releaseState.cancelAIConsent=()=>finish(false);dialog.querySelector('[data-yes]').onclick=()=>finish(true);dialog.querySelector('[data-no]').onclick=()=>finish(false);dialog.addEventListener('cancel',e=>{e.preventDefault();finish(false);});dialog.showModal();});
};
const originalGo=renderGo;
renderGo=function(){originalGo();if(NEWS){const current=todayStr().slice(0,7),month=String(NEWS.month||'').slice(0,7);if(month&&month<current)$('go').insertAdjacentHTML('afterbegin','<div class="news-stale">'+esc(month)+'에 수집한 여행 정보예요. 최신 운영 여부는 주최 측에서 확인해 주세요.</div>');}};
const originalAuthed=window.onAuthed;
window.onAuthed=function(user,profile){originalAuthed(user,profile);if(location.hash.startsWith('#invite='))setTimeout(()=>{if(ME.uid===user.uid)joinPrompt();},700);};
const originalSignedOut=window.onSignedOut;
window.onSignedOut=function(){releaseState.cancelAIConsent?.();closeOv();closeIntro();activeInvite=null;window.__editTripDraft=null;window.__editorialPlace=null;releaseState.aiConsent=false;releaseState.failed.clear();releaseState.pending=0;IS_ADMIN=false;watchingTrip=null;window.__aiDebug=null;window.__lastFile=null;window.__admMembers=null;window.__admLeaves=null;window.__invalidTrips=[];window.__dupPlan=null;window.__dupOne=null;window.__tripSeed=null;parsed=null;ocrGuess=[];ocrPlaces=[];gapCtx=null;newPhoto=null;albumTrip=null;memTripId=null;reportItemId=null;Object.keys(geoCache).forEach(k=>delete geoCache[k]);mapSeq++;window.__plans=null;window.__gapList=null;window.__planTripId=null;applyDraft={school:'',grade:'',cls:'',no:'',name:''};reportDraft={name:'',did:'',learned:'',felt:'',fact:'',captions:[]};originalSignedOut();$('ovc').replaceChildren();$('printBook')?.remove();document.querySelectorAll('.screen:not(#login)').forEach(x=>x.innerHTML='');};

// Serialize repeat taps on mutation buttons, including taps before server acknowledgement.
for(const name of ['saveProfile','saveCreateTrip','saveAddItem','saveEditItem','savePropose','addComment','doDelItem','delProp','savePlan','commitPlan','doJoin','doDeleteTrip','delItemPhoto','delMemPhoto']){
  const original=window[name];let busy=false;
  window[name]=async function(...args){if(busy)return;busy=true;const button=document.activeElement?.tagName==='BUTTON'?document.activeElement:null;if(button)button.disabled=true;try{return await original(...args);}finally{busy=false;if(button?.isConnected)button.disabled=false;}};
}
aiErrCard=function(e,title,retryFn){const cancelled=e?.code==='travel/cancelled';return '<div class="card"><h4>'+esc(cancelled?'요청을 취소했어요':title||'추천을 불러오지 못했어요')+'</h4><p class="muted small">'+esc(cancelled?'다시 필요할 때 시작해 주세요.':'잠시 후 다시 시도해 주세요. 일정을 직접 추가할 수도 있어요.')+'</p><button class="btn ghost sm" onclick="'+esc(retryFn)+'">다시 시도</button></div>';};
aiFailReason=function(message,title){const text=String(message||'');if(/취소/.test(text))return {t:'요청을 취소했어요',d:'필요할 때 다시 시작해 주세요.'};if(/quota|429|rate|exhaust/i.test(text))return {t:'AI 요청이 잠시 많아요',d:'잠시 후 다시 시도하거나 일정을 직접 입력해 주세요.'};if(/network|fetch|offline/i.test(text))return {t:'인터넷 연결을 확인해 주세요',d:'연결한 뒤 다시 시도할 수 있어요.'};return {t:title||'AI가 내용을 정리하지 못했어요',d:'잠시 후 다시 시도해 주세요. 계속되면 문의 · 신고로 알려 주세요.'};};
mapDiagText=function(){return '지도를 불러오지 못했어요. 카카오맵에서 장소를 확인해 주세요.';};
function supportLink(){
  const email=String(GABOJEN_RELEASE.supportEmail||'').trim();
  return /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(email)?'mailto:'+encodeURIComponent(email)+'?subject='+encodeURIComponent('[여행가보젠] 문의'):'';
}
function openSupport(){
  const href=supportLink();
  openSheet('<div class="grab"></div><h3>문의 · 신고</h3><p class="muted small">서비스 이용 문의, 오류 신고, 개인정보 요청과 이용 제한에 대한 이의제기를 접수합니다.</p><div class="card"><b>운영자 '+esc(GABOJEN_RELEASE.operatorName)+'</b><p style="overflow-wrap:anywhere">'+esc(GABOJEN_RELEASE.supportEmail)+'</p></div>'+(href?'<a class="btn brand" href="'+esc(href)+'">이메일 앱에서 문의하기</a>':'')+'<button class="btn ghost" style="margin-top:10px" onclick="copyCode(GABOJEN_RELEASE.supportEmail)">이메일 주소 복사</button><p class="muted small" style="margin-top:14px">문제가 발생한 화면과 상황을 알려 주세요. 비밀번호나 예약번호 전체는 보내지 마세요. 이메일 앱이 열리지 않으면 주소를 복사해 사용해 주세요.</p><button class="lnk" onclick="openPrivacy()">개인정보 처리방침</button>');
}
const policyBody=(title,html)=>openModal('<h3>'+title+'</h3><div class="policy"><p class="pd">개정안 · '+esc(GABOJEN_RELEASE.policyVersion)+'</p>'+html+'</div><button class="btn ghost" style="margin-top:16px" onclick="closeOv()">닫기</button>');
openTerms=function(){policyBody('이용약관',`
  <h4>1. 서비스와 계정</h4><p>여행가보젠은 함께 여행하는 구성원이 일정·예약·의견·사진을 공유하고 여행책을 만드는 서비스입니다. 계정 가입은 만 14세 이상을 대상으로 합니다. 계정은 본인이 관리하며 다른 사람의 계정을 사용할 수 없습니다.</p>
  <h4>2. 공유 범위와 권한</h4><p>참여한 구성원은 해당 여행의 일정과 사진을 열람하고 공동 일정을 편집할 수 있습니다. 새 구성원 초대와 여행 전체 삭제는 여행을 만든 사람이 관리합니다. 초대 링크는 전달될 수 있으므로 신뢰하는 사람에게만 공유해 주세요.</p>
  <h4>3. 게시물과 금지행위</h4><p>게시물의 권리는 작성자에게 있습니다. 타인의 개인정보·사진을 허락 없이 게시하거나, 저작권을 침해하거나, 구성원을 괴롭히거나, 악성 코드·허위 예약 정보를 올리는 행위는 금지됩니다. 서비스를 제공하는 데 필요한 범위에서 게시물을 저장하고 구성원에게 표시합니다.</p>
  <h4>4. 이용 제한과 이의제기</h4><p>위반 내용과 정도에 따라 게시물 삭제 또는 이용 제한이 적용될 수 있습니다. 긴급한 보안 위협·명백한 불법 정보는 우선 제한 후 안내할 수 있습니다. 조치 사유와 이의제기 방법을 알리고, 접수된 소명 자료를 확인한 뒤 결과를 안내합니다. 문의·신고·이의제기는 아래 이메일로 접수해 주세요. 사실 확인이 필요한 경우 관련 자료를 요청할 수 있습니다.</p>
  <h4>5. AI·여행 정보</h4><p>AI 일정과 장소 추천은 검토가 필요한 초안이며 예약 완료나 운영 여부를 보장하지 않습니다. 교통·숙박·입장권의 실제 이용 조건, 영업시간·휴무·요금은 제공처에서 확인해 주세요. 학교 서류의 제출 기한과 양식은 각 학교 기준을 따릅니다.</p>
  <h4>6. 탈퇴와 자료 보관</h4><p>탈퇴 시 본인이 만든 여행과 해당 여행의 사진이 함께 삭제됩니다. 다른 사람이 만든 여행의 공유 일정은 남을 수 있습니다. 작성자를 식별할 수 있는 자료와 오래된 사진의 처리 범위는 개인정보 처리방침을 확인해 주세요. 중요한 자료는 탈퇴 전에 내려받아 주세요.</p>
  <h4>7. 서비스 변경</h4><p>중요한 변경이나 종료는 사전에 안내하고 필요한 자료를 보관할 기회를 제공합니다. 책임의 범위는 관련 법령을 따릅니다.</p>
  <h4>8. 운영자·문의</h4><p>${GABOJEN_RELEASE.operatorName?esc(GABOJEN_RELEASE.operatorName):'공개 출시 전 운영자 정보 확정 예정'}<br>${GABOJEN_RELEASE.supportEmail?esc(GABOJEN_RELEASE.supportEmail):'문의·신고·이의제기 연락처는 공개 출시 전에 안내합니다.'}</p>
  <p class="pd">표지 사진: Unsplash · 아이콘: Lucide (ISC) · 애니메이션: anime.js (MIT). 새 브랜드 마크는 이 앱을 위해 제작했습니다.</p>`);};
openPrivacy=function(){policyBody('개인정보 처리방침',`
  <h4>1. 처리 항목과 목적</h4><table class="ptbl"><tr><th>계정</th><td>이메일·이름 또는 닉네임·인증 정보: 가입, 로그인, 구성원 구분</td></tr><tr><th>선택 정보</th><td>프로필 사진·여행 일정·예약·의견·사진: 여행 공유와 기록</td></tr><tr><th>운영 정보</th><td>가입일·마지막 접속일·약관 확인 기록: 계정 운영</td></tr><tr><th>기기 보관</th><td>화면 설정·AI 결과·학교 서류 입력 정보: 입력 내용 유지</td></tr></table>
  <h4>2. 구성원에게 공개되는 범위</h4><p>여행에 참여하면 이름·프로필과 여행에 올린 일정·사진·의견을 구성원이 볼 수 있습니다. 예약번호·학생 정보·연락처 등은 공유가 필요한 범위만 입력해 주세요. 이미 다른 구성원이 내려받은 자료는 서비스에서 회수할 수 없습니다.</p>
  <h4>3. 처리위탁·국외 이전</h4><p>인증 및 여행 데이터 보관에 Google Firebase, AI 요청에 Google Gemini를 사용합니다. Firebase Authentication의 인증 정보는 미국에서 처리되며, 여행·사진 데이터베이스는 서울에 있습니다. Google은 인증 정보 삭제 요청 후 운영·백업 시스템에서 제거하는 데 최대 180일이 걸릴 수 있다고 안내합니다. 서비스별 국외 이전 항목·방법·보유 기간과 적용 근거에 대한 최종 고지는 출시 전 검토 중입니다. 현재 확인된 보관 지역: ${esc(GABOJEN_RELEASE.privacyRegion||'운영 설정 확인 중')}.</p>
  <h4>4. AI 사용</h4><p>AI 기능을 사용할 때 해당 기능에 필요한 여행지·일정 또는 선택한 예약 문자·사진·작성 문장을 Google Gemini에 전송합니다. 사진·원문에는 개인정보가 포함될 수 있으므로 불필요한 부분을 먼저 가려 주세요. 현재 프로젝트는 무료 AI 요금제입니다. 제공사 조건상 무료 AI 입력·출력은 제품 개선과 검토에 사용될 수 있으며 개인정보를 전송하면 안 됩니다. 이 조건에 맞는 AI 제공 방식은 정식 출시 전에 확정합니다.</p>
  <h4>5. 기기에 보관하는 정보</h4><p>학교 서류 입력 정보와 AI 결과는 브라우저에 저장됩니다. AI 결과는 계정별로 구분하고 24시간이 지난 결과는 사용하지 않습니다. 로그아웃 시 AI·학생 정보 저장값을 지웁니다. 이 버전은 공유 여행의 데이터베이스를 기기에 영구 보관하지 않습니다. 예전 버전의 기기 캐시는 다른 탭을 닫고 브라우저 사이트 데이터를 삭제해 정리할 수 있습니다.</p>
  <h4>6. 보유·삭제와 권리</h4><p>계정·프로필은 탈퇴 시 삭제합니다. 본인이 만든 여행과 그 사진도 삭제합니다. 다른 여행에 남은 구형 데이터는 작성자 식별 방식에 따라 추가 확인이 필요할 수 있습니다. 법정 보관 의무 또는 분쟁 대응이 필요한 예외와 보관 기간은 별도 확정하여 고지합니다. 조회·정정·삭제·처리정지 요청은 아래 담당자에게 접수할 수 있습니다.</p>
  <h4>7. 아동과 사진</h4><p>만 14세 미만 아동의 직접 가입은 제공하지 않습니다. 보호자가 자녀의 사진이나 학교 서류를 입력하는 경우에도 불필요한 정보는 제외해 주세요. 법정대리인 동의가 필요한 처리에 대한 확인 절차는 공개 출시 전 별도로 점검합니다.</p>
  <h4>8. 안전조치와 담당자</h4><p>인증, 여행 구성원 접근 규칙, 전송 구간 암호화, 기기 저장 최소화를 적용합니다. 외부 서비스별 보안 설정은 운영 과정에서 점검합니다.</p><p>운영자: ${esc(GABOJEN_RELEASE.operatorName||'공개 출시 전 확정 예정')}<br>개인정보 담당자: ${esc(GABOJEN_RELEASE.privacyContact||'공개 출시 전 확정 예정')}<br>문의: ${esc(GABOJEN_RELEASE.supportEmail||'공개 출시 전 확정 예정')}</p>
  <button class="btn ghost sm" onclick="openSupport()">개인정보 관련 문의</button><button class="btn ghost sm" style="margin-top:10px" onclick="clearLocalData()">기기에 저장된 입력 정보 지우기</button>`);};
if('serviceWorker' in navigator&&location.protocol!=='file:'&&!location.pathname.endsWith('/preview.html')){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}
const monthlyGo=renderGo;
renderGo=function(){
  if(NEWS?.kind!=='editorial'){monthlyGo();return;}
  const regions=['전체',...new Set(NEWS.places.map(p=>p.region))],selected=goRegion&&regions.includes(goRegion)?goRegion:'전체';
  const places=NEWS.places.filter(p=>selected==='전체'||p.region===selected);
  $('go').innerHTML=`<header class="page-lead"><span class="section-label">FIND YOUR NEXT JOURNEY</span><h2>${esc(NEWS.title)}</h2><p>${esc(NEWS.lead)}</p></header><div class="rchips">${regions.map(r=>`<button class="rchip${selected===r?' on':''}" onclick="goPick('${TravelCore.jsText(r)}')">${esc(r)}</button>`).join('')}</div><div class="discovery-grid">${places.map(p=>`<button class="discovery-card" onclick="openEditorial('${TravelCore.jsText(p.id)}')"><div class="discovery-image" style="background-image:url('${TravelCore.safeImage(p.image)}')"><span>${esc(p.region)}</span></div><div class="discovery-copy"><small>${esc(p.tag)}</small><h3>${esc(p.title)}</h3><p>${esc(p.description)}</p><span class="discovery-more">여행 아이디어 보기 ${svg('i-right')}</span></div></button>`).join('')}</div><p class="muted small" style="margin-top:20px">공식 관광 안내를 참고한 기본 여행 아이디어예요. 운영시간·입장 조건은 방문 전 공식 안내를 확인해 주세요. 카드 사진은 여행 분위기를 보여주는 이미지로 실제 장소와 다를 수 있어요.</p>`;
};
function openEditorial(id){const p=NEWS?.places?.find(p=>p.id===id);if(!p)return;window.__editorialPlace=p;openSheet(`<h3>${esc(p.title)}</h3><p class="muted small">${esc(p.description)}</p><div class="ready-list"><span>${esc(p.region)}</span><span>${esc(p.tag)}</span></div><button class="btn brand" style="margin-top:20px" onclick="createFromEditorial()">${svg('i-plus')} 이곳으로 여행 만들기</button>${trip(curTrip)?`<button class="btn ghost" style="margin-top:10px" onclick="addEditorialToTrip()">${svg('i-pin')} 내 여행 일정에 담기</button>`:''}<button class="btn ghost" style="margin-top:10px" onclick="openExt('${TravelCore.jsText(p.url)}')">${svg('i-ext')} 공식 관광 안내 확인</button><p class="muted small" style="margin-top:15px">출처: ${esc(p.source)}${p.sourceDate?' · '+esc(p.sourceDate)+' 발행':''}<br>현재 운영시간·요금·통제 구간은 공식 안내에서 확인해 주세요.</p>`);}
function createFromEditorial(){const p=window.__editorialPlace;if(!p)return;window.__tripSeed={title:p.title+' 여행',place:p.region+' · '+p.title,start:todayStr(),end:todayStr()};openCreateTrip();}
function addEditorialToTrip(){const p=window.__editorialPlace;if(!p||!trip(curTrip))return;openAddItem(0);$('aTitle').value=p.title;$('aPlace').value=p.title;$('aSub').value='여행 아이디어 · 방문 전 운영정보 확인';}
const previousRenderTrips=renderTrips;
renderTrips=function(){previousRenderTrips();const invalid=window.__invalidTrips||[];if(invalid.length)$('trips').insertAdjacentHTML('afterbegin','<div class="draft-warning">기존 여행 '+invalid.length+'건은 데이터 형식을 확인해야 해요. 원본 내용을 내려받아 확인할 수 있습니다.<button class="lnk" onclick="downloadJSON(window.__invalidTrips,\'여행가보젠-형식확인.json\')">해당 여행 내려받기</button></div>');};
const oldClearLocal=clearLocalData;
clearLocalData=function(){oldClearLocal();applyDraft={school:'',grade:'',cls:'',no:'',name:''};window.__plans=null;window.__gapList=null;window.__planTripId=null;};
addEditorialToTrip=function(){
  const choices=sortTrips(TRIPS.filter(t=>t.status!=='done'&&ddayOf(t)!=='종료'));
  if(!choices.length){toast('먼저 새 여행을 만들어 주세요.');return;}
  const selected=choices.some(t=>t.id===curTrip)?curTrip:choices[0].id;
  openSheet('<h3>어느 여행에 담을까요?</h3><label class="fld" for="editorialTrip">여행</label><select class="input" id="editorialTrip" onchange="editorialDays()">'+choices.map(t=>'<option value="'+t.id+'" '+(t.id===selected?'selected':'')+'>'+esc(t.title)+'</option>').join('')+'</select><label class="fld" for="editorialDay">날짜</label><select class="input" id="editorialDay"></select><button class="btn brand" onclick="confirmEditorialDestination()">이 날짜에 일정 입력하기</button>');editorialDays();
};
function editorialDays(){const t=trip($('editorialTrip').value);$('editorialDay').innerHTML=t.days.map((d,i)=>'<option value="'+i+'">'+esc(d.date)+' · DAY '+(i+1)+'</option>').join('');}
function confirmEditorialDestination(){const p=window.__editorialPlace,t=trip($('editorialTrip').value),idx=Number($('editorialDay').value);if(!p||!t)return;openTrip(t.id);openAddItem(idx);$('aCat').value='plan';$('aTitle').value=p.title;$('aPlace').value=p.title;$('aSub').value='여행 아이디어 · 방문 전 운영정보 확인';}
