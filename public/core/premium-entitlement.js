export function createPremiumEntitlement({ demo = false } = {}) {
  return demo
    ? { hasPremium:true, mode:'demo', label:'Premium aktif — Demo' }
    : { hasPremium:false, mode:'free', label:'Ücretsiz' };
}
