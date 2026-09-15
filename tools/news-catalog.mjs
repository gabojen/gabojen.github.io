/* Balance districts before taking the first six places of each kind. */
export function variedPlaces(rows, limit=6, requireImage=true) {
  const districts=new Map(),seen=new Set();
  for (const x of rows) {
    if(!x || !x.contentid || !String(x.title||'').trim() || (requireImage && !(x.firstimage||x.firstimage2)) || seen.has(String(x.contentid)))continue;
    seen.add(String(x.contentid));
    const district=String(x.addr1||'').split(/\s+/).slice(0,2).join(' ');
    if(!districts.has(district))districts.set(district,[]);
    districts.get(district).push(x);
  }
  const queues=[...districts.values()],out=[];
  while(out.length<limit&&queues.some(a=>a.length)) {
    for(const q of queues)if(q.length&&out.length<limit)out.push(q.shift());
  }
  return out;
}

// Keep familiar travel areas in the selector while accepting current official addresses.
export function travelRegion(x) {
  const address=String(x.addr1||x.addr||'').trim(),first=address.split(/\s+/)[0];
  if(first==='전남광주통합특별시')return /^(동구|서구|남구|북구|광산구)$/.test(address.split(/\s+/)[1]||'')?'광주':'전남';
  const aliases=[['서울','서울'],['부산','부산'],['대구','대구'],['인천','인천'],['광주광역','광주'],['대전','대전'],['울산','울산'],['세종','세종'],['경기도','경기'],['강원','강원'],['충청북','충북'],['충청남','충남'],['전북','전북'],['전라북','전북'],['전라남','전남'],['경상북','경북'],['경상남','경남'],['제주','제주']];
  return aliases.find(([prefix])=>first.startsWith(prefix))?.[1]||'';
}
