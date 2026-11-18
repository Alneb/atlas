// A security key in Atlas's sign-in window (webauthn.rs): the engine (WebKitGTK) has no WebAuthn, so a gate's page
// asking for the key gets its answer from the app, which signs with the key over USB for this page's own origin.
// Only signing in (`get`); registering a key is a browser's job.
(() => {
  if (window.PublicKeyCredential || !window.__TAURI_INTERNALS__) return; // the engine's own, or not Atlas's window
  const b64u = (b) => {
    const u = b instanceof ArrayBuffer ? new Uint8Array(b) : new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    let s = "";
    for (const c of u) s += String.fromCharCode(c);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const bytes = (s) => {
    const b = atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "="));
    const u = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u.buffer;
  };
  class PublicKeyCredential {
    static isUserVerifyingPlatformAuthenticatorAvailable() { return Promise.resolve(false); }
    static isConditionalMediationAvailable() { return Promise.resolve(false); }
    getClientExtensionResults() { return {}; }
  }
  class AuthenticatorResponse {}
  class AuthenticatorAssertionResponse extends AuthenticatorResponse {}
  Object.assign(window, { PublicKeyCredential, AuthenticatorResponse, AuthenticatorAssertionResponse });
  const refuse = (why, name = "NotAllowedError") => Promise.reject(new DOMException(why, name));
  const get = async (opts) => {
    const pk = opts && opts.publicKey;
    if (!pk) return refuse("only security keys are answered in this window", "NotSupportedError");
    const request = {
      challenge: b64u(pk.challenge),
      rpId: pk.rpId || location.hostname,
      allow: (pk.allowCredentials || []).map((c) => b64u(c.id)),
    };
    let r;
    try {
      r = await window.__TAURI_INTERNALS__.invoke("webauthn_get", { request });
    } catch (e) {
      return refuse(String(e));
    }
    const response = Object.assign(Object.create(AuthenticatorAssertionResponse.prototype), {
      clientDataJSON: bytes(r.clientDataJson), authenticatorData: bytes(r.authenticatorData), signature: bytes(r.signature),
      userHandle: r.userHandle ? bytes(r.userHandle) : null,
    });
    const cred = Object.assign(Object.create(PublicKeyCredential.prototype), {
      id: r.id, rawId: bytes(r.id), type: "public-key", authenticatorAttachment: "cross-platform", response,
    });
    cred.toJSON = () => ({
      id: r.id, rawId: r.id, type: "public-key", authenticatorAttachment: "cross-platform", clientExtensionResults: {},
      response: { clientDataJSON: r.clientDataJson, authenticatorData: r.authenticatorData, signature: r.signature, userHandle: r.userHandle || undefined },
    });
    return cred;
  };
  const credentials = {
    get,
    create: () => refuse("register a security key in a browser; this window only signs in with one", "NotSupportedError"),
    store: () => refuse("not kept here", "NotSupportedError"),
    preventSilentAccess: () => Promise.resolve(),
  };
  Object.defineProperty(navigator, "credentials", { value: credentials, configurable: true });
})();
