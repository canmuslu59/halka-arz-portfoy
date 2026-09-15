import test from 'node:test';
import assert from 'node:assert/strict';

import { createPremiumEntitlement } from '../public/core/premium-entitlement.js';

test('demo entitlement is explicit and isolated from free mode', () => {
  assert.deepEqual(createPremiumEntitlement({ demo:true }), {
    hasPremium:true,
    mode:'demo',
    label:'Premium aktif — Demo',
  });
  assert.deepEqual(createPremiumEntitlement({ demo:false }), {
    hasPremium:false,
    mode:'free',
    label:'Ücretsiz',
  });
});
