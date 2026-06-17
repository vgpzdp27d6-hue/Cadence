// Withings — étape 1 : redirige vers la page d'autorisation Withings
module.exports = function (req, res) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const redirect = "https://" + host + "/api/withings-callback";
  const p = new URLSearchParams({
    response_type: "code",
    client_id: process.env.WITHINGS_CLIENT_ID || "",
    scope: "user.metrics",
    redirect_uri: redirect,
    state: "cadence"
  });
  res.statusCode = 302;
  res.setHeader("Location", "https://account.withings.com/oauth2_user/authorize2?" + p.toString());
  res.end();
};
