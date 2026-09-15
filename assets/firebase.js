
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
         signOut, onAuthStateChanged, updateProfile, sendPasswordResetEmail,
         sendEmailVerification, deleteUser, reauthenticateWithCredential, EmailAuthProvider }
  from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore, initializeFirestore, memoryLocalCache, clearIndexedDbPersistence, runTransaction, Timestamp,
         collection, doc, setDoc, deleteDoc, getDoc, updateDoc,
         query, where, onSnapshot, arrayUnion, addDoc, getDocs, writeBatch,
         increment, serverTimestamp, orderBy, limit }
  from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken as getAppCheckToken }
  from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app-check.js";
import { getAI, getGenerativeModel, GoogleAIBackend }
  from "https://www.gstatic.com/firebasejs/12.4.0/firebase-ai.js";
/* 사진 원본 보관소 — 켜져 있으면 쓰고, 안 켜져 있으면 조용히 예전 방식으로 돌아갑니다 */
import { getStorage, ref as sRef, uploadBytes, getDownloadURL, deleteObject }
  from "https://www.gstatic.com/firebasejs/12.4.0/firebase-storage.js";

// ▼▼▼ 내 Firebase 프로젝트 설정 (김광석님 프로젝트) ▼▼▼
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDvV3dkWDbn0xQ8raeJX0XccCcMoGZOLZ8",
  authDomain: "happytravel-11758.firebaseapp.com",
  projectId: "happytravel-11758",
  storageBucket: "happytravel-11758.firebasestorage.app",
  messagingSenderId: "578326919483",
  appId: "1:578326919483:web:fc5f6b4060074089a19f1e"
};
// ▲▲▲ 여기까지 ▲▲▲

// AI credentials are held by Firebase AI Logic.
const app = initializeApp(FIREBASE_CONFIG);

/* ── App Check: "진짜 우리 앱에서 온 요청"임을 증명 ──
   아래 사이트 키는 공개돼도 되는 값입니다. (비밀 키는 Firebase 콘솔에만 보관) */
const RECAPTCHA_SITE_KEY = "6LeaAngtAAAAAAv5A5YkjUijOHl-QWRwLLMcdAC_";
/* 초기화 결과를 담아 둡니다 — 실패해도 앱은 계속 돌지만,
   AI 호출만 401로 막히므로 원인을 알 수 있어야 합니다. */
let appCheckInst=null, appCheckErr=null;
try{
  appCheckInst=initializeAppCheck(app,{
    provider:new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled:true
  });
}catch(e){ appCheckErr=e; console.warn('[여행가보젠] App Check 초기화 실패:',e); }
const auth = getAuth(app);
/* Shared travel data stays in memory for this session. */
const db = initializeFirestore(app, { localCache: memoryLocalCache() });
// Best effort cleanup of the cache created by older releases. It is never read by this release.
clearIndexedDbPersistence(db).catch(()=>{});
const tripBases = new WeakMap(), saveQueues = new Map();
function rememberTrip(t){tripBases.set(t,TravelCore.clone(t));return t;}
function stripMeta(t){const c=TravelCore.clone(t);if(c){delete c._rev;delete c.updatedAt;}return c;}
async function writeTripDraft(draft){
  if(!navigator.onLine)throw Object.assign(new Error('인터넷에 연결한 뒤 다시 저장해 주세요.'),{code:'travel/offline'});
  const {local,base,isNew}=draft;
  TravelCore.validateTrip(local);
  const ref=doc(db,'trips',local.id);
  const saved=await runTransaction(db,async tx=>{
    const snap=await tx.get(ref);
    if(isNew&&snap.exists())throw new Error('같은 여행 번호가 이미 있어요. 다시 만들어 주세요.');
    if(!isNew&&!snap.exists())throw new Error('삭제된 여행입니다.');
    const remote=snap.exists()?snap.data():null;
    if(remote&&!remote.memberUids.includes(auth.currentUser.uid))throw new Error('이 여행에 접근할 수 없습니다.');
    const merged=isNew?TravelCore.clone(local):TravelCore.merge(stripMeta(base),stripMeta(local),stripMeta(remote));
    TravelCore.validateTrip(merged);
    merged._rev=(remote?remote._rev||0:0)+1; merged.updatedAt=Date.now();
    tx.set(ref,merged);
    for(const photoId of draft.deletePhotoIds||[])tx.delete(doc(db,'photos',photoId));
    return merged;
  });
  return saved;
}
let unsub = null;

// 오류 메시지를 한국어로 바꿔주는 함수
function msg(e){
  const c=(e&&e.code)||'';
  if(c.includes('email-already-in-use'))return'이미 가입된 이메일입니다. 로그인 탭을 이용해 주세요.';
  if(c.includes('invalid-email'))return'이메일 형식이 올바르지 않습니다.';
  if(c.includes('weak-password'))return'비밀번호는 8자 이상으로 만들어 주세요.';
  if(c.includes('invalid-credential')||c.includes('wrong-password')||c.includes('user-not-found'))
    return'이메일 또는 비밀번호가 올바르지 않습니다.';
  if(c.includes('too-many-requests'))return'시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  if(c.includes('network'))return'인터넷 연결을 확인해 주세요.';
  if(c.includes('operation-not-allowed'))return'현재 가입을 완료할 수 없습니다. 잠시 후 다시 시도해 주세요.';
  if(c.startsWith('travel/'))return e.message;
  return'요청을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.';
}

// 내 여행 실시간 구독
let photoUnsub=null,tripWatchGeneration=0,photoWatchGeneration=0,authGeneration=0;
function watchTrips(uid){
  if(unsub)unsub();
  const generation=++tripWatchGeneration;
  const q=query(collection(db,'trips'),where('memberUids','array-contains',uid));
  unsub=onSnapshot(q,snap=>{
    if(generation!==tripWatchGeneration||auth.currentUser?.uid!==uid)return;
    window.__invalidTrips=[];const list=[];snap.forEach(d=>{const t={...d.data(),id:d.id};try{TravelCore.validateTrip(t);list.push(rememberTrip(t));}catch(e){window.__invalidTrips.push(t);console.warn('[여행 데이터] 형식을 확인해야 하는 여행이 있습니다.');}});
    list.sort((a,b)=>(a.start||'').localeCompare(b.start||''));
    window.onTrips(list);if(!releaseState.pending&&!releaseState.failed.size)refreshConnection();
  },err=>{if(generation!==tripWatchGeneration||auth.currentUser?.uid!==uid)return;console.error(err);window.onFbError('데이터를 불러오지 못했습니다: '+err.message);});
}

function aiSession(){const session={uid:auth.currentUser?.uid,generation:authGeneration};assertAISession(session);return session;}
function assertAISession(session){if(!session.uid||auth.currentUser?.uid!==session.uid||session.generation!==authGeneration)throw Object.assign(new Error('로그인 상태가 바뀌어 AI 요청을 취소했어요.'),{code:'travel/cancelled'});}

/* ── Gemini 비전: 예약 캡처를 구조화 데이터로 직접 변환 ──
   키는 Firebase가 서버에서 관리하므로 앱 코드에 노출되지 않습니다. */
let _ai=null;
function ai(){ if(!_ai) _ai=getAI(app,{backend:new GoogleAIBackend()}); return _ai; }
const AI_MODELS=[window.GABOJEN_RELEASE.aiModel];
const AI_PROMPT=`이 내용은 여행과 관련된 예약·확인 정보입니다.
읽고 아래 JSON만 출력하세요. 설명·마크다운·코드블록 없이 JSON만.

{"kind":"flight|stay|rentcar|ticket|etc","items":[{
 "date":"YYYY-MM-DD (출발일/입실일/대여일/이용일)",
 "time":"HH:MM (24시간, 출발/체크인/대여/입장 시각)",
 "endDate":"YYYY-MM-DD (도착일/퇴실일/반납일, 없으면 \"\")",
 "endTime":"HH:MM (도착/체크아웃/반납/종료 시각, 없으면 \"\")",
 "from":"출발지 / 숙소명 / 대여지점 / 시설·가게 이름 (한글)",
 "to":"도착지 / 반납지점 (없으면 \"\")",
 "code":"편명·열차번호 또는 객실타입 또는 차종 또는 권종·좌석 (없으면 \"\")",
 "resv":"예약번호 (없으면 \"\")",
 "addr":"주소 또는 만나는 장소. 도로명주소가 있으면 그것을 우선 (없으면 \"\")",
 "tel":"문의 전화번호. 여러 개면 쉼표로 (없으면 \"\")",
 "url":"모바일 이용권/예약확인 링크 (없으면 \"\")"}]}

kind 고르는 법:
- flight  : 항공·기차(KTX/SRT)·고속버스·배 등 이동 수단 예약
- stay    : 호텔·펜션·리조트·게스트하우스 등 숙박
- rentcar : 렌터카 대여
- ticket  : 입장권·이용권·공연·전시·체험·티켓 (놀이공원, 박물관, 뮤지컬, 액티비티 등)
- etc     : 위에 해당하지 않는 예약 (식당 예약, 미용실, 픽업 서비스 등)

규칙:
- 왕복 항공권·왕복 기차표면 items에 2개(가는편·오는편)를 순서대로.
- 공항코드(CJU 등)는 한글 지명(제주)으로 바꾸세요.
- 숙박은 입실/퇴실 날짜·시각을 각각 date/endDate, time/endTime에 넣으세요.
- ticket·etc 는 시설·가게 이름을 from 에, 위치를 addr 에 넣으세요.
- 인원·매수가 적혀 있으면 code 에 함께 적으세요(예: "성인 2, 어린이 1").
- 체크인 데스크나 프론트 위치가 있으면 addr에 함께 적으세요.
- 화면/문장에 없는 값은 빈 문자열로 두고 절대 지어내지 마세요.`;

async function fileToPart(file){
  const b64=await new Promise((res,rej)=>{const r=new FileReader();
    r.onload=()=>res(String(r.result).split(',')[1]); r.onerror=rej; r.readAsDataURL(file);});
  return {inlineData:{mimeType:file.type||'image/png',data:b64}};
}

window.FB={
  msg,
  aiReady(){ return true; },
  async readText(text){
    const session=aiSession();
    await window.requestAIConsent('text');
    assertAISession(session);
    const log=[]; let lastErr=null;
    window.__aiDebug={tried:log,raw:'',ok:false};
    for(const name of AI_MODELS){
      try{
        const model=getGenerativeModel(ai(),{model:name,generationConfig:{responseMimeType:'application/json',maxOutputTokens:8192}},{timeout:45000});
        const r=await model.generateContent([AI_PROMPT,'\n\n---\n'+String(text||'').slice(0,6000)]);
        assertAISession(session);
        const txt=(r.response.text()||'').replace(/```json|```/g,'').trim();
        window.__aiDebug.raw=txt; log.push(name+': 응답 '+txt.length+'자');
        const m=txt.match(/\{[\s\S]*\}/);
        if(!m)throw new Error('AI 응답이 JSON이 아닙니다');
        const j=JSON.parse(m[0]); window.__aiDebug.ok=true; window.__aiDebug.model=name; return j;
      }catch(e){assertAISession(session);if(e.code==='travel/cancelled')throw e;lastErr=e; log.push(name+' 실패: '+String((e&&e.message)||e).slice(0,400)); }
    }
    const err=new Error(log.join(' / ')); err.detail=log; throw err;
  },
  async readImage(file){
    const session=aiSession();
    if(!file||!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>10*1024*1024)throw new Error('JPG·PNG·WebP 사진을 10MB 이하로 선택해 주세요.');
    await window.requestAIConsent('image');
    const part=await fileToPart(file);
    assertAISession(session);
    const log=[]; let lastErr=null;
    window.__aiDebug={tried:log,raw:'',ok:false};
    for(const name of AI_MODELS){
      try{
        const model=getGenerativeModel(ai(),{model:name,generationConfig:{responseMimeType:'application/json',maxOutputTokens:8192}},{timeout:45000});
        const r=await model.generateContent([AI_PROMPT,part]);
        assertAISession(session);
        const txt=(r.response.text()||'').replace(/```json|```/g,'').trim();
        window.__aiDebug.raw=txt;
        log.push(name+': 응답 '+txt.length+'자');
        const m=txt.match(/\{[\s\S]*\}/);
        if(!m){ log.push(name+': JSON 형식 아님'); throw new Error('AI 응답이 JSON이 아닙니다'); }
        const j=JSON.parse(m[0]);
        window.__aiDebug.ok=true; window.__aiDebug.model=name;
        return j;
      }catch(e){assertAISession(session);if(e.code==='travel/cancelled')throw e;lastErr=e; log.push(name+' 실패: '+String((e&&e.message)||e).slice(0,400)); }
    }
    const err=new Error(log.join(' / '));
    err.detail=log; throw err;
  },
  /* ── '읽기'가 아니라 '만들기'용 AI 통로 ──
     일정 추천·일정 생성·보고서 초안이 모두 이 함수 하나를 씁니다.
     ⚠ 여기에도 AI 키를 적지 않습니다. 위 readText/readImage와 똑같이
        Firebase AI Logic이 구글 서버에서 키를 들고 대신 호출합니다.
        (index.html 은 누구나 소스를 볼 수 있으므로 키를 적으면 그대로 공개됩니다) */
  /* AI가 401로 막힐 때, 어느 단계에서 막혔는지 스스로 점검합니다.
     (앱 인증 토큰을 받아오는 것까지만 시험 — AI를 부르지는 않습니다) */
  async checkAppCheck(){
    if(!appCheckInst)
      return {ok:false, step:'init', msg:String((appCheckErr&&appCheckErr.message)||'App Check를 시작하지 못했습니다')};
    try{
      const t=await getAppCheckToken(appCheckInst,true);
      return (t&&t.token)?{ok:true, step:'ok', msg:'앱 인증 토큰을 정상적으로 받았습니다'}
                         :{ok:false, step:'token', msg:'토큰이 비어 있습니다'};
    }catch(e){ return {ok:false, step:'token', msg:String((e&&e.message)||e)}; }
  },
  aiRoute(){return 'firebase';},
  /* images: 사진 data URL 배열 (없으면 글만 보냅니다) — 보고서에서 사진을 읽을 때 씁니다 */
  async askJson(prompt,images){
    const session=aiSession();
    await window.requestAIConsent('plan');
    assertAISession(session);
    this.bump('aiCalls');
    const log=[]; window.__aiDebug={tried:log,raw:'',ok:false,route:this.aiRoute()};
    const pics=(images||[]).map(u=>{
      const m=/^data:([^;]+);base64,(.*)$/.exec(String(u)||''); return m?{mime:m[1],b64:m[2]}:null;
    }).filter(Boolean);

    for(const name of AI_MODELS){
      try{
        const model=getGenerativeModel(ai(),{model:name,generationConfig:{responseMimeType:'application/json',maxOutputTokens:8192}},{timeout:45000});
        const r=await model.generateContent(pics.length
          ? [prompt].concat(pics.map(p=>({inlineData:{mimeType:p.mime,data:p.b64}})))
          : prompt);
        assertAISession(session);
        const txt=(r.response.text()||'').replace(/```json|```/g,'').trim();
        window.__aiDebug.raw=txt; log.push(name+': 응답 '+txt.length+'자');
        const m=txt.match(/\{[\s\S]*\}/);
        if(!m)throw new Error('AI 응답이 JSON이 아닙니다');
        const j=JSON.parse(m[0]);
        window.__aiDebug.ok=true; window.__aiDebug.model=name; return j;
      }catch(e){assertAISession(session);if(e.code==='travel/cancelled')throw e;log.push(name+' 실패: '+String((e&&e.message)||e).slice(0,400)); }
    }
    const err=new Error(log.join(' / ')); err.detail=log; throw err;
  },
  async signup(email,pw,name){
    const cred=await createUserWithEmailAndPassword(auth,email,pw);
    await updateProfile(cred.user,{displayName:name});
    /* 가입일은 '날짜'까지만 남깁니다 (시·분·초까지 남길 이유가 없습니다) */
    const today=new Date().toISOString().slice(0,10);
    await setDoc(doc(db,'users',cred.user.uid),{name,email,createdAt:today,lastSeen:today,tripCount:0,policyVersion:window.GABOJEN_RELEASE.policyVersion,acceptedAt:Date.now(),age14Confirmed:true});
    await sendEmailVerification(cred.user);
    this.bump('signups');
  },
  async login(email,pw){ await signInWithEmailAndPassword(auth,email,pw); },
  async logout(){if(releaseState.pending||releaseState.failed.size){reviewUnsaved();return;}if(unsub){unsub();unsub=null;}if(photoUnsub){photoUnsub();photoUnsub=null;}try{for(const k of Object.keys(localStorage)){if(k.startsWith('gbj_ai_')||k.startsWith('gbj_student_')||k.startsWith('lf_'))localStorage.removeItem(k);}}catch(_){}await signOut(auth);},
  async resetPw(email){ await sendPasswordResetEmail(auth,email); },
  async sendVerify(){ await sendEmailVerification(auth.currentUser); },
  /* 메일 링크를 누른 뒤 앱에서 '다시 확인'을 눌렀을 때 */
  async refreshVerified(){await auth.currentUser.reload();await auth.currentUser.getIdToken(true);return !!auth.currentUser.emailVerified;},
  /* ── 운영 통계 ────────────────────────────────────────────
     개인을 알아볼 수 있는 값은 넣지 않습니다. 숫자만 셉니다.
     (개인정보보호법: 통계 목적은 '개인을 식별할 수 없게' 처리해야 합니다) */
  async bump(){ /* Aggregate statistics must be maintained by trusted server jobs. */ },
  /* 관리자인지 — admins/{내uid} 문서가 있으면 관리자입니다(콘솔에서만 만들 수 있음) */
  async isAdmin(){
    const u=auth.currentUser;
    if(!u){ window.__adminWhy='로그인 안 됨'; return false; }
    try{
      const d=await getDoc(doc(db,'admins',u.uid));
      window.__adminWhy = d.exists() ? '' : 'notfound';
      return d.exists();
    }catch(e){
      /* 규칙이 옛날 것이면 여기서 permission-denied 가 납니다.
         예전에는 그냥 false 로 넘겨 버려서 '왜 안 되는지'를 알 수 없었습니다. */
      window.__adminWhy = ((e&&e.code)||String(e)).indexOf('permission')>=0 ? 'denied' : ((e&&e.code)||String(e));
      return false;
    }
  },
  async adminStats(){
    const out={summary:{},members:[],leaves:[]};
    try{ const d=await getDoc(doc(db,'stats','summary')); if(d.exists())out.summary=d.data(); }catch(e){}
    try{
      const snap=await getDocs(query(collection(db,'users'),orderBy('createdAt','desc'),limit(200)));
      snap.forEach(x=>{const v=x.data();
        out.members.push({joined:v.createdAt||'',seen:v.lastSeen||'',email:v.email||'',trips:v.tripCount||0});});
    }catch(e){ out.membersErr=(e&&e.code)||String(e); }
    try{
      const snap=await getDocs(query(collection(db,'leaveLog'),orderBy('date','desc'),limit(200)));
      snap.forEach(x=>out.leaves.push(x.data()));
    }catch(e){ out.leavesErr=(e&&e.code)||String(e); }
    return out;
  },
  /* 접속했음을 기록 — 마지막 접속일만 남깁니다(휴면·운영 판단용) */
  async touch(){
    try{ const u=auth.currentUser; if(!u)return;
      await setDoc(doc(db,'users',u.uid),{lastSeen:new Date().toISOString().slice(0,10)},{merge:true});
    }catch(e){}
  },
  async updateMyProfile(name,photo){
    await updateProfile(auth.currentUser,{displayName:name});
    await setDoc(doc(db,'users',auth.currentUser.uid),
      {name,photo:photo||"",email:auth.currentUser.email,updatedAt:Date.now()},{merge:true});
  },
  async saveTrip(t,isNew,deletePhotoIds=[]){
    const local=TravelCore.clone(t),base=tripBases.get(t);
    if(!isNew&&!base)throw new Error('여행을 다시 불러온 뒤 수정해 주세요.');
    const draft={base:TravelCore.clone(base),local,isNew:!!isNew,deletePhotoIds};
    tripBases.set(t,TravelCore.clone(local));
    releaseState.pending++;setSyncStatus('saving','변경 내용을 저장하고 있어요…');
    const previous=saveQueues.get(t.id)||Promise.resolve();
    const work=previous.catch(()=>{}).then(async()=>{
      if(releaseState.failed.has(t.id)){
        const failed=releaseState.failed.get(t.id);failed.local=local;failed.deletePhotoIds=[...new Set([...(failed.deletePhotoIds||[]),...deletePhotoIds])];
        throw Object.assign(new Error('저장하지 못한 변경을 먼저 확인해 주세요.'),{code:'travel/pending-draft'});
      }
      return writeTripDraft(draft);
    });
    saveQueues.set(t.id,work);
    try{
      const result=await work;
      if(isNew)rememberTrip(t);
      return result;
    }catch(e){
      if(!releaseState.failed.has(t.id))releaseState.failed.set(t.id,draft);
      setSyncStatus('error',e.code==='travel/conflict'?'다른 구성원의 수정과 겹쳐 저장을 멈췄어요':'변경 내용을 저장하지 못했어요');
      toast(e.code==='travel/conflict'?'다른 구성원의 수정과 겹쳤어요. 상단에서 미저장 내용을 확인해 주세요.':'저장하지 못했어요. 입력한 내용은 상단에서 확인할 수 있어요.');
      throw e;
    }finally{releaseState.pending--;if(saveQueues.get(t.id)===work)saveQueues.delete(t.id);if(!releaseState.pending)refreshConnection();}
  },
  createDraft(t){const copy=TravelCore.clone(t);tripBases.set(copy,TravelCore.clone(t));return copy;},
  async retryTrip(draft){const result=await writeTripDraft(draft);this.reloadTrips();return result;},
  reloadTrips(){if(auth.currentUser)watchTrips(auth.currentUser.uid);},
  /* ── 사진 원본 보관소 ────────────────────────────────────────
     사진을 여행 데이터 안에 글자로 넣으면 한 여행이 1MB를 못 넘어
     30장쯤에서 꽉 찼습니다. 원본은 보관소에 올리고 주소만 남깁니다.
     보관소가 꺼져 있으면 null 을 돌려주고, 앱은 예전 방식으로 저장합니다. */
  /* 보관소를 쓸 수 있는지 — 한 번 실패하면 이번 접속 동안 다시 시도하지 않습니다.
     (예전 코드는 보관소가 꺼져 있어도 '쓸 수 있다'고 답해, 올릴 때마다 파이어베이스가
      최대 10분간 재시도하며 '올리는 중…'에서 멈춰 있었습니다.) */
  _stOK:null,           // null=아직 모름, true=쓸 수 있음, false=못 씀
  _stWhy:'',
  storageOn(){ return this._stOK!==false; },
  storageState(){ return {ok:this._stOK, why:this._stWhy}; },
  async uploadPhoto(tripId,dataUrl){
    if(this._stOK===false) return null;
    let st;
    try{
      st=getStorage(app);
      /* 기본값은 재시도 10분입니다 — 보관소가 없으면 그동안 화면이 멈춥니다. 8초로 줄입니다 */
      st.maxUploadRetryTime=8000; st.maxOperationRetryTime=8000;
    }catch(e){ this._stOK=false; this._stWhy='보관소를 시작할 수 없음: '+(e&&e.code||e); return null; }
    try{
      const m=/^data:([^;]+);base64,(.*)$/.exec(dataUrl||''); if(!m)return null;
      const bin=atob(m[2]); const arr=new Uint8Array(bin.length);
      for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);
      const path='trips/'+tripId+'/'+auth.currentUser.uid+'_'+Date.now()+'_'
        +Math.random().toString(36).slice(2,7)+'.jpg';
      const r=sRef(st,path);
      /* 그래도 안 끝나면 12초에서 끊고 예전 방식으로 넘어갑니다 */
      const timeout=new Promise((_,rej)=>setTimeout(()=>rej(new Error('시간 초과')),12000));
      await Promise.race([uploadBytes(r,new Blob([arr],{type:m[1]}),{contentType:m[1]}), timeout]);
      const url=await Promise.race([getDownloadURL(r), timeout]);
      this._stOK=true; this._stWhy='';
      return {url, path};
    }catch(e){
      this._stOK=false;
      this._stWhy=(e&&(e.code||e.message))||String(e);
      console.warn('[사진보관소] 사용 불가 — 이번 접속 동안은 예전 방식으로 저장합니다:',this._stWhy);
      return null;
    }
  },
  async deletePhoto(path){
    if(!path)return; try{ await deleteObject(sRef(getStorage(app),path)); }catch(e){}
  },
  async deleteTrip(id){ await this.deleteTripPhotos(id); await deleteDoc(doc(db,'trips',id)); },

  /* ── 회원 탈퇴 ────────────────────────────────────────────
     ① 내가 만든 여행과 그 사진을 지우고
     ② 남이 만든 여행에서는 내 이름만 빼고(다른 사람 여행은 남겨 둡니다)
     ③ 내 프로필을 지우고
     ④ 마지막에 계정을 지웁니다. */
  /* 오래 로그인해 둔 상태에서는 구글이 탈퇴를 거부합니다. 비밀번호로 본인 확인을 한 번 더 합니다 */
  async reauth(pw){
    const u=auth.currentUser; if(!u)throw new Error('로그인 상태가 아닙니다');
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email,pw));
  },
  async deleteAccount(){
    const u=auth.currentUser; if(!u)throw new Error('로그인 상태가 아닙니다');
    const uid=u.uid;
    const snap=await getDocs(query(collection(db,'trips'),where('memberUids','array-contains',uid)));
    for(const d of snap.docs){
      const t=d.data();
      if(t.owner===uid){
        await this.deleteTripPhotos(t.id||d.id);
        await deleteDoc(doc(db,'trips',d.id));
      }else{
        const photos=await getDocs(query(collection(db,'photos'),where('tripId','==',d.id)));
        const own=photos.docs.filter(p=>p.data().uid===uid);
        await runTransaction(db,async tx=>{const current=await tx.get(d.ref);if(!current.exists())return;const cleaned=TravelCore.removeAuthoredContent(current.data(),uid,own.map(x=>x.id));cleaned._rev=(current.data()._rev||0)+1;cleaned.updatedAt=Date.now();tx.set(d.ref,cleaned);});
        for(let i=0;i<own.length;i+=400){const batch=writeBatch(db);own.slice(i,i+400).forEach(p=>batch.delete(p.ref));await batch.commit();}
        await this.leaveTrip(d.id);
      }
    }
    /* 탈퇴 기록 — 개인정보보호법상 탈퇴하면 개인정보는 파기해야 합니다.
       그래서 uid·이메일·이름은 남기지 않고, '언제 몇 명이 떠났는지'만 익명으로 남깁니다. */
    let joined='';
    try{ const me=await getDoc(doc(db,'users',uid)); if(me.exists())joined=me.data().createdAt||''; }catch(e){}
    try{
      const today=new Date().toISOString().slice(0,10);
      let used=null;
      if(joined){ const d=Math.round((new Date(today)-new Date(joined))/86400000); if(d>=0)used=d; }
      await addDoc(collection(db,'leaveLog'),{date:today, daysUsed:used});   // 개인 식별 정보 없음
      this.bump('leaves');
    }catch(e){}
    // Remove UID-attributed photos even if a user previously left that trip.
    const orphaned=await getDocs(query(collection(db,'photos'),where('uid','==',uid)));
    for(let i=0;i<orphaned.docs.length;i+=400){const batch=writeBatch(db);orphaned.docs.slice(i,i+400).forEach(p=>batch.delete(p.ref));await batch.commit();}
    await deleteDoc(doc(db,'users',uid));
    if(unsub){unsub();unsub=null;}
    if(photoUnsub){photoUnsub();photoUnsub=null;}
    await deleteUser(u);
  },

  /* ── 사진을 '한 장 = 문서 하나'로 따로 저장 ────────────────────────
     예전에는 사진을 여행 데이터 안에 글자로 넣어, 여행 1건이 1MB 한도에 걸려
     40장쯤에서 꽉 찼습니다(4명이 6곳만 다녀도 48장).
     이제 사진은 photos 칸에 따로 담고, 여행 데이터에는 '몇 번 사진'이라는 쪽지만 남깁니다.
     사진 용량·다운로드·요금은 운영 프로젝트 설정과 사용량에 따라 확인해야 합니다. */
  async savePhoto(tripId,rec){
    const r=await addDoc(collection(db,'photos'),{
      tripId, u:rec.u, by:rec.by||'', uid:auth.currentUser.uid, at:Date.now()});
    this.bump('photos');
    return r.id;
  },
  async deletePhotoDoc(id){ if(id) await deleteDoc(doc(db,'photos',id)); },
  /* 지금 보고 있는 여행의 사진만 가져옵니다 (다른 여행 사진은 안 불러옵니다) */
  watchPhotos(tripId,cb){
    if(photoUnsub){photoUnsub();photoUnsub=null;}
    const generation=++photoWatchGeneration,uid=auth.currentUser?.uid;
    if(!tripId)return;
    const q=query(collection(db,'photos'),where('tripId','==',tripId));
    photoUnsub=onSnapshot(q,snap=>{
      if(generation!==photoWatchGeneration||auth.currentUser?.uid!==uid)return;
      const map={}; snap.forEach(d=>{const v=d.data(); map[d.id]={u:v.u,by:v.by,uid:v.uid};});
      cb(map);
    },err=>{if(generation!==photoWatchGeneration||auth.currentUser?.uid!==uid)return;console.warn('[사진] 불러오기 실패:',err&&err.code);cb({},err);});
  },
  /* 여행을 지울 때 그 여행 사진도 같이 지웁니다 */
  async deleteTripPhotos(tripId){
    const snap=await getDocs(query(collection(db,'photos'),where('tripId','==',tripId)));
    for(let i=0;i<snap.docs.length;i+=400){const b=writeBatch(db);snap.docs.slice(i,i+400).forEach(d=>b.delete(d.ref));await b.commit();}
  },
  async createInvite(tripId){
    const u=auth.currentUser;if(!u?.emailVerified)throw new Error('이메일 인증이 필요합니다.');
    const existing=await getDocs(query(collection(db,'invites'),where('createdBy','==',u.uid),where('tripId','==',tripId)));
    const active=existing.docs.map(d=>({token:d.id,...d.data()})).filter(i=>!i.revoked&&i.expiresAt.toMillis()>Date.now()).sort((a,b)=>b.expiresAt.toMillis()-a.expiresAt.toMillis());
    if(active.length)return {token:active[0].token,tripId,expiresAt:active[0].expiresAt.toMillis()};
    const token=Array.from(crypto.getRandomValues(new Uint8Array(20)),b=>b.toString(16).padStart(2,'0')).join('');
    const expiresAt=Date.now()+7*86400000-60000;
    await setDoc(doc(db,'invites',token),{tripId,createdBy:u.uid,expiresAt:Timestamp.fromMillis(expiresAt),revoked:false});
    return {token,tripId,expiresAt};
  },
  async revokeInvite(token){await updateDoc(doc(db,'invites',token),{revoked:true});},
  async revokeAllInvites(tripId){
    const snap=await getDocs(query(collection(db,'invites'),where('createdBy','==',auth.currentUser.uid),where('tripId','==',tripId)));
    for(let i=0;i<snap.docs.length;i+=400){const batch=writeBatch(db);snap.docs.slice(i,i+400).forEach(d=>batch.update(d.ref,{revoked:true}));await batch.commit();}
  },
  async joinTrip(code){
    const u=auth.currentUser;if(!u?.emailVerified)throw new Error('이메일 인증이 필요합니다.');
    await u.getIdToken(true);
    const snap=await getDoc(doc(db,'invites',code));
    if(!snap.exists())throw new Error('초대 링크가 유효하지 않습니다.');
    const invite=snap.data();if(TRIPS.some(t=>t.id===invite.tripId&&t.memberUids.includes(u.uid)))return invite.tripId;if(invite.revoked||invite.expiresAt.toMillis()<=Date.now())throw new Error('만료된 초대입니다.');
    const mine=await getDoc(doc(db,'users',u.uid));const profile=mine.exists()?mine.data():{};
    const member={n:(profile.name||u.displayName||'?').slice(0,1),nm:profile.name||u.displayName||'여행자',uid:u.uid,photo:profile.photo||'',c:'#285c4d',joinedAt:new Date().toISOString().slice(0,10)};
    // No pre-join read of private trip data. The server validates token and exact membership delta.
    await updateDoc(doc(db,'trips',invite.tripId),{memberUids:arrayUnion(u.uid),members:arrayUnion(member),_joinToken:code});
    return invite.tripId;
  },
  async leaveTrip(tripId){
    await runTransaction(db,async tx=>{const r=doc(db,'trips',tripId),s=await tx.get(r);if(!s.exists())return;const t=s.data(),uid=auth.currentUser.uid;if(t.owner===uid)throw new Error('여행 소유자는 나갈 수 없습니다.');tx.update(r,{memberUids:t.memberUids.filter(x=>x!==uid),members:t.members.filter(x=>x.uid!==uid)});});
  }

};

onAuthStateChanged(auth,async user=>{
  const generation=++authGeneration;
  ++tripWatchGeneration;++photoWatchGeneration;
  if(unsub){unsub();unsub=null;}if(photoUnsub){photoUnsub();photoUnsub=null;}
  if(user){
    let profile={name:user.displayName,photo:""};
    try{const s=await getDoc(doc(db,'users',user.uid));
      if(s.exists()){const d=s.data();profile.name=profile.name||d.name;profile.photo=d.photo||"";}}catch(e){}
    if(generation!==authGeneration||auth.currentUser?.uid!==user.uid)return;
    watchTrips(user.uid);
    window.onAuthed(user,profile);
  }else{
    if(unsub){unsub();unsub=null;}if(photoUnsub){photoUnsub();photoUnsub=null;}
    window.onSignedOut();
  }
});

// 5초 안에 응답 없으면 안내
setTimeout(()=>{const s=document.getElementById('splash');
  if(s&&s.style.display!=='none')window.onFbError('불러오는 데 시간이 걸리고 있어요. 잠시만 기다려 주세요.');},9000);
