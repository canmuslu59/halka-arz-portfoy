import { createRepository, createPlatformStorage } from './core/repository.js';
import { calculateJournal, normalizeJournal, validateJournalRow, LAB_LEDGER_STORAGE_KEY } from './core/lab-ledger.js';

let info={};
try {info=JSON.parse(window.AndroidBridge?.getAppInfo?.() || '{}');}catch{}
const isLab=info.packageName==='com.innative.halkaarz.lab' && String(info.versionName||'').includes('lab');

if(isLab){
  const native=window.AndroidBridge;
  const repo=createRepository(createPlatformStorage());
  const $=selector=>document.querySelector(selector);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(n);
  const qty=n=>new Intl.NumberFormat('tr-TR',{maximumFractionDigits:3}).format(n);
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const uid=()=>crypto.randomUUID?.() || 'lab-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  const modeKey='portfolio_management_lab_entitlement_v1';
  const notice=s=>{$('#labNotice').textContent=String(s);$('#labNotice').hidden=false;};
  const load=()=>{
    let rows;
    try {rows=JSON.parse(localStorage.getItem(LAB_LEDGER_STORAGE_KEY)||'[]');}
    catch{throw Error('İşlem defteri JSON verisi bozuk. Yedeği geri yükleyin.');}
    return normalizeJournal(rows);
  };
  const save=rows=>{
    const valid=normalizeJournal(rows);
    calculateJournal(valid);
    localStorage.setItem(LAB_LEDGER_STORAGE_KEY,JSON.stringify(valid));
  };
  const label={BUY:'Alım',SELL:'Satım',DIVIDEND:'Temettü',SPLIT:'Bölünme',FEE:'Masraf'};
  const mode=()=>localStorage.getItem(modeKey)||'free';

  function render(){
    for(const b of document.querySelectorAll('[data-lab-mode]')){
      const yes=b.dataset.labMode===mode();
      b.classList.toggle('lab-selected',yes);
      b.setAttribute('aria-pressed',String(yes));
    }
    $('#labEntitlement').textContent=({
      free:'Ücretsiz mod: gelişmiş ekran deneme erişimi kapalı.',
      trial:'Deneme modu: Lab paketinde gelişmiş alan açık.',
      premium:'Premium test aktif: gerçek satın alma veya abonelik yok.',
    })[mode()]||'';
    const rows=load();
    const report=calculateJournal(rows);
    const metrics=[
      ['Gerçekleşen net',money(report.totals.realized)],
      ['Açık maliyet',money(report.totals.bookCost)],
      ['Temettü',money(report.totals.dividends)],
      ['Komisyon/masraf',money(report.totals.fees)]
    ];
    $('#labSummary').innerHTML=metrics.map(x=>'<div><span>'+x[0]+'</span><strong>'+x[1]+'</strong></div>').join('');
    $('#labPositions').innerHTML=report.positions.length
      ?report.positions.map(p=>'<div class="lab-position"><strong>'+escape(p.ticker)+'</strong><span>'+qty(p.lots)+' lot · Ort. '+money(p.averageCost)+'</span><b>'+money(p.realized)+'</b></div>').join('')
      :'<p>Önce bir alım kaydı girerek başlayın.</p>';
    $('#labEntries').innerHTML=rows.length
      ?[...rows].sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id)).slice(0,80).map(x=>
        '<div class="lab-entry"><div><b>'+escape(x.ticker)+' · '+label[x.type]+'</b><small>'+
        escape(x.date)+' · '+(x.type==='SPLIT'?x.numerator+':'+x.denominator:
        x.type==='BUY'||x.type==='SELL'?qty(x.lots)+' lot × '+money(x.price):money(x.amount))+
        '</small></div><button type="button" data-lab-delete="'+escape(x.id)+'">Sil</button></div>'
      ).join(''):'<p>Henüz kayıt yok.</p>';
  }
  function open(value){
    $('#labOverlay').hidden=!value;
    document.body.classList.toggle('lab-modal-open',value);
    if(value){
      $('#labJournalForm').elements.date.value=today();
      try{render();}catch(e){notice(e.message);}
    }
  }
  $('#labSettingsCard').hidden=false;
  $('#labOpen').addEventListener('click',()=>open(true));
  $('#labClose').addEventListener('click',()=>open(false));
  $('#labOverlay').addEventListener('click',e=>{if(e.target===$('#labOverlay'))open(false);});
  $('#labOverlay').addEventListener('keydown',e=>{if(e.key==='Escape')open(false);});
  document.querySelectorAll('[data-lab-mode]').forEach(b=>b.addEventListener('click',()=>{
    const next=b.dataset.labMode;
    if(!['free','trial','premium'].includes(next))return;
    localStorage.setItem(modeKey,next);
    render();
    notice(next==='premium'?'Premium simülasyonu etkin. Ödeme alınmadı.':'Lab erişim modu güncellendi.');
  }));
  const type=$('#labType');
  type.addEventListener('change',()=>{
    $('#labTradeFields').hidden=!['BUY','SELL'].includes(type.value);
    $('#labAmountFields').hidden=!['DIVIDEND','FEE'].includes(type.value);
    $('#labSplitFields').hidden=type.value!=='SPLIT';
  });
  $('#labJournalForm').addEventListener('submit',event=>{
    event.preventDefault();
    const form=event.currentTarget;
    const row=Object.fromEntries(new FormData(form));
    try{
      save([...load(),validateJournalRow({...row,id:uid(),ticker:String(row.ticker).toUpperCase()})]);
      const last=String(row.ticker).toUpperCase();
      form.reset();
      form.elements.ticker.value=last;
      form.elements.date.value=today();
      type.dispatchEvent(new Event('change'));
      render();
      notice('İşlem kaydedildi.');
    }catch(e){notice(e.message);}
  });
  $('#labEntries').addEventListener('click',e=>{
    const b=e.target.closest('[data-lab-delete]');
    if(!b || !confirm('Bu kayıt silinsin mi?'))return;
    try{save(load().filter(x=>x.id!==b.dataset.labDelete));render();notice('Kayıt silindi.');}
    catch(err){notice(err.message);}
  });
  $('#labDemo').addEventListener('click',()=>{
    try{
      if(load().some(x=>x.ticker==='DEMO')){notice('DEMO örneği zaten mevcut.');return;}
      const d=today();
      save([...load(),
        {id:uid(),ticker:'DEMO',type:'BUY',date:d,lots:10,price:100,fee:2},
        {id:uid(),ticker:'DEMO',type:'DIVIDEND',date:d,amount:15},
      ]);
      render();notice('DEMO: 10 lot alım ve 15 TL temettü eklendi.');
    }catch(e){notice(e.message);}
  });
  async function sha256(data){
    if(!crypto?.subtle)throw Error('SHA-256 bu cihazda kullanılamıyor.');
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data));
    return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
  }
  async function backupData(){
    const body={
      format:'hisse-portfoyum-management-lab',
      version:1,
      exportedAt:new Date().toISOString(),
      portfolio:await repo.load(),
      journal:load(),
    };
    const data=JSON.stringify({...body,sha256:await sha256(JSON.stringify(body))},null,2);
    if(new TextEncoder().encode(data).byteLength>4_500_000)throw Error('Yedek boyutu sınırı aşıldı.');
    return data;
  }
  async function backupAction(type){
    try{
      const payload=await backupData();
      const name='hisse-portfoyum-lab-'+today()+'.json';
      const ok=type==='save' ?native?.saveBackupFile?.(payload,name):native?.shareBackup?.(payload,name);
      if(ok!==true)throw Error('Android dosya sistemi açılamadı.');
      notice(type==='save'?'Kayıt klasörünü seçin.':'Paylaşım ekranı açıldı.');
    }catch(e){notice(e.message);}
  }
  $('#labBackupSave').addEventListener('click',()=>backupAction('save'));
  $('#labBackupShare').addEventListener('click',()=>backupAction('share'));
  $('#labBackupRestore').addEventListener('click',()=>{
    try{native?.pickBackupFile?.();notice('JSON yedek dosyasını seçin.');}
    catch{notice('Dosya seçimi başarısız.');}
  });
  window.__labsBackupSaved=()=>notice('Yedek kaydedildi.');
  window.__labsBackupSaveFailed=r=>notice(r||'Yedekleme iptal edildi.');
  window.__labsBackupPickFailed=r=>notice(r||'Dosya seçimi iptal edildi.');
  window.__labsBackupPicked=async raw=>{
    try{
      if(typeof raw!=='string'||new TextEncoder().encode(raw).byteLength>4_500_000)throw Error('Yedek boyutu geçersiz.');
      const parsed=JSON.parse(raw);
      if(parsed?.format!=='hisse-portfoyum-management-lab'||parsed.version!==1||typeof parsed.sha256!=='string')throw Error('Lab yedeği değil.');
      const {sha256:checksum,...data}=parsed;
      if(await sha256(JSON.stringify(data))!==checksum)throw Error('Dosya bütünlük denetimi başarısız.');
      const holdings=data.portfolio?.holdings;
      if(!Array.isArray(holdings)||holdings.length>3000)throw Error('Portföy verisi geçersiz.');
      for(const item of holdings){
        if(!item||typeof item.id!=='string'||typeof item.ticker!=='string'||!Array.isArray(item.sales))throw Error('Hisse kaydı geçersiz.');
      }
      const transactions=normalizeJournal(data.journal);
      calculateJournal(transactions);
      if(!confirm(holdings.length+' hisse ve '+transactions.length+' işlem mevcut Lab verilerinin yerine yüklenecek. Onaylıyor musunuz?'))return;
      const previous=await repo.load(),oldJournal=localStorage.getItem(LAB_LEDGER_STORAGE_KEY);
      try{
        await repo.save(data.portfolio);
        localStorage.setItem(LAB_LEDGER_STORAGE_KEY,JSON.stringify(transactions));
      }catch(e){
        await repo.save(previous).catch(()=>{});
        if(oldJournal===null)localStorage.removeItem(LAB_LEDGER_STORAGE_KEY);
        else localStorage.setItem(LAB_LEDGER_STORAGE_KEY,oldJournal);
        throw e;
      }
      notice('Geri yükleme tamamlandı. Yenileniyor.');
      location.reload();
    }catch(e){notice('Geri yükleme başarısız: '+e.message);}
  };
}
