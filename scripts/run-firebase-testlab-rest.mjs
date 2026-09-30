import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const token = process.env.TESTLAB_ACCESS_TOKEN;
const projectId = process.env.FIREBASE_PROJECT_ID;
const bucketUri = process.env.GCP_TESTLAB_RESULTS_BUCKET;
const profile = process.env.TEST_PROFILE || 'smoke';
const scenario = process.env.TEST_SCENARIO || 'crawl';
const localeRequested = process.env.TEST_LOCALE || 'tr';
const timeoutRequested = process.env.TEST_TIMEOUT || '2m';
const requestedAndroidVersions = String(process.env.TEST_ANDROID_VERSIONS || '')
  .split(',')
  .map(x => x.trim())
  .filter(Boolean);
const runNumber = process.env.GITHUB_RUN_NUMBER || 'local';

if (!token) throw new Error('TESTLAB_ACCESS_TOKEN is missing');
if (!projectId) throw new Error('FIREBASE_PROJECT_ID is missing');
let bucket = bucketUri?.startsWith('gs://') ? bucketUri.slice(5).replace(/\/$/, '') : '';
const workDir = path.resolve('testlab');
fs.mkdirSync(workDir, { recursive: true });

const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function resilientFetch(url, options = {}, maxAttempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      const retriableStatus = response.status === 408 || response.status === 429 || response.status >= 500;
      if (!retriableStatus || attempt === maxAttempts) return response;

      const retryBody = await response.text().catch(() => '');
      console.warn(`HTTP_RETRY attempt=${attempt}/${maxAttempts} status=${response.status} url=${url} body=${retryBody.slice(0, 300)}`);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) throw error;
      console.warn(`NETWORK_RETRY attempt=${attempt}/${maxAttempts} url=${url} error=${String(error?.message || error)}`);
    }

    await sleep(1000 * (2 ** (attempt - 1)));
  }
  throw lastError || new Error(`Request failed after ${maxAttempts} attempts: ${url}`);
}

async function api(url, options = {}) {
  const response = await resilientFetch(url, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; }
  catch { body = { raw: text }; }
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${url} -> ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function ensureResultsBucket() {
  const initUrl = `https://toolresults.googleapis.com/toolresults/v1beta3/projects/${encodeURIComponent(projectId)}:initializeSettings`;
  const response = await resilientFetch(initUrl, {
    method: 'POST',
    headers,
    body: '{}',
  });

  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; }
  catch { body = { raw: text }; }

  if (!response.ok) {
    throw new Error(`Tool Results default bucket initialization failed ${response.status}: ${JSON.stringify(body)}`);
  }

  const defaultBucket = String(body.defaultBucket || '').replace(/^gs:\/\//, '').replace(/\/$/, '');
  if (!defaultBucket) {
    throw new Error(`Tool Results did not return defaultBucket: ${JSON.stringify(body)}`);
  }

  bucket = defaultBucket;
  console.log(`TESTLAB_BUCKET=FTL_DEFAULT name=${bucket}`);
  return body;
}

async function uploadFile(localPath, objectName, contentType) {
  if (!fs.existsSync(localPath)) throw new Error(`Upload source missing: ${localPath}`);
  const bytes = fs.readFileSync(localPath);
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
  const response = await resilientFetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType,
      'Content-Length': String(bytes.length),
    },
    body: bytes,
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; }
  catch { body = { raw: text }; }
  if (!response.ok) {
    throw new Error(`Upload ${localPath} -> ${response.status}: ${JSON.stringify(body)}`);
  }
  return `gs://${bucket}/${objectName}`;
}

function timeoutSeconds(value) {
  const m = String(value).match(/^(\d+)([sm])$/);
  if (!m) throw new Error(`Unsupported TEST_TIMEOUT: ${value}`);
  const n = Number(m[1]);
  return m[2] === 'm' ? n * 60 : n;
}

function isDeprecated(item) {
  return Array.isArray(item.tags) && item.tags.includes('deprecated');
}

function highestStableVersion(model, versionMap) {
  const candidates = (model.supportedVersionIds || [])
    .map(id => versionMap.get(id))
    .filter(Boolean)
    .filter(v => !isDeprecated(v) && !(v.tags || []).includes('preview'))
    .sort((a, b) => (b.apiLevel || 0) - (a.apiLevel || 0));
  return candidates[0] || null;
}

function pickLocale(catalog) {
  const locales = catalog.runtimeConfiguration?.locales || [];
  const exact = locales.find(x => x.id === localeRequested);
  if (exact) return exact.id;
  const prefix = locales.find(x => x.id?.toLowerCase().startsWith(localeRequested.toLowerCase()));
  if (prefix) return prefix.id;
  const def = locales.find(x => (x.tags || []).includes('default'));
  return def?.id || 'en';
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter(x => {
    if (seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  });
}

function chooseCompatibilityDevices(catalog) {
  if (!requestedAndroidVersions.length) {
    throw new Error('compat-virtual requires TEST_ANDROID_VERSIONS, for example 26,27,28,29');
  }

  const models = (catalog.models || [])
    .filter(m => !isDeprecated(m) && m.form === 'VIRTUAL' && m.formFactor === 'PHONE');
  const versions = (catalog.versions || []).filter(v => !isDeprecated(v));
  const locale = pickLocale(catalog);

  const chosen = [];
  for (const requested of requestedAndroidVersions) {
    const version = versions
      .filter(v => String(v.apiLevel) === requested || String(v.id) === requested)
      .sort((a, b) => {
        const ap = (a.tags || []).includes('preview') ? 1 : 0;
        const bp = (b.tags || []).includes('preview') ? 1 : 0;
        return ap - bp;
      })[0];

    if (!version) throw new Error(`No Test Lab Android version found for API ${requested}`);

    const candidates = models
      .filter(m => (m.supportedVersionIds || []).includes(version.id))
      .sort((a, b) => {
        const score = m => {
          const text = `${m.id || ''} ${m.name || ''} ${m.manufacturer || ''}`.toLowerCase();
          if (text.includes('mediumphone')) return 0;
          if (text.includes('pixel')) return 1;
          if (text.includes('google')) return 2;
          return 3;
        };
        return score(a) - score(b);
      });

    const model = candidates[0];
    if (!model) throw new Error(`No virtual phone supports Android API ${requested} (versionId=${version.id})`);

    chosen.push({
      model,
      apiLevel: version.apiLevel || Number(requested) || 0,
      device: {
        androidModelId: model.id,
        androidVersionId: version.id,
        locale,
        orientation: 'portrait',
      },
    });
  }

  return chosen;
}

function chooseDevices(catalog) {
  const models = (catalog.models || []).filter(m => !isDeprecated(m));
  const versions = catalog.versions || [];
  const versionMap = new Map(versions.map(v => [v.id, v]));
  const locale = pickLocale(catalog);

  const make = model => {
    const version = highestStableVersion(model, versionMap);
    if (!version) return null;
    return {
      model,
      apiLevel: version.apiLevel || 0,
      device: {
        androidModelId: model.id,
        androidVersionId: version.id,
        locale,
        orientation: 'portrait',
      },
    };
  };

  const virtualCandidates = models
    .filter(m => m.form === 'VIRTUAL' && m.formFactor === 'PHONE')
    .map(make).filter(Boolean)
    .sort((a, b) => b.apiLevel - a.apiLevel);

  // Favor distinct virtual models so smoke testing covers more than one screen/device profile.
  const virtual = uniqueById(virtualCandidates.map(x => ({ ...x, id: x.model.id }))).slice(0, 5);

  const physicalCandidates = models
    .filter(m => m.form === 'PHYSICAL' && m.formFactor === 'PHONE')
    .map(make).filter(Boolean);

  const samsung = physicalCandidates
    .filter(x => /samsung/i.test(`${x.model.manufacturer || ''} ${x.model.brand || ''}`))
    .sort((a, b) => b.apiLevel - a.apiLevel);
  const google = physicalCandidates
    .filter(x => /google/i.test(`${x.model.manufacturer || ''} ${x.model.brand || ''}`))
    .sort((a, b) => b.apiLevel - a.apiLevel);
  const other = physicalCandidates
    .filter(x => !/samsung|google/i.test(`${x.model.manufacturer || ''} ${x.model.brand || ''}`))
    .sort((a, b) => b.apiLevel - a.apiLevel);

  const physical = uniqueById([...samsung, ...google, ...other].map(x => ({ ...x, id: x.model.id }))).slice(0, 5);

  let selected;
  if (profile === 'compat-virtual') selected = chooseCompatibilityDevices(catalog);
  else if (profile === 'single') selected = virtual.slice(0, 1);
  else if (profile === 'physical-single') selected = physical.slice(0, 1);
  else if (profile === 'smoke') selected = virtual.slice(0, 3);
  else if (profile === 'physical') selected = physical;
  else if (profile === 'full') selected = [...physical, ...virtual].slice(0, 10);
  else throw new Error(`Unknown TEST_PROFILE: ${profile}`);

  if (!selected.length) throw new Error(`No devices resolved for profile=${profile}`);

  const summary = selected.map(x => ({
    modelId: x.model.id,
    name: x.model.name,
    manufacturer: x.model.manufacturer,
    form: x.model.form,
    apiLevel: x.apiLevel,
    versionId: x.device.androidVersionId,
    locale: x.device.locale,
  }));

  fs.writeFileSync(path.join(workDir, 'selected-devices.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(
    path.join(workDir, 'selected-devices.txt'),
    summary.map(x => `${x.modelId} | ${x.name} | ${x.form} | API ${x.apiLevel} | ${x.versionId} | ${x.locale}`).join('\n') + '\n'
  );

  return selected.map(x => x.device);
}

await ensureResultsBucket();

const catalogResponse = await api(`https://testing.googleapis.com/v1/testEnvironmentCatalog/ANDROID?projectId=${encodeURIComponent(projectId)}`);
const catalog = catalogResponse.androidDeviceCatalog;
if (!catalog) throw new Error('Android device catalog missing from Cloud Testing API response');
fs.writeFileSync(path.join(workDir, 'device-catalog.json'), JSON.stringify(catalogResponse, null, 2));

const devices = chooseDevices(catalog);
console.log(`TESTLAB_DEVICES=${devices.length}`);
console.log(fs.readFileSync(path.join(workDir, 'selected-devices.txt'), 'utf8'));

const prefix = `github/${runNumber}-${profile}-${scenario}-${Date.now()}`;
const appPath = path.resolve('android/app/build/outputs/apk/debug/app-debug.apk');
const appGcs = await uploadFile(appPath, `${prefix}/app-debug.apk`, 'application/vnd.android.package-archive');
console.log(`APP_UPLOAD=${appGcs}`);

const testSpecification = {
  testTimeout: `${timeoutSeconds(timeoutRequested)}s`,
  disableVideoRecording: false,
  disablePerformanceMetrics: false,
};

if (scenario === 'instrumentation') {
  const testDir = path.resolve('android/app/build/outputs/apk/androidTest');
  const testApk = fs.existsSync(testDir)
    ? fs.readdirSync(testDir, { recursive: true })
        .map(x => path.join(testDir, String(x)))
        .find(x => x.endsWith('.apk') && fs.existsSync(x) && fs.statSync(x).isFile())
    : null;
  if (!testApk) throw new Error('Instrumentation APK not found');
  const testGcs = await uploadFile(testApk, `${prefix}/app-debug-androidTest.apk`, 'application/vnd.android.package-archive');
  testSpecification.androidInstrumentationTest = {
    appApk: { gcsPath: appGcs },
    testApk: { gcsPath: testGcs },
    orchestratorOption: 'DO_NOT_USE_ORCHESTRATOR',
  };
} else {
  const robo = {
    appApk: { gcsPath: appGcs },
    appPackageId: 'com.innative.halkaarz.test',
  };
  if (scenario === 'resilience' || scenario === 'permissions') {
    const localScript = path.resolve(`testlab/robo-${scenario}.json`);
    const scriptGcs = await uploadFile(localScript, `${prefix}/robo-${scenario}.json`, 'application/json');
    robo.roboScript = { gcsPath: scriptGcs };
  } else if (scenario !== 'crawl') {
    throw new Error(`Unknown TEST_SCENARIO: ${scenario}`);
  }
  testSpecification.androidRoboTest = robo;
}

const requestBody = {
  clientInfo: {
    name: 'github-actions-rest',
    clientInfoDetails: [
      { key: 'matrixLabel', value: `Hisse-Portfoyum-${profile}-${scenario}-${runNumber}` },
      { key: 'repository', value: 'canmuslu59/halka-arz-portfoy' },
    ],
  },
  testSpecification,
  environmentMatrix: {
    androidDeviceList: {
      androidDevices: devices,
    },
  },
  resultStorage: {
    googleCloudStorage: {
      gcsPath: `gs://${bucket}/results/${prefix}`,
    },
  },
  failFast: false,
};

fs.writeFileSync(path.join(workDir, 'matrix-request.json'), JSON.stringify(requestBody, null, 2));

const requestId = crypto.randomUUID();
let matrix = await api(
  `https://testing.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/testMatrices?requestId=${encodeURIComponent(requestId)}`,
  { method: 'POST', body: JSON.stringify(requestBody) }
);
fs.writeFileSync(path.join(workDir, 'matrix-created.json'), JSON.stringify(matrix, null, 2));

const matrixId = matrix.testMatrixId;
if (!matrixId) throw new Error(`Test matrix ID missing: ${JSON.stringify(matrix)}`);
console.log(`TEST_MATRIX_ID=${matrixId}`);
console.log(`TEST_MATRIX_STATE=${matrix.state || 'UNKNOWN'}`);

const terminal = new Set(['FINISHED', 'ERROR', 'INVALID', 'CANCELLED']);
const deadline = Date.now() + 25 * 60 * 1000;

while (!terminal.has(matrix.state)) {
  if (Date.now() > deadline) throw new Error(`Timed out waiting for Test Lab matrix ${matrixId}`);
  await new Promise(resolve => setTimeout(resolve, 15000));
  matrix = await api(
    `https://testing.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/testMatrices/${encodeURIComponent(matrixId)}`
  );
  const executions = (matrix.testExecutions || []).map(x => ({
    id: x.id,
    state: x.state,
    model: x.environment?.androidDevice?.androidModelId,
    version: x.environment?.androidDevice?.androidVersionId,
    error: x.testDetails?.errorMessage || '',
  }));
  console.log(`TEST_MATRIX_POLL state=${matrix.state} outcome=${matrix.outcomeSummary || ''} executions=${JSON.stringify(executions)}`);
}

const toolResultDetails = [];
for (const execution of (matrix.testExecutions || [])) {
  const ref = execution.toolResultsStep;
  if (!ref?.projectId || !ref?.historyId || !ref?.executionId || !ref?.stepId) continue;

  const stepUrl = `https://toolresults.googleapis.com/toolresults/v1beta3/projects/${encodeURIComponent(ref.projectId)}/histories/${encodeURIComponent(ref.historyId)}/executions/${encodeURIComponent(ref.executionId)}/steps/${encodeURIComponent(ref.stepId)}`;
  try {
    const step = await api(stepUrl);
    const model = execution.environment?.androidDevice?.androidModelId || execution.id || 'unknown';
    fs.writeFileSync(path.join(workDir, `toolresults-${model}.json`), JSON.stringify(step, null, 2));
    toolResultDetails.push({
      model,
      summary: step.outcome?.summary || '',
      failureDetail: step.outcome?.failureDetail || null,
      inconclusiveDetail: step.outcome?.inconclusiveDetail || null,
      testIssues: step.testExecutionStep?.testIssues || [],
    });
  } catch (error) {
    toolResultDetails.push({
      model: execution.environment?.androidDevice?.androidModelId || execution.id || 'unknown',
      fetchError: String(error?.message || error),
    });
  }
}
fs.writeFileSync(path.join(workDir, 'toolresults-summary.json'), JSON.stringify(toolResultDetails, null, 2));
console.log(`TOOL_RESULTS_DETAILS=${JSON.stringify(toolResultDetails)}`);

fs.writeFileSync(path.join(workDir, 'test-run.json'), JSON.stringify(matrix, null, 2));
fs.writeFileSync(
  path.join(workDir, 'test-run.txt'),
  [
    `matrixId=${matrixId}`,
    `state=${matrix.state}`,
    `outcome=${matrix.outcomeSummary || ''}`,
    `resultsUrl=${matrix.resultStorage?.resultsUrl || ''}`,
    `invalid=${matrix.invalidMatrixDetails || ''}`,
    ...((matrix.extendedInvalidMatrixDetails || []).map(x => `matrixError=${x.reason}: ${x.message}`)),
    ...((matrix.testExecutions || []).map(x => {
      const d = x.environment?.androidDevice || {};
      return `execution=${x.id} state=${x.state} model=${d.androidModelId || ''} version=${d.androidVersionId || ''} error=${x.testDetails?.errorMessage || ''}`;
    })),
  ].join('\n') + '\n'
);

console.log(fs.readFileSync(path.join(workDir, 'test-run.txt'), 'utf8'));

if (matrix.state !== 'FINISHED') process.exit(15);
if (matrix.outcomeSummary !== 'SUCCESS') process.exit(10);
