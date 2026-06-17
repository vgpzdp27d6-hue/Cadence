// Whoop — synchro : rafraîchit le token puis récupère récupération + sommeil
function readBody(req) {
  return new Promise(function (resolve) {
    var d = "";
    req.on("data", function (c) { d += c; });
    req.on("end", function () { try { resolve(JSON.parse(d || "{}")); } catch (e) { resolve({}); } });
  });
}
module.exports = async function (req, res) {
  res.setHeader("Content-Type", "application/json");
  try {
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const url = new URL(req.url, "https://" + host);
    let refresh = url.searchParams.get("refresh");
    if (!refresh) { const b = await readBody(req); refresh = b.refresh; }
    if (!refresh) { res.statusCode = 400; return res.end(JSON.stringify({ error: "missing refresh" })); }

    const tb = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refresh,
      client_id: process.env.WHOOP_CLIENT_ID,
      client_secret: process.env.WHOOP_CLIENT_SECRET,
      scope: "offline"
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
      const d = (x.created_at || "").slice(0, 10); const s = x.score || {};
      if (!d) return;
      const o = Object.assign({}, daily[d]);
      if (s.recovery_score != null) o.recovery = Math.round(s.recovery_score);
      if (s.hrv_rmssd_milli != null) o.hrv = Math.round(s.hrv_rmssd_milli);
      if (s.resting_heart_rate != null) o.rhr = Math.round(s.resting_heart_rate);
      daily[d] = o;
    });

    const slR = await fetch("https://api.prod.whoop.com/developer/v2/activity/sleep?limit=25", { headers: H });
    const sl = await slR.json();
    (sl.records || []).forEach(function (x) {
      const d = ((x.end || x.start) || "").slice(0, 10); const s = x.score || {};
      if (!d) return;
      const ss = s.stage_summary || {};
      const inBed = ss.total_in_bed_time_milli;
      const awake = ss.total_awake_time_milli || 0;
      const o = Object.assign({}, daily[d]);
      if (s.sleep_performance_percentage != null) o.sleepPerf = Math.round(s.sleep_performance_percentage);
      if (inBed != null) o.sleepH = +(((inBed - awake) / 3600000)).toFixed(1);
      daily[d] = o;
    });

    res.statusCode = 200;
    res.end(JSON.stringify({ daily: daily, refresh: tok.refresh_token || refresh, count: Object.keys(daily).length }));
  } catch (e) {
    res.statusCode = 500; res.end(JSON.stringify({ error: String((e && e.message) || e) }));
  }
};
