package org.atlas.capture;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

/**
 * Signing in inside the app: the server's `/auth/app` in a WebView, through whatever sign-in is in front (its password,
 * a one-time code — a key's code from its authenticator app) and Atlas's own; the cookies stay with the app (requests
 * carry them, Server.headers) and the redirect to `org.atlas.…://signed-in` brings the device token. Security keys
 * (WebAuthn) do not work in a WebView: the browser sign-in is for them.
 */
public final class SignInWebActivity extends Activity {
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        String service = getIntent().getStringExtra("service");
        if (service != null) { serviceSignIn(service); return; }
        String server = getIntent().getStringExtra("server");
        if (server == null) { finish(); return; }
        Look look = new Look(this);
        Shell.edgeToEdge(this, look);
        WebView web = new WebView(this);
        web.getSettings().setJavaScriptEnabled(true); // sign-in pages are scripts
        web.getSettings().setDomStorageEnabled(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true); // a front on another host sets its cookie for the domain
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                android.net.Uri u = r.getUrl();
                String scheme = String.valueOf(u.getScheme());
                if (scheme.equals("http") || scheme.equals("https")) return false; // the sign-in's own pages
                if (!SignIn.isReturn(u)) return true; // a link a WebView cannot follow (mailto:, intent:): stay on the sign-in
                String token = u.getQueryParameter("token");
                if (token != null) {
                    CookieManager.getInstance().flush();
                    Vaults vaults = new Vaults(SignInWebActivity.this);
                    vaults.useServer(server, token);
                    vaults.keepCookies(server, true);
                    Toast.makeText(SignInWebActivity.this, "Signed in to " + Vaults.name(server), Toast.LENGTH_LONG).show();
                    Server.verify(SignInWebActivity.this, server);
                    if (Edition.of(SignInWebActivity.this).full()) // the vault's page again, now let in
                        startActivity(new android.content.Intent(SignInWebActivity.this, AtlasActivity.class)
                            .addFlags(android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP | android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra(AtlasActivity.RELOAD, true));
                } else {
                    Toast.makeText(SignInWebActivity.this, "Not signed in: " + u.getQueryParameter("error"), Toast.LENGTH_LONG).show();
                }
                finish();
                return true;
            }
        });
        Shell.padForBars(web);
        setContentView(web);
        web.loadUrl(SignIn.appUrl(server, SignIn.scopeApp(this)));
    }

    // ---- a service of the user's (Suwayomi, Audiobookshelf) behind the same sign-in: Web.signIn ---------------------

    private static final java.util.Map<String, Runnable> waiting = new java.util.concurrent.ConcurrentHashMap<>();

    /** The service's own address in the app's WebView: through the sign-in in front, whose session cookie (for the whole
     *  domain) the WebView keeps; done once a page of the service itself has loaded. */
    static void service(Activity a, String url, Runnable done) {
        if (done != null) waiting.put(url, done);
        a.startActivity(new android.content.Intent(a, SignInWebActivity.class).putExtra("service", url));
    }

    private void serviceSignIn(String url) {
        Look look = new Look(this);
        Shell.edgeToEdge(this, look);
        WebView web = new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        String host = Web.host(url);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView v, String at) {
                if (!host.equals(Web.host(at))) return; // still the sign-in's pages
                CookieManager.getInstance().flush();
                Toast.makeText(SignInWebActivity.this, "Signed in to " + host, Toast.LENGTH_LONG).show();
                Runnable done = waiting.remove(url);
                finish();
                if (done != null) done.run();
            }
        });
        Shell.padForBars(web);
        setContentView(web);
        web.loadUrl(url);
    }
}
