import test from 'node:test';
import assert from 'node:assert/strict';
import { createDataSources } from '../public/core/data-sources.js';

const gedikEmpty = '<html><body><h1>Halka Arz Takvimi</h1></body></html>';
const gedikNetgl = '<div>NETGL Net Global Endüstriyel Yatırımlar A.Ş. AKTİF 9-11 Eylül 2026 25,52 TL</div>';
const ahlatciNetgl = `
  <section>
    <a href="/halka-arz/net-global"><h3>Net Global Endüstriyel Yatırımlar A.Ş.</h3></a>
    <div>NETGL</div>
    <div>Halka Arz Fiyatı 25,52 ₺</div>
    <div>Talep Tarihleri 9-11 Eylül 2026</div>
    <div>Büyüklük 2.233.000.000 ₺</div>
    <div>Konsorsiyum Liderleri Tacirler Yatırım</div>
  </section>
  <h2>Tamamlanmış Halka Arzlar</h2>
`;

function makeSources({ gedik = gedikEmpty, ahlatci = ahlatciNetgl, failGedik = false, failAhlatci = false } = {}) {
  const requested = [];
  const sources = createDataSources({
    getJson: async () => ({}),
    getText: async url => {
      requested.push(url);
      if (url.includes('gedik.com')) {
        if (failGedik) throw new Error('gedik down');
        return gedik;
      }
      if (url.includes('ahlatciyatirim.com.tr/halka-arz?sayfa=1')) {
        if (failAhlatci) throw new Error('ahlatci down');
        return ahlatci;
      }
      return '';
    },
  });
  return { sources, requested };
}

test('calendar cross-check finds an IPO that Gedik missed but Ahlatci has', async () => {
  const { sources, requested } = makeSources();
  const out = await sources.getIpoCalendar();

  assert.deepEqual(out.map(item => item.ticker), ['NETGL']);
  assert.ok(requested.some(url => url.includes('gedik.com/halka-arz-takvimi')));
  assert.ok(requested.some(url => url.includes('ahlatciyatirim.com.tr/halka-arz?sayfa=1')));
});

test('calendar cross-check deduplicates the same IPO returned by both brokerages', async () => {
  const { sources } = makeSources({ gedik: gedikNetgl });
  const out = await sources.getIpoCalendar();

  assert.equal(out.filter(item => item.ticker === 'NETGL').length, 1);
  const item = out.find(row => row.ticker === 'NETGL');
  assert.equal(item.ipoPrice, 25.52);
  assert.match(String(item.source), /Gedik|Ahlatcı/);
});

test('calendar cross-check still returns the surviving source when one brokerage fails', async () => {
  const { sources } = makeSources({ failGedik: true });
  const out = await sources.getIpoCalendar();
  assert.deepEqual(out.map(item => item.ticker), ['NETGL']);
});

test('calendar cross-check fails instead of confirming an empty calendar when both sources are unavailable', async () => {
  const { sources } = makeSources({ failGedik: true, failAhlatci: true });
  await assert.rejects(() => sources.getIpoCalendar(), /takvim|kaynak|ulaşılamadı|başarısız/i);
});
