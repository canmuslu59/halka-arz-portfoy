from pathlib import Path

path = Path('android/app/src/main/java/com/innative/halkaarz/MainActivity.java')
text = path.read_text(encoding='utf-8')

replacements = [
    (
        """    private static final ExecutorService NETWORK_EXECUTOR = new ThreadPoolExecutor(
            4,
            4,
            0L,
            TimeUnit.MILLISECONDS,
            new ArrayBlockingQueue<>(128),
            new ThreadPoolExecutor.AbortPolicy()
    );""",
        """    private final ExecutorService networkExecutor = new ThreadPoolExecutor(
            4,
            4,
            0L,
            TimeUnit.MILLISECONDS,
            new ArrayBlockingQueue<>(128),
            new ThreadPoolExecutor.AbortPolicy()
    );
    private final Runnable startupPermissionRequest = this::requestStartupNotificationPermission;""",
    ),
    (
        '        webView.postDelayed(this::requestStartupNotificationPermission, 700L);',
        '        webView.postDelayed(startupPermissionRequest, 700L);',
    ),
    (
        '                NETWORK_EXECUTOR.execute(() -> {',
        '                networkExecutor.execute(() -> {',
    ),
    (
        """    @Override
    protected void onNewIntent(Intent intent) {""",
        """    @Override
    protected void onDestroy() {
        WebView currentWebView = webView;
        webView = null;
        networkExecutor.shutdownNow();
        if (currentWebView != null) {
            currentWebView.removeCallbacks(startupPermissionRequest);
            currentWebView.removeJavascriptInterface(\"AndroidBridge\");
            currentWebView.stopLoading();
            currentWebView.destroy();
        }
        super.onDestroy();
    }

    @Override
    protected void onNewIntent(Intent intent) {""",
    ),
]

for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'guard failed: expected exactly one source match, got {count}: {old[:90]!r}')
    text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
