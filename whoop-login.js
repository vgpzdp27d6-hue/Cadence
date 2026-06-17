// Whoop — étape 1 : redirige vers la page d'autorisation Whoop
module.exports = function (req, res) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const redirect = "https://" + host + "/api/whoop-callback";
  const p = new URLSearchParams({
    response_type: "code",
    client_id: process.env.WHOOP_CLIENT_ID || "",
    redirect_uri: redirect,
    scope: "offline read:recovery read:sleep read:cycles read:profile",
    state: "cadence"
  });
  res.statusCode = 302;
  res.setHeader("Location", "https://api.prod.whoop.com/oauth/oauth2/auth?" + p.toString());
  res.end();
};
