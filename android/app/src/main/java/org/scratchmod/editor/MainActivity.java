package org.scratchmod.editor;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.webkit.WebViewAssetLoader;

import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

public final class MainActivity extends Activity {
    private static final int REQUEST_FILE = 101;
    private static final int REQUEST_SAVE_FILE = 102;
    private static final int REQUEST_MEDIA_PERMISSIONS = 103;
    private static final String APP_ASSET_URL = "https://appassets.androidplatform.net/assets/www/index.html";

    private WebView webView;
    private ValueCallback<Uri[]> fileChooserCallback;
    private PermissionRequest pendingWebPermission;
    private byte[] pendingSaveBytes;
    private String pendingSaveMimeType;
    private boolean openPackagerAfterSave;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applyImmersiveFullscreen();

        FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));
        setContentView(root);

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setLoadWithOverviewMode(true);
        webView.getSettings().setUseWideViewPort(true);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(true);
        webView.addJavascriptInterface(new ScratchBridge(), "ScratchAndroid");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public android.webkit.WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("appassets.androidplatform.net".equals(uri.getHost())) {
                    return false;
                }
                if (request.isForMainFrame()) {
                    openExternal(uri);
                    return true;
                }
                return false;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileChooserCallback != null) {
                    fileChooserCallback.onReceiveValue(null);
                }
                fileChooserCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQUEST_FILE);
                    return true;
                } catch (Exception error) {
                    fileChooserCallback = null;
                    callback.onReceiveValue(null);
                    return false;
                }
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> requestWebMediaPermission(request));
            }
        });
        webView.loadUrl(APP_ASSET_URL + "?androidApp=true");
    }

    private void applyImmersiveFullscreen() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applyImmersiveFullscreen();
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception ignored) {
            // The editor remains available if the device has no browser handler.
        }
    }

    private void requestWebMediaPermission(PermissionRequest request) {
        List<String> permissions = new ArrayList<>();
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) {
                permissions.add(Manifest.permission.CAMERA);
            } else if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                permissions.add(Manifest.permission.RECORD_AUDIO);
            }
        }
        if (permissions.isEmpty()) {
            request.grant(request.getResources());
            return;
        }

        List<String> missingPermissions = new ArrayList<>();
        for (String permission : permissions) {
            if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) {
                missingPermissions.add(permission);
            }
        }
        if (missingPermissions.isEmpty()) {
            request.grant(request.getResources());
            return;
        }
        pendingWebPermission = request;
        requestPermissions(missingPermissions.toArray(new String[0]), REQUEST_MEDIA_PERMISSIONS);
    }

    private void saveFile(String filename, String mimeType, String base64Data, boolean openPackagerAfterSave) {
        try {
            pendingSaveBytes = Base64.decode(base64Data, Base64.DEFAULT);
        } catch (IllegalArgumentException error) {
            pendingSaveBytes = null;
            return;
        }
        pendingSaveMimeType = mimeType == null || mimeType.isEmpty() ? "application/octet-stream" : mimeType;
        this.openPackagerAfterSave = openPackagerAfterSave;
        runOnUiThread(() -> {
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(pendingSaveMimeType);
            intent.putExtra(Intent.EXTRA_TITLE, safeFilename(filename));
            startActivityForResult(intent, REQUEST_SAVE_FILE);
        });
    }

    private String safeFilename(String filename) {
        if (filename == null || filename.trim().isEmpty()) {
            return "scratch-project.sb3";
        }
        return filename.replaceAll("[\\\\/:*?\"<>|]", "_");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_FILE) {
            if (fileChooserCallback != null) {
                Uri[] result = resultCode == RESULT_OK && data != null && data.getData() != null ?
                        new Uri[] {data.getData()} : null;
                fileChooserCallback.onReceiveValue(result);
                fileChooserCallback = null;
            }
            return;
        }
        if (requestCode == REQUEST_SAVE_FILE) {
            Uri destination = resultCode == RESULT_OK && data != null ? data.getData() : null;
            boolean saved = false;
            if (destination != null && pendingSaveBytes != null) {
                try (OutputStream output = getContentResolver().openOutputStream(destination)) {
                    if (output != null) {
                        output.write(pendingSaveBytes);
                        saved = true;
                    }
                } catch (Exception ignored) {
                    // Keep the editor open if saving was cancelled or storage failed.
                }
            }
            pendingSaveBytes = null;
            pendingSaveMimeType = null;
            if (saved && openPackagerAfterSave) {
                openExternal(Uri.parse("https://packager.turbowarp.org/"));
            }
            openPackagerAfterSave = false;
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_MEDIA_PERMISSIONS && pendingWebPermission != null) {
            boolean granted = grantResults.length > 0;
            for (int result : grantResults) {
                granted &= result == PackageManager.PERMISSION_GRANTED;
            }
            if (granted) {
                pendingWebPermission.grant(pendingWebPermission.getResources());
            } else {
                pendingWebPermission.deny();
            }
            pendingWebPermission = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private final class ScratchBridge {
        @JavascriptInterface
        public void saveFile(String filename, String mimeType, String base64Data) {
            MainActivity.this.saveFile(filename, mimeType, base64Data, false);
        }

        @JavascriptInterface
        public void saveFileAndOpenPackager(String filename, String mimeType, String base64Data) {
            MainActivity.this.saveFile(filename, mimeType, base64Data, true);
        }
    }
}
