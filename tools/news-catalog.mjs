/* Balance districts before taking the first six places of each kind. */
export function variedPlaces(rows, limit=6) {
  const districts=new Map(),seen=new Set();
  for (const x of rows) {
    if(!x || !x.contentid || !String(x.title||'').trim() || !(x.firstimage||x.firstimage2) || seen.has(String(x.contentid)))continue;
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
