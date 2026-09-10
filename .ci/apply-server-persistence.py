from pathlib import Path

path = Path('server.js')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    text = text.replace(old, new, 1)


def replace_section(start: str, end: str, replacement: str, label: str):
    global text
    start_at = text.find(start)
    if start_at < 0:
        raise SystemExit(f'{label}: start marker missing')
    end_at = text.find(end, start_at + len(start))
    if end_at < 0:
        raise SystemExit(f'{label}: end marker missing')
    text = text[:start_at] + replacement + '\n' + text[end_at:]


replace_once(
    "import { fileURLToPath } from 'node:url';\n",
    "import { fileURLToPath } from 'node:url';\nimport { createPortfolioStore } from './backend/portfolio-store.js';\n",
    'portfolio store import',
)
replace_once(
    "const DATA_FILE = path.join(__dirname, 'data', 'portfolio.json');",
    "const DATA_FILE = process.env.PORTFOLIO_DATA_FILE ? path.resolve(process.env.PORTFOLIO_DATA_FILE) : path.join(__dirname, 'data', 'portfolio.json');",
    'injectable data path',
)

read_start = 'async function readPortfolio() {'
fetch_start = 'async function fetchText(url, timeoutMs=12000) {'
start_at = text.find(read_start)
end_at = text.find(fetch_start, start_at)
if start_at < 0 or end_at < 0:
    raise SystemExit('legacy persistence block markers missing')
text = text[:start_at] + "const portfolioStore = createPortfolioStore({ filePath: DATA_FILE });\nconst readPortfolio = portfolioStore.read;\nconst mutatePortfolio = portfolioStore.mutate;\n" + text[end_at:]

post_start = "    if(url.pathname==='/api/holdings'&&method==='POST'){"
patch_start = "    if((m=url.pathname.match(/^\\/api\\/holdings\\/([^/]+)$/))&&method==='PATCH'){"
replace_section(post_start, patch_start, """    if(url.pathname==='/api/holdings'&&method==='POST'){
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
    }""", 'POST holdings route')

sales_start = "    if((m=url.pathname.match(/^\\/api\\/holdings\\/([^/]+)\\/sales$/))&&method==='POST'){"
replace_section(patch_start, sales_start, """    if((m=url.pathname.match(/^\\/api\\/holdings\\/([^/]+)$/))&&method==='PATCH'){
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
    }""", 'PATCH holdings route')

delete_start = "    if((m=url.pathname.match(/^\\/api\\/holdings\\/([^/]+)$/))&&method==='DELETE'){"
replace_section(sales_start, delete_start, """    if((m=url.pathname.match(/^\\/api\\/holdings\\/([^/]+)\\/sales$/))&&method==='POST'){
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
    }""", 'POST sales route')

api_fallback = "    if(url.pathname.startsWith('/api/'))return json(res,404,{error:'API yolu bulunamadı.'});"
replace_section(delete_start, api_fallback, """    if((m=url.pathname.match(/^\\/api\\/holdings\\/([^/]+)$/))&&method==='DELETE'){
      await mutatePortfolio(data=>{
        const before=data.holdings.length;
        data.holdings=data.holdings.filter(item=>item.id!==m[1]);
        if(data.holdings.length===before)throw new HttpError(404,'Kayıt bulunamadı.');
      });
      return json(res,200,{ok:true});
    }""", 'DELETE holdings route')

path.write_text(text, encoding='utf-8')
