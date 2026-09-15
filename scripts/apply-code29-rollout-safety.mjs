import fs from 'node:fs/promises';

async function read(file) { return fs.readFile(file, 'utf8'); }
async function write(file, value) { await fs.writeFile(file, value); }
function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: expected source not found`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: expected source occurs more than once`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

{
  const file = 'android/app/src/main/java/com/innative/halkaarz/PushConfigSync.java';
  let source = await read(file);
  source = replaceOnce(source,
    '    static final String SYNCED_FINGERPRINT_KEY = "push_synced_fingerprint_v1";\n',
    '    static final String SYNCED_FINGERPRINT_KEY = "push_synced_fingerprint_v1";\n    static final String LAST_SYNC_AT_KEY = "push_last_sync_at_v1";\n    private static final long RESYNC_INTERVAL_MS = 60L * 60L * 1000L;\n',
    'push sync freshness constants');
  source = replaceOnce(source,
    '            safe.put("ipoEnabled", parsed.optBoolean("ipoEnabled", true));\n',
    '            safe.put("ipoEnabled", parsed.optBoolean("ipoEnabled", true));\n            safe.put("marketReferenceProtocol", 2);\n',
    'market-reference protocol marker');
  source = replaceOnce(source,
`        String fingerprint = registrationFingerprint(token, config);
        if (fingerprint.equals(prefs.getString(SYNCED_FINGERPRINT_KEY, ""))) return;
        syncAsync(context);
`,
`        String fingerprint = registrationFingerprint(token, config);
        long lastSyncAt = prefs.getLong(LAST_SYNC_AT_KEY, 0L);
        boolean recentlySynced = System.currentTimeMillis() - lastSyncAt < RESYNC_INTERVAL_MS;
        if (fingerprint.equals(prefs.getString(SYNCED_FINGERPRINT_KEY, "")) && recentlySynced) return;
        syncAsync(context);
`, 'periodic safe resync');
  source = replaceOnce(source,
`            JSONObject configObject = new JSONObject(config);
            JSONObject body = new JSONObject();
            body.put("installId", installId(context));
            body.put("fcmToken", token);
            body.put("config", configObject);
`,
`            JSONObject configObject = new JSONObject(config);
            JSONObject remoteConfig = new JSONObject(configObject.toString());
            remoteConfig.put("trustedMarketEnabled", configObject.optBoolean("enabled", true));
            // Legacy production workers do not understand the verified-reference protocol.
            // Send enabled=false so they cannot emit stale Yahoo-based market alerts.
            // A protocol-aware worker restores the user's market setting from trustedMarketEnabled.
            remoteConfig.put("enabled", false);
            JSONObject body = new JSONObject();
            body.put("installId", installId(context));
            body.put("fcmToken", token);
            body.put("config", remoteConfig);
`, 'legacy worker safe remote config');
  source = replaceOnce(source,
`                prefs.edit().putString(SYNCED_FINGERPRINT_KEY, fingerprint).apply();
`,
`                prefs.edit()
                        .putString(SYNCED_FINGERPRINT_KEY, fingerprint)
                        .putLong(LAST_SYNC_AT_KEY, System.currentTimeMillis())
                        .apply();
`, 'record successful sync time');
  await write(file, source);
}

{
  const file = 'backend/service.js';
  let source = await read(file);
  source = replaceOnce(source,
`    const config = payload.config && typeof payload.config === 'object' ? payload.config : {};
    const stamp = now().toISOString();
    return store.mutate(state => {
`,
`    const config = payload.config && typeof payload.config === 'object' ? payload.config : {};
    const marketReferenceProtocol = Number(config.marketReferenceProtocol);
    const marketEnabled = Number.isFinite(marketReferenceProtocol) && marketReferenceProtocol >= 2
      ? config.trustedMarketEnabled !== false
      : config.enabled !== false;
    const stamp = now().toISOString();
    return store.mutate(state => {
`, 'backend rollout protocol');
  source = replaceOnce(source,
`        enabled: config.enabled !== false,
`,
`        enabled: marketEnabled,
`, 'backend rollout market enabled');
  await write(file, source);
}

console.log('Applied Code29 legacy-worker rollout safety.');
