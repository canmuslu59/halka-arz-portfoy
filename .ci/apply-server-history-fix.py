from pathlib import Path

path = Path('server.js')
text = path.read_text(encoding='utf-8')
old = """function makePortfolioHistory(holdings){
  const byDate=new Map();
  for(const h of holdings){if(!h.ipoPrice||!h.initialLots||!Array.isArray(h.history))continue;const start=h.firstTradeDate||h.history[0]?.date;for(const row of h.history){if(start&&row.date<start)continue;if(!byDate.has(row.date))byDate.set(row.date,{date:row.date,value:0,cost:0});const p=byDate.get(row.date);p.value+=Number(row.close)*Number(h.currentLots||0);p.cost+=Number(h.ipoPrice)*Number(h.currentLots||0);}}
  return [...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(x=>({...x,profit:x.value-x.cost}));
}"""
new = """function makePortfolioHistory(holdings){
  const byDate=new Map();
  for(const h of holdings){
    if(!h.ipoPrice||!h.initialLots||!Array.isArray(h.history))continue;
    const start=h.firstTradeDate||h.history[0]?.date;
    if(!start)continue;
    const initialLots=Number(h.initialLots||0),ipoPrice=Number(h.ipoPrice);
    const sales=(Array.isArray(h.sales)?h.sales:[])
      .filter(s=>s&&typeof s.date==='string'&&Number(s.lots)>0&&Number(s.price)>0)
      .map(s=>({date:s.date,lots:Number(s.lots),price:Number(s.price)}))
      .sort((a,b)=>a.date.localeCompare(b.date));
    for(const row of h.history){
      if(!row?.date||row.date<start||!Number.isFinite(Number(row.close)))continue;
      let soldLots=0,proceeds=0;
      for(const sale of sales){if(sale.date>row.date)break;soldLots+=sale.lots;proceeds+=sale.lots*sale.price;}
      const activeLots=Math.max(0,initialLots-soldLots);
      if(!byDate.has(row.date))byDate.set(row.date,{date:row.date,value:0,cost:0});
      const p=byDate.get(row.date);
      p.value+=Number(row.close)*activeLots+proceeds;
      p.cost+=ipoPrice*initialLots;
    }
  }
  return [...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(x=>({...x,profit:x.value-x.cost}));
}"""
count = text.count(old)
if count != 1:
    raise SystemExit(f'expected exactly one old makePortfolioHistory block, found {count}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
