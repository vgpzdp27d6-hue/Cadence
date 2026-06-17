// Withings — synchro : rafraîchit le token puis récupère poids (type 1) et masse grasse (type 6)
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
      action: "requesttoken",
      grant_type: "refresh_token",
      client_id: process.env.WITHINGS_CLIENT_ID,
      client_secret: process.env.WITHINGS_CLIENT_SECRET,
      refresh_token: refresh
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
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Bearer " + at },
      body: mb
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
  } catch (e) {
    res.statusCode = 500; res.end(JSON.stringify({ error: String((e && e.message) || e) }));
  }
};
