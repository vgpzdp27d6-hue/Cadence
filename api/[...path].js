// Cadence — UN SEUL fichier pour tout : Whoop & Withings (login, callback, sync)
// À placer sur GitHub sous le nom : api/[...path].js

function readBody(req) {
  return new Promise(function (resolve) {
    var d = "";
    req.on("data", function (c) { d += c; });
    req.on("end", function () { try { resolve(JSON.parse(d || "{}")); } catch (e) { resolve({}); } });
  });
}

async function whoopLogin(req, res, host) {
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
}

async function whoopCallback(req, res, host, url) {
  try {
    const code = url.searchParams.get("code");
    if (!code) throw new Error("no code");
    const redirect = "https://" + host + "/api/whoop-callback";
    const body = new URLSearchParams({
      grant_type: "authorization_code", code: code, redirect_uri: redirect,
      client_id: process.env.WHOOP_CLIENT_ID, client_secret: process.env.WHOOP_CLIENT_SECRET
    });
    const r = await fetch("https://api.prod.whoop.com/oauth/oauth2/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body
    });
    const tok = await r.json();
    if (!tok.refresh_token) throw new Error("no refresh");
    res.statusCode = 302;
    res.setHeader("Location", "https://" + host + "/#whoop=" + encodeURIComponent(tok.refresh_token));
    res.end();
  } catch (e) {
    res.statusCode = 302; res.setHeader("Location", "https://" + host + "/?error=whoop"); res.end();
  }
}

async function whoopSync(req, res, host, url) {
  res.setHeader("Content-Type", "application/json");
  try {
    let refresh = url.searchParams.get("refresh");
    if (!refresh) { const b = await readBody(req); refresh = b.refresh; }
    if (!refresh) { res.statusCode = 400; return res.end(JSON.stringify({ error: "missing refresh" })); }
    const tb = new URLSearchParams({
      grant_type: "refresh_token", refresh_token: refresh,
      client_id: process.env.WHOOP_CLIENT_ID, client_secret: process.env.WHOOP_CLIENT_SECRET, scope: "offline"
    });
    const tr = await fetch("https://api.prod.whoop.com/oauth/oauth2/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: tb
    });
    const tok = await tr.json();
    if (!tok.access_token) { res.statusCode = 401; return res.end(JSON.stringify({ error: "refresh failed", detail: tok })); }
    const H = { Authorization: "Bearer " + tok.access_token };
    const daily = {};
    const recR = await fetch("https://api.prod.whoop.com/developer/v2/recovery?limit=25", { headers: H });
    const rec = await recR.json();
    (rec.records || []).forEach(function (x) {
      const d = (x.created_at || "").slice(0, 10); const s = x.score || {}; if (!d) return;
      const o = Object.assign({}, daily[d]);
      if (s.recovery_score != null) o.recovery = Math.round(s.recovery_score);
      if (s.hrv_rmssd_milli != null) o.hrv = Math.round(s.hrv_rmssd_milli);
      if (s.resting_heart_rate != null) o.rhr = Math.round(s.resting_heart_rate);
      daily[d] = o;
    });
    const slR = await fetch("https://api.prod.whoop.com/developer/v2/activity/sleep?limit=25", { headers: H });
    const sl = await slR.json();
    (sl.records || []).forEach(function (x) {
      const d = ((x.end || x.start) || "").slice(0, 10); const s = x.score || {}; if (!d) return;
      const ss = s.stage_summary || {}; const inBed = ss.total_in_bed_time_milli; const awake = ss.total_awake_time_milli || 0;
      const o = Object.assign({}, daily[d]);
      if (s.sleep_performance_percentage != null) o.sleepPerf = Math.round(s.sleep_performance_percentage);
      if (inBed != null) o.sleepH = +(((inBed - awake) / 3600000)).toFixed(1);
      daily[d] = o;
    });
    res.statusCode = 200;
    res.end(JSON.stringify({ daily: daily, refresh: tok.refresh_token || refresh, count: Object.keys(daily).length }));
  } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String((e && e.message) || e) })); }
}

async function withingsLogin(req, res, host) {
  const redirect = "https://" + host + "/api/withings-callback";
  const p = new URLSearchParams({
    response_type: "code", client_id: process.env.WITHINGS_CLIENT_ID || "",
    scope: "user.metrics", redirect_uri: redirect, state: "cadence"
  });
  res.statusCode = 302;
  res.setHeader("Location", "https://account.withings.com/oauth2_user/authorize2?" + p.toString());
  res.end();
}

async function withingsCallback(req, res, host, url) {
  try {
    const code = url.searchParams.get("code");
    if (!code) throw new Error("no code");
    const redirect = "https://" + host + "/api/withings-callback";
    const body = new URLSearchParams({
      action: "requesttoken", grant_type: "authorization_code",
      client_id: process.env.WITHINGS_CLIENT_ID, client_secret: process.env.WITHINGS_CLIENT_SECRET,
      code: code, redirect_uri: redirect
    });
    const r = await fetch("https://wbsapi.withings.net/v2/oauth2", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body
    });
    const j = await r.json();
    const rt = j.body && j.body.refresh_token;
    if (!rt) throw new Error("no refresh");
    res.statusCode = 302;
    res.setHeader("Location", "https://" + host + "/#withings=" + encodeURIComponent(rt));
    res.end();
  } catch (e) {
    res.statusCode = 302; res.setHeader("Location", "https://" + host + "/?error=withings"); res.end();
  }
}

async function withingsSync(req, res, host, url) {
  res.setHeader("Content-Type", "application/json");
  try {
    let refresh = url.searchParams.get("refresh");
    if (!refresh) { const b = await readBody(req); refresh = b.refresh; }
    if (!refresh) { res.statusCode = 400; return res.end(JSON.stringify({ error: "missing refresh" })); }
    const tb = new URLSearchParams({
      action: "requesttoken", grant_type: "refresh_token",
      client_id: process.env.WITHINGS_CLIENT_ID, client_secret: process.env.WITHINGS_CLIENT_SECRET, refresh_token: refresh
    });
    const tr = await fetch("https://wbsapi.withings.net/v2/oauth2", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: tb
    });
    const tj = await tr.json();
    const at = tj.body && tj.body.access_token;
    const newRefresh = (tj.body && tj.body.refresh_token) || refresh;
    if (!at) { res.statusCode = 401; return res.end(JSON.stringify({ error: "refresh failed", detail: tj })); }
    const start = Math.floor(Date.now() / 1000) - 120 * 86400;
    const mb = new URLSearchParams({ action: "getmeas", meastypes: "1,6", category: "1", startdate: String(start) });
    const mr = await fetch("https://wbsapi.withings.net/measure", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Bearer " + at }, body: mb
    });
    const mj = await mr.json();
    const daily = {};
    const grps = (mj.body && mj.body.measuregrps) || [];
    grps.forEach(function (g) {
      const d = new Date(g.date * 1000).toISOString().slice(0, 10);
      (g.measures || []).forEach(function (m) {
        const real = m.value * Math.pow(10, m.unit);
        const o = Object.assign({}, daily[d]);
        if (m.type === 1) o.weight = +real.toFixed(1);
        if (m.type === 6) o.fat = +real.toFixed(1);
        daily[d] = o;
      });
    });
    res.statusCode = 200;
    res.end(JSON.stringify({ daily: daily, refresh: newRefresh, count: Object.keys(daily).length }));
  } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String((e && e.message) || e) })); }
}

module.exports = async function (req, res) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const url = new URL(req.url, "https://" + host);
  const path = url.pathname.replace(/^\/api\//, "").replace(/\/+$/, "");
  if (path === "whoop-login") return whoopLogin(req, res, host);
  if (path === "whoop-callback") return whoopCallback(req, res, host, url);
  if (path === "whoop-sync") return whoopSync(req, res, host, url);
  if (path === "withings-login") return withingsLogin(req, res, host);
  if (path === "withings-callback") return withingsCallback(req, res, host, url);
  if (path === "withings-sync") return withingsSync(req, res, host, url);
  res.statusCode = 404; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "route inconnue: " + path }));
};
