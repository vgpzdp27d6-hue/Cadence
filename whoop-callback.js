// Whoop — étape 2 : Whoop renvoie ici avec un "code", on l'échange contre les tokens (secret côté serveur)
module.exports = async function (req, res) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  try {
    const url = new URL(req.url, "https://" + host);
    const code = url.searchParams.get("code");
    if (!code) throw new Error("no code");
    const redirect = "https://" + host + "/api/whoop-callback";
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: redirect,
      client_id: process.env.WHOOP_CLIENT_ID,
      client_secret: process.env.WHOOP_CLIENT_SECRET
    });
    const r = await fetch("https://api.prod.whoop.com/oauth/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body
    });
    const tok = await r.json();
    if (!tok.refresh_token) throw new Error("no refresh token");
    res.statusCode = 302;
    res.setHeader("Location", "https://" + host + "/#whoop=" + encodeURIComponent(tok.refresh_token));
    res.end();
  } catch (e) {
    res.statusCode = 302;
    res.setHeader("Location", "https://" + host + "/?error=whoop");
    res.end();
  }
};
