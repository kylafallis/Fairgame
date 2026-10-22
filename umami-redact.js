/* Runs before every Umami send (data-before-send="fgUmamiRedact").
   Email links and Google sign-in put live credentials in the URL. Umami
   should still show that a sign-in or a failure happened, and which kind,
   but not the credential itself - anyone with dashboard access could
   otherwise sign in as that person. Only the values are replaced, so
   type=recovery, error_code=otp_expired and the like stay readable. */
(function () {
  var SECRET = /([#?&](?:access_token|refresh_token|provider_token|provider_refresh_token|token_hash|token|code)=)[^&#]*/g;

  function clean(url) {
    if (typeof url !== 'string') return url;
    return url.replace(SECRET, function (match, key) {
      // ?code=1 is our own flag for the code-entry screen, not a credential.
      return /code=$/.test(key) && match.length - key.length <= 2 ? match : key + 'REDACTED';
    });
  }

  window.fgUmamiRedact = function (type, payload) {
    if (payload) {
      payload.url = clean(payload.url);
      payload.referrer = clean(payload.referrer);
    }
    return payload;
  };

  /* Named events for the auth flow. Umami may not have loaded yet, and a
     page that is about to redirect has to wait for the send or it is lost,
     so this resolves either way within a second. */
  window.fgTrack = function (name, data) {
    try {
      if (!window.umami || typeof window.umami.track !== 'function') return Promise.resolve();
      return Promise.race([
        Promise.resolve(window.umami.track(name, data)).catch(function () {}),
        new Promise(function (r) { setTimeout(r, 1000); })
      ]);
    } catch (_) { return Promise.resolve(); }
  };
})();
