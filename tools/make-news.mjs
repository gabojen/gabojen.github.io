/* ============================================================================
   여행 소식지 만들기 (한국관광공사 TourAPI → news/YYYY-MM.json)

   · 이 파일은 앱에 들어가지 않습니다. GitHub Actions(자동) 또는 컴퓨터에서만 돕니다.
   · 인증키는 코드에 적지 않고 환경변수 TOUR_API_KEY 로만 받습니다.
     → 공개 저장소에 키가 올라가지 않습니다.

   쓰는 법
     TOUR_API_KEY="발급받은키" node tools/make-news.mjs           (이번 달)
     TOUR_API_KEY="..."       node tools/make-news.mjs 2026-11    (특정 달)
   ============================================================================ */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { variedPlaces, travelRegion } from './news-catalog.mjs';

const RAW = (process.env.TOUR_API_KEY || '').trim();
if (!RAW) {
  console.error('');
  console.error('❌ 인증키가 없습니다.');
  console.error('   저장소 → Settings → Secrets and variables → Actions 에서');
  console.error('   이름을  TOUR_API_KEY  로 하여 인증키를 넣어 주세요.');
  console.error('   (이름 철자가 다르면 여기서 못 읽습니다)');
  process.exit(1);
}
/* 공공데이터포털은 인증키를 두 가지로 줍니다.
   Encoding 키는 % 가 섞여 있어 그대로 쓰면 두 번 인코딩되어 '등록되지 않은 키'가 됩니다.
   → % 가 보이면 원래 글자로 되돌려 씁니다. 어느 쪽을 넣어도 동작합니다. */
const KEY = RAW.includes('%') ? decodeURIComponent(RAW) : RAW;
/* 실행 기록이 저장소에 올라가므로, 어떤 글에도 인증키가 남지 않도록 지웁니다 */
const redact = v => String(v).split(RAW).join('***').split(KEY).join('***')
  .split(encodeURIComponent(KEY)).join('***');
const say = (...a) => console.log(a.map(redact).join(' '));
const cry = (...a) => console.error(a.map(redact).join(' '));
say('관광정보 수집을 시작합니다.');

const BASE = 'https://apis.data.go.kr/B551011/KorService2';
const APP  = 'gabojen';

/* 법정동 시도 코드 (매뉴얼 lDongRegnCd) */
const REGIONS = [
  ['11','서울'],['26','부산'],['27','대구'],['28','인천'],['12','광주'],['30','대전'],
  ['31','울산'],['36','세종'],['41','경기'],['51','강원'],['43','충북'],['44','충남'],
  ['52','전북'],['12','전남'],['47','경북'],['48','경남'],['50','제주'],
];
const REGION_OF = Object.fromEntries(REGIONS);

/* 달마다 바뀌는 소식지 머리글 — 사실이 아니라 '분위기'만 담습니다(지어내지 않음) */
const MONTH_NOTE = {
  1:['1월, 조용한 시작','한 해의 첫 장을 어디에 쓸지 정하는 달'],
  2:['2월, 아직 겨울','사람 적은 겨울 끝자락이 오히려 좋은 때'],
  3:['3월, 남쪽부터','꽃 소식은 남쪽에서 올라옵니다'],
  4:['4월, 꽃 한가운데','일 년 중 가장 붐비는 달 — 평일이 답입니다'],
  5:['5월, 걷기 좋은 날','덥기 전에 가장 많이 걸을 수 있는 달'],
  6:['6월, 초록이 짙어질 때','장마 전 마지막 맑은 주말'],
  7:['7월, 물가로','더위는 물가에서 식힙니다'],
  8:['8월, 한여름','이른 아침과 늦은 오후에 움직이는 달'],
  9:['9월, 한숨 돌리고','덥지도 춥지도 않은 짧은 계절'],
  10:['10월, 억새와 단풍 사이','가장 멀리 다녀오기 좋은 달'],
  11:['11월, 늦가을','붐빔이 가라앉고 색만 남는 때'],
  12:['12월, 불빛','해넘이와 불빛을 보러 가는 달'],
};

const ymd = d => `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;

async function call(op, params) {
  const q = new URLSearchParams({
    serviceKey: KEY, MobileOS:'ETC', MobileApp:APP, _type:'json', ...params,
  });
  const url = `${BASE}/${op}?${q}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(25000),
        headers: { 'User-Agent': 'gabojen-news/1.0', 'Accept': 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const text = await res.text();
      if (text.includes('SERVICE_KEY_IS_NOT_REGISTERED'))
        throw new Error('인증키를 관광공사가 모른다고 합니다.\n   · 공공데이터포털의 "일반 인증키"를 그대로 넣으셨는지\n   · 활용신청 승인 뒤 10분쯤 지났는지\n   · 앞뒤에 빈칸이나 줄바꿈이 섞이지 않았는지 확인해 주세요.');
      if (text.includes('LIMITED_NUMBER_OF_SERVICE_REQUESTS'))
        throw new Error('오늘 호출 한도(1,000건)를 넘었습니다. 내일 다시 돌려 주세요.');
      if (text.includes('SERVICE_ACCESS_DENIED'))
        throw new Error('이 서비스에 대한 활용신청이 승인되지 않았습니다. 공공데이터포털에서 "국문 관광정보 서비스" 활용신청 상태를 확인해 주세요.');
      if (text.includes('DEADLINE_HAS_EXPIRED'))
        throw new Error('인증키 활용 기간이 끝났습니다. 공공데이터포털에서 연장해 주세요.');
      const j = JSON.parse(text);
      const status = j?.response?.header?.resultCode;
      if (status != null && String(status) !== '0000' && String(status) !== '00') throw new Error('관광공사 응답 코드: ' + String(status).replace(/[^A-Z0-9]/gi,''));
      const body = j?.response?.body;
      if (!body) throw new Error('응답 형식이 예상과 다릅니다.');
      const item = body.items?.item;
      return Array.isArray(item) ? item : (item ? [item] : []);
    } catch (e) {
      const why = e.name === 'TimeoutError' || /abort/i.test(e.message||'')
        ? '응답이 20초 안에 오지 않음(관광공사 서버가 느리거나 막힘)'
        : ((e.cause?.code || '') + ' ' + (e.message || String(e)));
      cry(`   · ${op} ${attempt}번째 시도 실패: ${why}`);
      if (attempt === 3) throw e;
      await new Promise(r => setTimeout(r, 800 * attempt));
    }
  }
}

/* 이미지는 저작권 유형이 붙어 있습니다.
   Type1 = 출처표시, Type3 = 출처표시 + 변경금지.
   둘 다 출처를 반드시 표시하고, 사진에 색 보정·합성을 하지 않습니다. */
const pickImg = x => (x.firstimage || x.firstimage2 || '').replace(/^http:/,'https:');
const pickThumb = x => (x.firstimage2 || x.firstimage || '').replace(/^http:/,'https:');

function festivalOf(x) {
  return {
    id: String(x.contentid),
    title: (x.title||'').trim(),
    start: x.eventstartdate || '',
    end: x.eventenddate || '',
    region: travelRegion(x) || REGION_OF[String(x.lDongRegnCd||'').padStart(2,'0')] || '',
    addr: (x.addr1||'').trim(),
    tel: (x.tel||'').trim(),
    img: pickImg(x),
    thumb: pickThumb(x),
    rights: x.cpyrhtDivCd || '',
    lat: x.mapy ? +x.mapy : null,
    lng: x.mapx ? +x.mapx : null,
  };
}

async function main() {
  const arg = process.argv[2];
  if (arg && !/^20\d{2}-(0[1-9]|1[0-2])$/.test(arg)) throw new Error('수집할 달은 YYYY-MM 형식이어야 합니다.');
  const now = arg ? new Date(`${arg}-01T00:00:00`) : new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const first = new Date(y, m, 1), last = new Date(y, m+1, 0);
  const month = `${y}-${String(m+1).padStart(2,'0')}`;

  say(`📅 ${month} 소식지를 만듭니다  (오늘 ${new Date().toISOString().slice(0,10)})`);

  /* ① 이번 달 축제 — 대표 이미지가 있는 것만(arrange=Q: 수정일순 + 이미지 필수) */
  const fests = [];
  for (let page = 1; page <= 4; page++) {
    const rows = await call('searchFestival2', {
      numOfRows:'100', pageNo:String(page), arrange:'Q',
      eventStartDate: ymd(first), eventEndDate: ymd(last),
    });
    fests.push(...rows);
    say(`   축제 ${page}쪽: ${rows.length}건`);
    if (rows.length < 100) break;
  }

  /* 이번 달에 실제로 열리는 것만 (시작이 이달 말 이후면 제외) */
  const A = ymd(first), B = ymd(last);
  const seen = new Set();
  const festivals = fests.map(festivalOf)
    .filter(f => f.title && f.img && f.start && f.start <= B && (!f.end || f.end >= A))
    .filter(f => !seen.has(f.id) && seen.add(f.id))
    .sort((a,b) => a.start.localeCompare(b.start));

  /* Collect several kinds per region; do not erase old places on a partial outage. */
  let previous={};
  try { previous=JSON.parse(await readFile('news/latest.json','utf8')).spots||{}; } catch (_) {}
  const spots={}, collectionWarnings=[];
  let successfulTypes=0,legacyAreas=null;
  for (const [code,name] of REGIONS) {
    const collected=[];
    for (const type of ['12','14','28','38','39']) {
      try {
        let rows=await call('areaBasedList2',{
          numOfRows:code==='12'?'100':'30',pageNo:'1',arrange:'Q',contentTypeId:type,lDongRegnCd:code,
        });
        // Some records have not migrated to the legal-district field yet.
        // Resolve legacy codes from the provider instead of guessing them.
        if(!rows.length) {
          if(!legacyAreas)legacyAreas=await call('areaCode2',{numOfRows:'100',pageNo:'1'});
          const legacy=legacyAreas.find(x=>String(x.name||'').includes(name));
          if(legacy)rows=await call('areaBasedList2',{numOfRows:'30',pageNo:'1',arrange:'C',contentTypeId:type,areaCode:String(legacy.code)});
        }
        const matching=rows.filter(x=>travelRegion(x)===name);
        const batch=variedPlaces(matching,6,false);
        collected.push(...batch.map(x=>({
          id:String(x.contentid),title:(x.title||'').trim(),addr:(x.addr1||'').trim(),
          contentTypeId:type,img:pickImg(x),thumb:pickThumb(x),rights:x.cpyrhtDivCd||'',
          collectedAt:new Date().toISOString().slice(0,10),
          lat:x.mapy?+x.mapy:null,lng:x.mapx?+x.mapx:null,
        })));
        successfulTypes++;
      } catch(e) {
        collectionWarnings.push(name+' · '+type);
        collected.push(...(previous[name]||[]).filter(p=>String(p.contentTypeId||'12')===type));
        cry(name+' 일부 유형 수집 실패. 기존 자료 유지.');
      }
      await new Promise(r=>setTimeout(r,120));
    }
    const seen=new Set();
    spots[name]=collected.filter(p=>!seen.has(p.id)&&seen.add(p.id));
    say(name+': '+spots[name].length+'곳');
  }
  if(!successfulTypes || !Object.values(spots).some(a=>a.length)) throw new Error('장소 수집 실패: 기존 소식지를 유지합니다.');

  const [title, lead] = MONTH_NOTE[m+1];
  const out = {
    month, title, lead,
    madeAt: new Date().toISOString().slice(0,10),
    source: '한국관광공사 TourAPI',
    festivals, spots, collectionWarnings,
  };

  await mkdir('news', { recursive: true });
  await writeFile(`news/${month}.json`, JSON.stringify(out), 'utf8');
  await writeFile('news/latest.json', JSON.stringify(out), 'utf8');
  const kb = Math.round(JSON.stringify(out).length/1024);
  say(`✅ news/${month}.json · 축제 ${festivals.length}개 · ${kb}KB`);
}

main().catch(e => {
  cry('');
  cry('❌ 소식지를 만들지 못했습니다.');
  cry('   ' + (e.message || e));
  cry('');
  cry('자주 있는 원인');
  cry('  1) 인증키가 아직 승인 대기 중 → 승인 10분 뒤 다시');
  cry('  2) 공공데이터포털에서 "국문 관광정보 서비스" 활용신청이 안 됨');
  cry('  3) 관광공사 서버가 해외(깃허브) 요청에 느리게 응답 → 잠시 뒤 다시');
  process.exit(1);
});
