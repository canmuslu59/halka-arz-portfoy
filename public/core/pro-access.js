export const DEFAULT_TRIAL_MS = 7 * 24 * 60 * 60 * 1000;
const START_KEY='halka_arz_pro_trial_started_at_v1';
const LAB_KEY='portfolio_management_lab_entitlement_v1';

function isLabPackage() {
  try {
    const info=JSON.parse(globalThis.window?.AndroidBridge?.getAppInfo?.() || '{}');
    return info.packageName==='com.innative.halkaarz.lab'
      && String(info.versionName || '').includes('lab');
  } catch { return false; }
}
function stamp(raw) {
  const n=Number(raw);
  return Number.isFinite(n)&&n>0 ? n : null;
}
export function createProAccess(storage,{now=()=>Date.now(),trialMs=DEFAULT_TRIAL_MS}={}) {
  if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function')
    throw new TypeError('Pro erişimi için storage gerekli.');
  function getState(){
    if(isLabPackage()){
      const mode=storage.getItem(LAB_KEY)||'free';
      if(mode==='premium')
        return {status:'lab_premium',hasAccess:true,startedAt:null,remainingMs:0};
      if(mode==='free')
        return {status:'not_started',hasAccess:false,startedAt:null,remainingMs:trialMs};
      if(mode==='trial'){
        let began=stamp(storage.getItem(START_KEY));
        if(!began){began=now();storage.setItem(START_KEY,String(began));}
        const remainingMs=Math.max(0,trialMs-Math.max(0,now()-began));
        return {status:remainingMs>0?'trial':'expired',hasAccess:remainingMs>0,startedAt:began,remainingMs};
      }
    }
    const startedAt=stamp(storage.getItem(START_KEY));
    if(!startedAt)return {status:'not_started',hasAccess:false,startedAt:null,remainingMs:trialMs};
    const remainingMs=Math.max(0,trialMs-Math.max(0,now()-startedAt));
    if(remainingMs<=0)return {status:'expired',hasAccess:false,startedAt,remainingMs:0};
    return {status:'trial',hasAccess:true,startedAt,remainingMs};
  }
  function enterAdvanced(){
    if(isLabPackage())storage.setItem(LAB_KEY,'trial');
    if(!stamp(storage.getItem(START_KEY)))storage.setItem(START_KEY,String(now()));
    return getState();
  }
  return {getState,enterAdvanced};
}
