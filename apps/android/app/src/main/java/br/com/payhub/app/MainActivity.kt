package br.com.payhub.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private val baseUrl = "https://paayhub.duckdns.org"
    private val locationPermissionRequest = 4202
    private var pendingGeoOrigin: String? = null
    private var pendingGeoCallback: GeolocationPermissions.Callback? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        setContentView(webView)

        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, false)
        }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            setGeolocationEnabled(true)
            cacheMode = WebSettings.LOAD_DEFAULT
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            userAgentString = "$userAgentString PayHubAndroid/0.4.2"
        }
        webView.addJavascriptInterface(DeviceBridge(), "PayHubNative")

        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(webView.settings, true)
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
                if (hasLocationPermission()) {
                    callback.invoke(origin, true, false)
                    return
                }

                // Não exibimos diálogo próprio do PayHub. A única autorização possível é a nativa do Android.
                val prefs = getSharedPreferences("payhub_permissions", Context.MODE_PRIVATE)
                if (prefs.getBoolean("location_requested", false)) {
                    callback.invoke(origin, false, false)
                    return
                }

                pendingGeoOrigin = origin
                pendingGeoCallback = callback
                requestLocationPermission()
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                return if (uri.host == Uri.parse(baseUrl).host) false else {
                    startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, uri)); true
                }
            }
        }

        webView.setDownloadListener(DownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            val extension = if (mimeType?.contains("zip", ignoreCase = true) == true) "zip" else "pdf"
            val request = DownloadManager.Request(Uri.parse(url))
                .setMimeType(mimeType)
                .addRequestHeader("User-Agent", userAgent)
                .addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url) ?: "")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "PayHub-${System.currentTimeMillis()}.$extension")
            (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
        })

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        requestLocationOnFirstInstall()
        if (savedInstanceState == null) webView.loadUrl(baseUrl) else webView.restoreState(savedInstanceState)
    }

    private fun hasLocationPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun requestLocationOnFirstInstall() {
        if (hasLocationPermission()) return
        val prefs = getSharedPreferences("payhub_permissions", Context.MODE_PRIVATE)
        if (!prefs.getBoolean("location_requested", false)) requestLocationPermission()
    }

    private fun requestLocationPermission() {
        getSharedPreferences("payhub_permissions", Context.MODE_PRIVATE)
            .edit().putBoolean("location_requested", true).apply()
        ActivityCompat.requestPermissions(
            this,
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
            locationPermissionRequest,
        )
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != locationPermissionRequest) return
        val granted = hasLocationPermission()
        pendingGeoCallback?.invoke(pendingGeoOrigin ?: baseUrl, granted, false)
        pendingGeoCallback = null
        pendingGeoOrigin = null
    }

    inner class DeviceBridge {
        @JavascriptInterface
        fun getDeviceInfo(): String {
            val packageInfo = packageManager.getPackageInfo(packageName, 0)
            val isTablet = resources.configuration.smallestScreenWidthDp >= 600
            return JSONObject().apply {
                put("deviceType", if (isTablet) "TABLET" else "PHONE")
                put("brand", Build.BRAND)
                put("manufacturer", Build.MANUFACTURER)
                put("model", Build.MODEL)
                put("device", Build.DEVICE)
                put("product", Build.PRODUCT)
                put("platform", "Android")
                put("platformVersion", Build.VERSION.RELEASE ?: "")
                put("osName", "Android")
                put("osVersion", Build.VERSION.RELEASE ?: "")
                put("sdkInt", Build.VERSION.SDK_INT)
                put("architecture", Build.SUPPORTED_ABIS.firstOrNull() ?: "")
                put("appVersion", packageInfo.versionName ?: "0.4.2")
                put("mobile", !isTablet)
            }.toString()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }
}
