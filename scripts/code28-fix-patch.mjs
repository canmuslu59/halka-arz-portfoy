import fs from 'node:fs/promises';

async function replaceRequired(path, from, to) {
  const original = await fs.readFile(path, 'utf8');
  if (!original.includes(from)) throw new Error(`Expected source fragment not found in ${path}`);
  const next = original.replace(from, to);
  if (next === original) throw new Error(`Patch made no change in ${path}`);
  await fs.writeFile(path, next);
}

await replaceRequired(
  'server.js',
  `function profitPct(profit,cost){return cost>0?(profit/cost)*100:0;}\nasync function hydrateHolding(h){`,
  `const WITHHOLDING_RATE=0.175;\nfunction saleWithholding(quantity,price,cost){const q=Number(quantity),p=Number(price),c=Number(cost);if(!(q>0)||!(p>0)||!(c>0))return 0;return Math.max(0,q*(p-c))*WITHHOLDING_RATE;}\nfunction profitPct(profit,cost){return cost>0?(profit/cost)*100:0;}\nasync function hydrateHolding(h){`,
);

await replaceRequired(
  'server.js',
  `  const invested=ipoPrice!=null?initialLots*ipoPrice:null, activeValue=current!=null?currentLots*current:null, salesProceeds=sales.reduce((s,x)=>s+Number(x.lots||0)*Number(x.price||0),0);\n  const realizedProfit=ipoPrice!=null?sales.reduce((s,x)=>s+Number(x.lots||0)*(Number(x.price||0)-ipoPrice),0):null;\n  const unrealizedProfit=current!=null&&ipoPrice!=null?currentLots*(current-ipoPrice):null; const totalProfit=realizedProfit!=null&&unrealizedProfit!=null?realizedProfit+unrealizedProfit:null; const totalWealth=activeValue!=null?activeValue+salesProceeds:null;`,
  `  const invested=ipoPrice!=null?initialLots*ipoPrice:null, activeValue=current!=null?currentLots*current:null, grossSalesProceeds=sales.reduce((s,x)=>s+Number(x.lots||0)*Number(x.price||0),0);\n  const grossRealizedProfit=ipoPrice!=null?sales.reduce((s,x)=>s+Number(x.lots||0)*(Number(x.price||0)-ipoPrice),0):null;\n  const withholdingTax=ipoPrice!=null?sales.reduce((s,x)=>s+saleWithholding(x.lots,x.price,ipoPrice),0):0;\n  const salesProceeds=grossSalesProceeds-withholdingTax;\n  const realizedProfit=grossRealizedProfit==null?null:grossRealizedProfit-withholdingTax;\n  const unrealizedProfit=current!=null&&ipoPrice!=null?currentLots*(current-ipoPrice):null; const totalProfit=realizedProfit!=null&&unrealizedProfit!=null?realizedProfit+unrealizedProfit:null; const totalWealth=activeValue!=null?activeValue+salesProceeds:null;`,
);

await replaceRequired(
  'server.js',
  `  return {...h,ticker:cleanTicker(h.ticker),company:fetchedIpo?.company||null,source:fetchedIpo?.source||null,ipoPrice,firstTradeDate,offerDates:fetchedIpo?.offerDates||null,currentPrice:current,previousClose,marketTime:market?.marketTime||null,invested,activeValue,salesProceeds,totalWealth,realizedProfit,unrealizedProfit,totalProfit,totalProfitPct:invested!=null&&totalProfit!=null?profitPct(totalProfit,invested):null,dailyProfit,dailyPct,history:market?.history||[],errors:{market:mr.status==='rejected'?(mr.reason?.message||'Fiyat verisi alınamadı.'):null,ipo:ipoPrice==null?'Halka arz fiyatı otomatik bulunamadı.':null}};`,
  `  return {...h,ticker:cleanTicker(h.ticker),company:fetchedIpo?.company||null,source:fetchedIpo?.source||null,ipoPrice,firstTradeDate,offerDates:fetchedIpo?.offerDates||null,currentPrice:current,previousClose,marketTime:market?.marketTime||null,invested,activeValue,grossSalesProceeds,withholdingTax,salesProceeds,totalWealth,grossRealizedProfit,realizedProfit,unrealizedProfit,totalProfit,totalProfitPct:invested!=null&&totalProfit!=null?profitPct(totalProfit,invested):null,dailyProfit,dailyPct,history:market?.history||[],errors:{market:mr.status==='rejected'?(mr.reason?.message||'Fiyat verisi alınamadı.'):null,ipo:ipoPrice==null?'Halka arz fiyatı otomatik bulunamadı.':null}};`,
);

await replaceRequired(
  'server.js',
  `      let soldLots=0,proceeds=0;\n      for(const sale of sales){if(sale.date>row.date)break;soldLots+=sale.lots;proceeds+=sale.lots*sale.price;}\n      const activeLots=Math.max(0,initialLots-soldLots);\n      if(!byDate.has(row.date))byDate.set(row.date,{date:row.date,value:0,cost:0});\n      const p=byDate.get(row.date);\n      p.value+=Number(row.close)*activeLots+proceeds;`,
  `      let soldLots=0,netProceeds=0;\n      for(const sale of sales){if(sale.date>row.date)break;soldLots+=sale.lots;netProceeds+=sale.lots*sale.price-saleWithholding(sale.lots,sale.price,ipoPrice);}\n      const activeLots=Math.max(0,initialLots-soldLots);\n      if(!byDate.has(row.date))byDate.set(row.date,{date:row.date,value:0,cost:0});\n      const p=byDate.get(row.date);\n      p.value+=Number(row.close)*activeLots+netProceeds;`,
);
