import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createPortfolioStore } from './backend/portfolio-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const APP_PIN = String(process.env.APP_PIN || '').trim();
const DATA_FILE = process.env.PORTFOLIO_DATA_FILE ? path.resolve(process.env.PORTFOLIO_DATA_FILE) : path.join(__dirname, 'data', 'portfolio.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const marketCache = new Map();
const ipoCache = new Map();
const CACHE_MARKET_MS = 45_000;
const CACHE_IPO_MS = 6 * 60 * 60 * 1000;

function cleanTicker(value) {
  return String(value || '').toUpperCase().replace(/\.IS$/i, '').replace(/\.E$/i, '').replace(/[^A-Z0-9]/g, '').slice(0, 8);
}
function numTR(value) {
  if (value == null) return null;
  let s = String(value).trim().replace(/\s/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}
function decodeHtml(s='') {
  return s.replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&uuml;/gi,'ü').replace(/&ouml;/gi,'ö').replace(/&ccedil;/gi,'ç').replace(/&Uuml;/g,'Ü').replace(/&Ouml;/g,'Ö').replace(/&Ccedil;/g,'Ç').replace(/&#8378;/g,'₺');
}
function textFromHtml(s='') { return decodeHtml(s.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()); }
function isoFromTurkishDate(text) {
  if (!text) return null;
  const months = { ocak:1, şubat:2, subat:2, mart:3, nisan:4, mayıs:5, mayis:5, haziran:6, temmuz:7, ağustos:8, agustos:8, eylül:9, eylul:9, ekim:10, kasım:11, kasim:11, aralık:12, aralik:12 };
  const m = String(text).toLocaleLowerCase('tr-TR').match(/(\d{1,2})\s+([a-zçğıöşü]+)\s+(20\d{2})/i);
  if (!m) return null;
  const month = months[m[2].toLocaleLowerCase('tr-TR')];
  return month ? `${m[3]}-${String(month).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}` : null;
}
const portfolioStore = createPortfolioStore({ filePath: DATA_FILE });
const readPortfolio = portfolioStore.read;
const mutatePortfolio = portfolioStore.mutate;
async function fetchText(url, timeoutMs=12000) {
  const c=new AbortController(); const t=setTimeout(()=>c.abort(),timeoutMs);
  try { const r=await fetch(url,{signal:c.signal,headers:{'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36','accept-language':'tr-TR,tr;q=0.9,en;q=0.8'}}); if(!r.ok) throw new Error(`HTTP ${r.status}`); return await r.text(); }
  finally { clearTimeout(t); }
}
async function fetchJson(url, timeoutMs=12000) {
  const c=new AbortController(); const t=setTimeout(()=>c.abort(),timeoutMs);
  try { const r=await fetch(url,{signal:c.signal,headers:{'user-agent':'Mozilla/5.0 Chrome/151 Safari/537.36',accept:'application/json,text/plain,*/*'}}); if(!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); }
  finally { clearTimeout(t); }
}
async function fetchMarket(ticker) {
  const key=cleanTicker(ticker), cached=marketCache.get(key);
  if(cached && Date.now()-cached.at<CACHE_MARKET_MS) return cached.data;
  const symbol=`${key}.IS`;
  const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d&includePrePost=false&events=div%2Csplits`;
  const json=await fetchJson(url); const result=json?.chart?.result?.[0]; if(!result) throw new Error('Fiyat verisi bulunamadı.');
  const meta=result.meta||{}, timestamps=result.timestamp||[], quote=result.indicators?.quote?.[0]||{}; const rows=[];
  for(let i=0;i<timestamps.length;i++){ const close=quote.close?.[i]; if(!Number.isFinite(close)) continue; rows.push({date:new Date(timestamps[i]*1000).toISOString().slice(0,10),close,high:Number.isFinite(quote.high?.[i])?quote.high[i]:null,low:Number.isFinite(quote.low?.[i])?quote.low[i]:null,open:Number.isFinite(quote.open?.[i])?quote.open[i]:null}); }
  const lastClose=rows.at(-1)?.close??null;
  const prevClose=Number.isFinite(meta.chartPreviousClose)?meta.chartPreviousClose:(rows.length>1?rows.at(-2).close:lastClose);
  const current=Number.isFinite(meta.regularMarketPrice)?meta.regularMarketPrice:lastClose;
  const data={ticker:key,symbol,currency:meta.currency||'TRY',current,previousClose:prevClose,marketTime:meta.regularMarketTime?new Date(meta.regularMarketTime*1000).toISOString():null,exchangeName:meta.fullExchangeName||meta.exchangeName||'BIST',history:rows};
  marketCache.set(key,{at:Date.now(),data}); return data;
}
function parseAhlatciList(html,ticker){
  const rows=html.match(/<tr\b[\s\S]*?<\/tr>/gi)||[];
  for(const row of rows){
    const text=textFromHtml(row); if(!new RegExp(`\\b${ticker}\\b`,'i').test(text)) continue;
    const cells=[...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>textFromHtml(m[1]));
    const hrefMatch=row.match(/href=["']([^"']+)["']/i); const priceCell=cells.find(v=>/[₺]/.test(v))||text;
    const pm=priceCell.match(/([0-9]{1,5}(?:[.,][0-9]{1,4})?)\s*₺/);
    return {ticker,company:(cells[0]||'').replace(new RegExp(`\\s*${ticker}\\s*$`,'i'),'').trim()||null,ipoPrice:pm?numTR(pm[1]):null,offerDates:cells[3]||null,detailUrl:hrefMatch?new URL(hrefMatch[1],'https://www.ahlatciyatirim.com.tr').href:null,source:'Ahlatcı Yatırım'};
  }
  return null;
}
function parseAhlatciDetail(html,base={}){
  const text=textFromHtml(html); const h1=html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const company=h1?textFromHtml(h1[1]):base.company||null;
  let ipoPrice=base.ipoPrice??null, firstTradeDate=null, offerDates=base.offerDates||null;
  const priceMatch=text.match(/Halka Arz Fiyatı\s*([0-9.]+,[0-9]+)\s*₺/i)||text.match(/fiyat\s*([0-9.]+,[0-9]+)\s*₺\s*olarak/i); if(priceMatch) ipoPrice=numTR(priceMatch[1]);
  const tradeMatch=text.match(/İlk İşlem(?: Tarihi)?:?\s*(\d{1,2}\s+[A-Za-zÇĞİÖŞÜçğıöşü]+\s+20\d{2})/i); if(tradeMatch) firstTradeDate=isoFromTurkishDate(tradeMatch[1]);
  const offerMatch=text.match(/Talep Tarihleri\s*([^₺]{3,45}?20\d{2})/i); if(offerMatch) offerDates=offerMatch[1].trim();
  return {...base,company,ipoPrice,firstTradeDate,offerDates,source:'Ahlatcı Yatırım'};
}
async function fetchIpo(ticker){
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
    try{ const text=textFromHtml(await fetchText('https://www.fibabanka.com.tr/yatirim-rehberi/halka-arz')); const idx=text.toUpperCase().indexOf(key); if(idx>=0){const near=text.slice(Math.max(0,idx-200),idx+450);const pm=near.match(/([0-9]{1,5}(?:[.,][0-9]{1,4})?)\s*TL/i);found={ticker:key,company:null,ipoPrice:pm?numTR(pm[1]):null,firstTradeDate:null,offerDates:null,source:'Fibabanka'};}}catch{}
  }
  if(!found)found={ticker:key,company:null,ipoPrice:null,firstTradeDate:null,offerDates:null,source:null}; ipoCache.set(key,{at:Date.now(),data:found}); return found;
}
function profitPct(profit,cost){return cost>0?(profit/cost)*100:0;}
async function hydrateHolding(h){
  const [mr,ir]=await Promise.allSettled([fetchMarket(h.ticker),fetchIpo(h.ticker)]); const market=mr.status==='fulfilled'?mr.value:null,fetchedIpo=ir.status==='fulfilled'?ir.value:null;
  const ipoPrice=Number(h.ipoPriceOverride)>0?Number(h.ipoPriceOverride):fetchedIpo?.ipoPrice; const firstTradeDate=h.firstTradeDateOverride||fetchedIpo?.firstTradeDate||null;
  const initialLots=Number(h.initialLots||h.currentLots||0), currentLots=Number(h.currentLots||0), sales=Array.isArray(h.sales)?h.sales:[], current=market?.current??null, previousClose=market?.previousClose??null;
  const invested=ipoPrice!=null?initialLots*ipoPrice:null, activeValue=current!=null?currentLots*current:null, salesProceeds=sales.reduce((s,x)=>s+Number(x.lots||0)*Number(x.price||0),0);
  const realizedProfit=ipoPrice!=null?sales.reduce((s,x)=>s+Number(x.lots||0)*(Number(x.price||0)-ipoPrice),0):null;
  const unrealizedProfit=current!=null&&ipoPrice!=null?currentLots*(current-ipoPrice):null; const totalProfit=realizedProfit!=null&&unrealizedProfit!=null?realizedProfit+unrealizedProfit:null; const totalWealth=activeValue!=null?activeValue+salesProceeds:null;
  const dailyProfit=current!=null&&previousClose!=null?currentLots*(current-previousClose):null; const dailyPct=current!=null&&previousClose>0?((current-previousClose)/previousClose)*100:null;
  return {...h,ticker:cleanTicker(h.ticker),company:fetchedIpo?.company||null,source:fetchedIpo?.source||null,ipoPrice,firstTradeDate,offerDates:fetchedIpo?.offerDates||null,currentPrice:current,previousClose,marketTime:market?.marketTime||null,invested,activeValue,salesProceeds,totalWealth,realizedProfit,unrealizedProfit,totalProfit,totalProfitPct:invested!=null&&totalProfit!=null?profitPct(totalProfit,invested):null,dailyProfit,dailyPct,history:market?.history||[],errors:{market:mr.status==='rejected'?(mr.reason?.message||'Fiyat verisi alınamadı.'):null,ipo:ipoPrice==null?'Halka arz fiyatı otomatik bulunamadı.':null}};
}
function makePortfolioHistory(holdings){
  const byDate=new Map();
  for(const h of holdings){if(!h.ipoPrice||!h.initialLots||!Array.isArray(h.history))continue;const start=h.firstTradeDate||h.history[0]?.date;for(const row of h.history){if(start&&row.date<start)continue;if(!byDate.has(row.date))byDate.set(row.date,{date:row.date,value:0,cost:0});const p=byDate.get(row.date);p.value+=Number(row.close)*Number(h.currentLots||0);p.cost+=Number(h.ipoPrice)*Number(h.currentLots||0);}}
  return [...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(x=>({...x,profit:x.value-x.cost}));
}
function json(res,status,data){const body=JSON.stringify(data);res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(body);}
class HttpError extends Error {
  constructor(statusCode, message) { super(message); this.statusCode = statusCode; }
}
async function readBody(req){
  let raw='';
  for await(const chunk of req){
    raw+=chunk;
    if(raw.length>131072) throw new HttpError(413,'İstek çok büyük.');
  }
  if(!raw) return {};
  try { return JSON.parse(raw); }
  catch { throw new HttpError(400,'Geçersiz JSON gövdesi.'); }
}
function authorized(req){if(!APP_PIN)return true;return String(req.headers['x-app-pin']||'')===APP_PIN;}
async function portfolioResponse(){
  const data=await readPortfolio();const holdings=await Promise.all(data.holdings.map(hydrateHolding));
  const sums=holdings.reduce((a,h)=>{for(const k of ['invested','activeValue','salesProceeds','totalWealth','totalProfit','realizedProfit','unrealizedProfit','dailyProfit'])if(Number.isFinite(h[k]))a[k]+=h[k];return a;},{invested:0,activeValue:0,salesProceeds:0,totalWealth:0,totalProfit:0,realizedProfit:0,unrealizedProfit:0,dailyProfit:0});
  sums.totalProfitPct=sums.invested>0?(sums.totalProfit/sums.invested)*100:0;const dailyBase=holdings.reduce((s,h)=>s+(Number.isFinite(h.previousClose)?h.previousClose*Number(h.currentLots||0):0),0);sums.dailyPct=dailyBase>0?(sums.dailyProfit/dailyBase)*100:0;
  return {holdings,totals:sums,history:makePortfolioHistory(holdings),updatedAt:new Date().toISOString()};
}
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
async function serveStatic(req,res,url){
  let pathname;
  try { pathname=decodeURIComponent(url.pathname); } catch { return false; }
  if(pathname==='/'||!path.extname(pathname))pathname='/index.html';
  const root=path.resolve(PUBLIC_DIR);
  const file=path.resolve(root, `.${pathname}`);
  if(file!==root && !file.startsWith(root+path.sep))return false;
  try{const buf=await fs.readFile(file);res.writeHead(200,{'content-type':MIME[path.extname(file)]||'application/octet-stream','cache-control':pathname==='/index.html'?'no-cache':'public, max-age=3600'});res.end(buf);return true;}catch{return false;}
}

const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`); const method=req.method||'GET';
  try{
    if(url.pathname==='/api/health'&&method==='GET')return json(res,200,{ok:true,auth:Boolean(APP_PIN),now:new Date().toISOString()});
    if(url.pathname.startsWith('/api/')&&!authorized(req))return json(res,401,{error:'PIN_REQUIRED',message:'Uygulama PIN kodu gerekli.'});
    let m;
    if((m=url.pathname.match(/^\/api\/lookup\/([^/]+)$/))&&method==='GET'){
      const ticker=cleanTicker(m[1]);if(!ticker)return json(res,400,{error:'Geçerli bir hisse kodu girin.'});const [market,ipo]=await Promise.allSettled([fetchMarket(ticker),fetchIpo(ticker)]);return json(res,200,{ticker,market:market.status==='fulfilled'?market.value:null,ipo:ipo.status==='fulfilled'?ipo.value:null,warnings:[market.status==='rejected'?market.reason?.message:null,ipo.status==='rejected'?ipo.reason?.message:null].filter(Boolean)});
    }
    if(url.pathname==='/api/portfolio'&&method==='GET')return json(res,200,await portfolioResponse());
    if(url.pathname==='/api/holdings'&&method==='POST'){
      const body=await readBody(req),ticker=cleanTicker(body.ticker),lots=Number(body.lots);
      if(!ticker||!Number.isInteger(lots)||lots<=0)return json(res,400,{error:'Hisse kodu ve 0’dan büyük tam lot sayısı gerekli.'});
      const lookup=await Promise.allSettled([fetchMarket(ticker),fetchIpo(ticker)]);
      if(lookup[0].status!=='fulfilled')return json(res,404,{error:`${ticker} için BIST fiyat verisi bulunamadı. Kod doğru mu?`});
      const ipo=lookup[1].status==='fulfilled'?lookup[1].value:null;
      const h=await mutatePortfolio(data=>{
        if(data.holdings.some(item=>cleanTicker(item.ticker)===ticker))throw new HttpError(409,`${ticker} zaten portföyde.`);
        const holding={id:crypto.randomUUID(),ticker,initialLots:lots,currentLots:lots,addedAt:new Date().toISOString(),ipoPriceOverride:Number(body.ipoPriceOverride)>0?Number(body.ipoPriceOverride):null,firstTradeDateOverride:body.firstTradeDateOverride||null,sales:[]};
        data.holdings.push(holding);
        return holding;
      });
      return json(res,201,{holding:await hydrateHolding(h),autoIpoFound:Boolean(ipo?.ipoPrice)});
    }
    if((m=url.pathname.match(/^\/api\/holdings\/([^/]+)$/))&&method==='PATCH'){
      const body=await readBody(req);
      const h=await mutatePortfolio(data=>{
        const idx=data.holdings.findIndex(item=>item.id===m[1]);
        if(idx<0)throw new HttpError(404,'Kayıt bulunamadı.');
        const holding=data.holdings[idx];
        if(body.ipoPriceOverride===null||Number(body.ipoPriceOverride)>0)holding.ipoPriceOverride=body.ipoPriceOverride===null?null:Number(body.ipoPriceOverride);
        if(typeof body.firstTradeDateOverride==='string'||body.firstTradeDateOverride===null)holding.firstTradeDateOverride=body.firstTradeDateOverride;
        if(Number.isInteger(Number(body.currentLots))&&Number(body.currentLots)>=0)holding.currentLots=Number(body.currentLots);
        data.holdings[idx]=holding;
        return holding;
      });
      return json(res,200,{holding:await hydrateHolding(h)});
    }
    if((m=url.pathname.match(/^\/api\/holdings\/([^/]+)\/sales$/))&&method==='POST'){
      const body=await readBody(req),lots=Number(body.lots),price=Number(body.price),date=String(body.date||new Date().toISOString().slice(0,10));
      if(!Number.isInteger(lots)||lots<=0||!Number.isFinite(price)||price<=0)return json(res,400,{error:'Satış lotu ve fiyatı geçerli olmalı.'});
      const h=await mutatePortfolio(data=>{
        const holding=data.holdings.find(item=>item.id===m[1]);
        if(!holding)throw new HttpError(404,'Kayıt bulunamadı.');
        if(lots>Number(holding.currentLots||0))throw new HttpError(400,'Satış lotu mevcut lottan fazla olamaz.');
        holding.sales||=[];
        holding.sales.push({id:crypto.randomUUID(),lots,price,date,createdAt:new Date().toISOString()});
        holding.currentLots=Number(holding.currentLots)-lots;
        return holding;
      });
      return json(res,200,{holding:await hydrateHolding(h)});
    }
    if((m=url.pathname.match(/^\/api\/holdings\/([^/]+)$/))&&method==='DELETE'){
      await mutatePortfolio(data=>{
        const before=data.holdings.length;
        data.holdings=data.holdings.filter(item=>item.id!==m[1]);
        if(data.holdings.length===before)throw new HttpError(404,'Kayıt bulunamadı.');
      });
      return json(res,200,{ok:true});
    }
    if(url.pathname.startsWith('/api/'))return json(res,404,{error:'API yolu bulunamadı.'});
    if(await serveStatic(req,res,url))return; res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});res.end('Bulunamadı');
  }catch(e){const status=Number.isInteger(e?.statusCode)?e.statusCode:500;if(status>=500)console.error(e);json(res,status,{error:e?.message||'Sunucu hatası.'});}
});
server.listen(PORT,'0.0.0.0',()=>console.log(`Halka Arz Portföyü: http://localhost:${PORT}`));
