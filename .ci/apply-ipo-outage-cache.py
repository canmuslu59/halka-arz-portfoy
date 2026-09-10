from pathlib import Path

path = Path('server.js')
text = path.read_text(encoding='utf-8')
old = """async function fetchIpo(ticker){
  const key=cleanTicker(ticker),cached=ipoCache.get(key); if(cached&&Date.now()-cached.at<CACHE_IPO_MS)return cached.data;
  let found=null;
  try {
    const firstPage=await fetchText('https://www.ahlatciyatirim.com.tr/halka-arz?sayfa=1',7000);
    found=parseAhlatciList(firstPage,key);
  } catch {}
  if(!found){
    const pages=await Promise.allSettled(Array.from({length:11},(_,i)=>fetchText(`https://www.ahlatciyatirim.com.tr/halka-arz?sayfa=${i+2}`,7000)));
    for(const page of pages){
      if(page.status!=='fulfilled') continue;
      found=parseAhlatciList(page.value,key);
      if(found) break;
    }
  }
  if(found?.detailUrl){ try{found=parseAhlatciDetail(await fetchText(found.detailUrl),found);}catch(e){console.warn('IPO detay:',e.message);} }
  if(!found){
    try{ const text=textFromHtml(await fetchText('https://www.fibabanka.com.tr/yatirim-rehberi/halka-arz')); const idx=text.toUpperCase().indexOf(key); if(idx>=0){const near=text.slice(Math.max(0,idx-200),idx+450);const pm=near.match(/([0-9]{1,5}(?:[.,][0-9]{1,4})?)\\s*TL/i);found={ticker:key,company:null,ipoPrice:pm?numTR(pm[1]):null,firstTradeDate:null,offerDates:null,source:'Fibabanka'};}}catch{}
  }
  if(!found)found={ticker:key,company:null,ipoPrice:null,firstTradeDate:null,offerDates:null,source:null}; ipoCache.set(key,{at:Date.now(),data:found}); return found;
}
"""
new = """async function fetchIpo(ticker){
  const key=cleanTicker(ticker),cached=ipoCache.get(key); if(cached&&Date.now()-cached.at<CACHE_IPO_MS)return cached.data;
  let found=null;
  let ahlatciScanComplete=true;
  try {
    const firstPage=await fetchText('https://www.ahlatciyatirim.com.tr/halka-arz?sayfa=1',7000);
    found=parseAhlatciList(firstPage,key);
  } catch { ahlatciScanComplete=false; }
  if(!found){
    const pages=await Promise.allSettled(Array.from({length:11},(_,i)=>fetchText(`https://www.ahlatciyatirim.com.tr/halka-arz?sayfa=${i+2}`,7000)));
    for(const page of pages){
      if(page.status!=='fulfilled') { ahlatciScanComplete=false; continue; }
      found=parseAhlatciList(page.value,key);
      if(found) break;
    }
  }
  if(found?.detailUrl){ try{found=parseAhlatciDetail(await fetchText(found.detailUrl),found);}catch(e){console.warn('IPO detay:',e.message);} }
  if(!found){
    try{ const text=textFromHtml(await fetchText('https://www.fibabanka.com.tr/yatirim-rehberi/halka-arz')); const idx=text.toUpperCase().indexOf(key); if(idx>=0){const near=text.slice(Math.max(0,idx-200),idx+450);const pm=near.match(/([0-9]{1,5}(?:[.,][0-9]{1,4})?)\\s*TL/i);found={ticker:key,company:null,ipoPrice:pm?numTR(pm[1]):null,firstTradeDate:null,offerDates:null,source:'Fibabanka'};}}catch{}
  }
  if(!found&&!ahlatciScanComplete) throw new Error('Halka arz kaynaklarına ulaşılamadı.');
  if(!found)found={ticker:key,company:null,ipoPrice:null,firstTradeDate:null,offerDates:null,source:null}; ipoCache.set(key,{at:Date.now(),data:found}); return found;
}
"""
if text.count(old) != 1:
    raise SystemExit(f'fetchIpo guard mismatch: {text.count(old)}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
