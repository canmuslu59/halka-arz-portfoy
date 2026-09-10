const FIXED_CLOSED = new Set(['01-01','04-23','05-01','05-19','07-15','08-30','10-29']);
const CLOSED_2026 = new Set(['2026-03-20','2026-03-21','2026-03-22','2026-05-27','2026-05-28','2026-05-29','2026-05-30']);
const CLOSED_2027 = new Set(['2027-03-09','2027-03-10','2027-03-11','2027-05-16','2027-05-17','2027-05-18','2027-05-19']);
const HALF_2026 = new Set(['2026-03-19','2026-05-26','2026-10-28']);
const HALF_2027 = new Set(['2027-03-08','2027-05-15']);

function partsInIstanbul(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone:'Europe/Istanbul', year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23',
  }).formatToParts(date);
  const pick = type => parts.find(part => part.type === type)?.value;
  return {
    date:`${pick('year')}-${pick('month')}-${pick('day')}`,
    hour:Number(pick('hour')), minute:Number(pick('minute')), second:Number(pick('second')),
  };
}

function addDays(iso, days) {
  const [y,m,d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0,10);
}

function weekday(iso) {
  const [y,m,d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y,m-1,d)).getUTCDay();
}

function isWeekend(iso) {
  const day = weekday(iso);
  return day === 0 || day === 6;
}

function isFullHoliday(iso) {
  return FIXED_CLOSED.has(iso.slice(5)) || CLOSED_2026.has(iso) || CLOSED_2027.has(iso);
}

function isHalfDay(iso) {
  return HALF_2026.has(iso) || HALF_2027.has(iso) || iso.slice(5) === '10-28';
}

function tradingDay(iso) {
  return !isWeekend(iso) && !isFullHoliday(iso);
}

function localStamp(iso, hour) {
  return `${iso}T${String(hour).padStart(2,'0')}:00:00+03:00`;
}

function nextTradingOpen(fromDate, includeSame = false) {
  let date = fromDate;
  if (!includeSame) date = addDays(date, 1);
  for (let i = 0; i < 370; i += 1) {
    if (tradingDay(date)) return localStamp(date, 10);
    date = addDays(date, 1);
  }
  return null;
}

export function getBistMarketStatus(now = new Date()) {
  const local = partsInIstanbul(now);
  const iso = local.date;
  const minuteOfDay = local.hour * 60 + local.minute + local.second / 60;
  const openMinute = 10 * 60;
  const closeHour = isHalfDay(iso) ? 13 : 18;
  const closeMinute = closeHour * 60;

  if (!tradingDay(iso)) {
    return {
      isOpen:false,
      label:'KAPALI',
      reason:isWeekend(iso) ? 'Hafta sonu' : 'Resmî tatil',
      nextOpenAt:nextTradingOpen(iso, false),
      closesAt:null,
    };
  }

  if (minuteOfDay < openMinute) {
    return {
      isOpen:false,
      label:'KAPALI',
      reason:'Seans henüz başlamadı',
      nextOpenAt:localStamp(iso, 10),
      closesAt:null,
    };
  }

  if (minuteOfDay < closeMinute) {
    return {
      isOpen:true,
      label:'AÇIK',
      reason:isHalfDay(iso) ? 'Yarım gün seansı' : 'Pay Piyasası açık',
      nextOpenAt:null,
      closesAt:localStamp(iso, closeHour),
    };
  }

  return {
    isOpen:false,
    label:'KAPALI',
    reason:'Seans kapandı',
    nextOpenAt:nextTradingOpen(iso, false),
    closesAt:null,
  };
}
