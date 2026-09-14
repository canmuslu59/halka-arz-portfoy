import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('real Java notification rule class handles both directions and recovers sampled crossings', () => {
  const dir=mkdtempSync(join(tmpdir(),'halka-alert-java-'));
  try {
    execFileSync('javac',['-d',dir,'android/app/src/main/java/com/innative/halkaarz/PortfolioAlertRules.java','test/fixtures/PortfolioAlertRulesProbe.java'],{stdio:'pipe'});
    execFileSync('java',['-cp',dir,'com.innative.halkaarz.PortfolioAlertRulesProbe'],{stdio:'pipe'});
  } finally {rmSync(dir,{recursive:true,force:true});}
});
