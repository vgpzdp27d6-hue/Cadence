// Withings — étape 2 : échange le code contre les tokens (action=requesttoken)
module.exports = async function (req, res) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  try {
    const url = new URL(req.url, "https://" + host);
    const code = url.searchParams.get("code");
    if (!code) throw new Error("no code");
    const redirect = "https://" + host + "/api/withings-callback";
    const body = new URLSearchParams({
      action: "requesttoken",
      grant_type: "authorization_code",
      client_id: process.env.WITHINGS_CLIENT_ID,
      client_secret: process.env.WITHINGS_CLIENT_SECRET,
      code: code,
      redirect_uri: redirect
    });
    const r = await fetch("https://wbsapi.withings.net/v2/oauth2", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body
    });
    const j = await r.json();
    const rt = j.body && j.body.refresh_token;
    if (!rt) throw new Error("no refresh token");
    res.statusCode = 302;
    res.setHeader("Location", "https://" + host + "/#withings=" + encodeURIComponent(rt));
    res.end();
  } catch (e) {
    res.statusCode = 302;
    res.setHeader("Location", "https://" + host + "/?error=withings");
    res.end();
  }
};
