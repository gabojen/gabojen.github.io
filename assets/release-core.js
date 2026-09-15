/* Pure data helpers shared by the app and release checks. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TravelCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  function conflict(path) {
    const error = new Error('같은 내용을 다른 구성원이 수정했습니다. 최신 내용을 확인해 주세요.');
    error.code = 'travel/conflict'; error.path = path; throw error;
  }
  // Rebase only the changes made locally onto the latest server document.
  // A concurrent edit of the same value is never silently overwritten.
  function merge(base, local, remote, path = '') {
    if (equal(local, base)) return clone(remote);
    if (equal(remote, base) || equal(local, remote)) return clone(local);
    if (record(base) && record(local) && record(remote)) {
      const out = {};
      for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('허용되지 않는 데이터');
        const value = merge(base[key], local[key], remote[key], path + '/' + key);
        if (value !== undefined) out[key] = value;
      }
      return out;
    }
    if ([base, local, remote].every(Array.isArray)) {
      const all = [...base, ...local, ...remote];
      const key = ['_id', 'date', 'uid', 'ref'].find(k => all.length && all.every(v => record(v) && typeof v[k] === 'string') &&
        [base, local, remote].every(a => new Set(a.map(v => v[k])).size === a.length));
      if (key) {
        const maps = [base, local, remote].map(a => new Map(a.map(v => [v[key], v])));
        const order = [...new Set([...remote, ...local].map(v => v[key]))];
        return order.map(id => merge(maps[0].get(id), maps[1].get(id), maps[2].get(id), path + '/' + id))
          .filter(v => v !== undefined);
      }
      if (all.every(v => typeof v === 'string')) {
        const removed = new Set(base.filter(v => !local.includes(v) || !remote.includes(v)));
        return [...new Set([...remote, ...local])].filter(v => !removed.has(v));
      }
      // Legacy arrays without stable IDs can be safely combined when both only append.
      if (equal(local.slice(0, base.length), base) && equal(remote.slice(0, base.length), base)) {
        return clone([...remote, ...local.slice(base.length).filter(v => !remote.slice(base.length).some(r => equal(v, r)))]);
      }
    }
    return conflict(path);
  }
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
    const d = new Date(value + 'T00:00:00Z');
    return Number.isFinite(+d) && d.toISOString().slice(0, 10) === value;
  }
  function dateRange(start, end) {
    if (!validDate(start) || !validDate(end)) throw new Error('올바른 여행 날짜를 입력해 주세요.');
    const a = Date.parse(start + 'T00:00:00Z'), b = Date.parse(end + 'T00:00:00Z');
    const count = Math.round((b - a) / 86400000) + 1;
    if (count < 1) throw new Error('종료일은 시작일과 같거나 뒤로 선택해 주세요.');
    if (count > 90) throw new Error('여행은 시작일부터 최대 90일까지 만들 수 있어요.');
    return Array.from({ length: count }, (_, i) => new Date(a + i * 86400000).toISOString().slice(0, 10));
  }
  function safeURL(value) {
    try {
      const u = new URL(String(value || ''));
      return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : '';
    } catch (_) { return ''; }
  }
  function safeImage(value) {
    const s = String(value || '');
    if (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s)) return s;
    if (/^(?:covers|hero|assets)\/[A-Za-z0-9_-]+\.(?:webp|png|jpe?g)$/i.test(s)) return s;
    const u = safeURL(s);
    return u ? u.replace(/["'()<>\\\s]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()) : '';
  }
  function jsText(value) {
    return String(value ?? '').replace(/[\\'"<>&\n\r\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  }
  function validateTrip(t) {
    if (!t || !/^[A-Za-z0-9_-]{4,80}$/.test(t.id || '')) throw new Error('여행 번호가 올바르지 않습니다.');
    const dates = dateRange(t.start, t.end);
    if (typeof t.title !== 'string' || !t.title.trim() || t.title.length > 100 || (t.place != null && typeof t.place !== 'string') || (t.place || '').length > 200) throw new Error('여행 제목은 100자, 여행지는 200자 이내로 입력해 주세요.');
    if (!Array.isArray(t.days) || !t.days.length || t.days.length > 90 || t.days.some(d => !record(d) || !dates.includes(d.date)) || new Set(t.days.map(d=>d.date)).size !== t.days.length) throw new Error('일정 날짜를 확인해 주세요.');
    const categories = new Set(['transport','stay','rentcar','ticket','plan','pack']);
    const ids = new Set();
    for (const day of t.days) {
      if (!Array.isArray(day.items) || day.items.length > 150) throw new Error('하루 일정은 150개까지 저장할 수 있어요.');
      for (const it of day.items) {
        if (!record(it) || !/^[A-Za-z0-9_-]{1,80}$/.test(it._id || '') || ids.has(it._id)) throw new Error('일정 번호가 중복되었거나 올바르지 않습니다.');
        ids.add(it._id);
        if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(it.time || '') || !categories.has(it.cat)) throw new Error('일정 시간과 분류를 확인해 주세요.');
        if (typeof it.title !== 'string' || !it.title.trim() || it.title.length > 200 || (it.sub != null && typeof it.sub !== 'string') || (it.sub || '').length > 6000) throw new Error('일정 제목은 200자, 메모는 6,000자 이내로 입력해 주세요.');
      }
    }
    if (JSON.stringify(t).length > 850000 || new TextEncoder().encode(JSON.stringify(t)).length > 900000) throw new Error('저장공간이 부족합니다. 사진을 줄인 뒤 다시 저장해 주세요.');
    return t;
  }
  function normalizePlans(value, dates) {
    if (!value || !Array.isArray(value.plans)) throw new Error('AI 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.');
    return value.plans.filter(record).slice(0, 2).map(p => ({
      name: String(p.name || '추천 일정').slice(0, 20), summary: String(p.summary || '').slice(0, 100),
      days: (Array.isArray(p.days) ? p.days : []).filter(d => record(d) && dates.includes(d.date)).filter((d,i,a) => a.findIndex(x=>x.date===d.date)===i).map(d => ({date:d.date,
        items: (Array.isArray(d.items) ? d.items : []).filter(x => record(x) && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(x.time || '') && typeof x.title === 'string' && x.title.trim()).slice(0, 15)
          .map(x => ({time:x.time,title:x.title.slice(0,80),place:String(x.place || '').slice(0,150),kind:x.kind==='ticket'?'ticket':'plan',why:String(x.why||'').slice(0,150)}))
      })).filter(d => d.items.length)
    })).filter(p => p.days.length);
  }
  // Published files and fallbacks use different schemas. Reject broken feeds so
  // the caller can load the fallback; discard individual malformed cards.
  function normalizeNews(value) {
    if (!record(value)) throw new Error('여행 정보 형식을 확인해 주세요.');
    const text = x => typeof x === 'string' ? x : '';
    const card = x => record(x) && ['string','number'].includes(typeof x.id) && text(x.title).trim();
    const images = x => ({...x,id:String(x.id),img:safeImage(x.img),thumb:safeImage(x.thumb)});
    if (value.kind === 'editorial') {
      const places = (Array.isArray(value.places) ? value.places : []).filter(card).filter(p=>text(p.region).trim()).map(p=>({...p,id:String(p.id),image:safeImage(p.image),url:safeURL(p.url)}));
      if (!places.length) throw new Error('여행 아이디어가 없습니다.');
      return {...value,title:text(value.title)||'다음 여행의 작은 영감',lead:text(value.lead),places};
    }
    if (!Array.isArray(value.festivals) || !record(value.spots)) throw new Error('여행 소식을 불러오지 못했어요.');
    const ymd = x => typeof x === 'string' && /^\d{8}$/.test(x) && validDate(x.slice(0,4)+'-'+x.slice(4,6)+'-'+x.slice(6));
    const festivals = value.festivals.filter(card).filter(f=>ymd(f.start)&&ymd(f.end)&&f.end>=f.start).map(images);
    const spots = Object.fromEntries(Object.entries(value.spots).filter(([r,a])=>r&&Array.isArray(a)).map(([r,a])=>[r,a.filter(card).map(images)]));
    if (!festivals.length && !Object.values(spots).some(a=>a.length)) throw new Error('여행 소식이 없습니다.');
    return {...value,festivals,spots};
  }
  // Only UID-attributed content can be safely removed automatically. Legacy names
  // are not identities: two members can have the same display name.
  function removeAuthoredContent(trip, uid, photoIds = []) {
    const t=clone(trip), refs=new Set(photoIds);
    const photos=list=>(list||[]).filter(p=>!p||typeof p!=='object'||(p.uid!==uid&&!refs.has(p.ref)));
    t.photos=photos(t.photos);
    t.proposals=(t.proposals||[]).filter(p=>p.createdBy!==uid).map(p=>({...p,votes:(p.votes||[]).filter(v=>v!==uid)}));
    t.days=(t.days||[]).map(d=>({...d,items:(d.items||[]).filter(i=>i.createdBy!==uid).map(i=>({...i,photos:photos(i.photos),comments:(i.comments||[]).filter(c=>c.uid!==uid)}))}));
    if(t.cover&&(t.cover.createdBy===uid||refs.has(t.cover.ref)))delete t.cover;
    return t;
  }
  const minutes=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s||'')?Number(s.slice(0,2))*60+Number(s.slice(3)):NaN;
  function planConflicts(trip, plan) {
    const clashes=[];
    for(const d of plan.days||[]){
      const existing=(trip.days.find(day=>day.date===d.date)?.items||[]);
      const proposed=[];
      for(const item of d.items||[]){
        const start=minutes(item.time),end=start+60;
        // A conservative one-hour activity window plus a 15-minute travel buffer.
        // Exact duration and current route time still need user verification.
        const all=existing.concat(proposed);
        if(!Number.isFinite(start)||all.some(x=>{const a=minutes(x.time),b=Number.isFinite(minutes(x.endTime))?minutes(x.endTime):a+60;return start<b+15&&end+15>a;}))clashes.push({date:d.date,title:item.title,time:item.time});
        proposed.push(item);
      }
    }
    return clashes;
  }
  return { clone, merge, validDate, dateRange, safeURL, safeImage, jsText, validateTrip, normalizePlans, normalizeNews, removeAuthoredContent, planConflicts };
});
