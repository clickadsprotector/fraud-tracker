/**
 * SaaS Fraud Engine — Universal Tracker V1.0
 * CDN hosted. Client paste kare:
 *   <script src="https://cdn.jsdelivr.net/gh/naseem61989/SaaS-Fraud-Engine@main/tracker.js?site=CLIENT_NAME&key=CLIENT_TOKEN"></script>
 *
 * SUPABASE_EDGE_URL: apna Supabase Edge Function URL yahan set karo
 */
(function () {
  "use strict";

  // ============================================================
  //  CONFIG — script tag ke query params se read hota hai
  // ============================================================
 var EDGE_URL = "https://dcqppxhrahpwqtobgsfo.supabase.co/functions/v1/fraud-ingest";

  var scriptEl = document.currentScript ||
    (function () {
      var tags = document.getElementsByTagName("script");
      return tags[tags.length - 1];
    })();

  var scriptSrc = scriptEl ? scriptEl.src : "";
  var srcParams = {};
  try {
    var qIdx = scriptSrc.indexOf("?");
    if (qIdx !== -1) {
      new URLSearchParams(scriptSrc.slice(qIdx + 1)).forEach(function (v, k) {
        srcParams[k] = v;
      });
    }
  } catch (e) {}

  var WEBSITE_NAME = srcParams["site"] || "Unknown";
  var CLIENT_TOKEN = srcParams["key"]  || "";

  if (!CLIENT_TOKEN || !WEBSITE_NAME || WEBSITE_NAME === "Unknown") return;

  // ============================================================
  //  GCLID VALIDATION
  // ============================================================
  var urlParams = new URLSearchParams(window.location.search);
  var rawGclid  = urlParams.get("gclid");
  var rawWbraid = urlParams.get("wbraid") || urlParams.get("gbraid");
  var gclid     = rawGclid || rawWbraid;

  if (!gclid) return;
  if (rawGclid && (rawGclid.length < 20 || rawGclid.toLowerCase().startsWith("gtm_"))) return;
  if (/test|fake|demo/i.test(gclid) || document.cookie.indexOf("__TAG_ASSISTANT") !== -1) return;

  var SESSION_KEY = "ftv10_" + gclid;
  if (sessionStorage.getItem(SESSION_KEY)) return;

  // ============================================================
  //  LEGIT BOT & GHOST BOT KILLER
  // ============================================================
  var UA       = navigator.userAgent;
  var UA_LOWER = UA.toLowerCase();
  var LEGIT_BOTS = ["googlebot","adsbot-google","mediapartners-google",
                    "google-inspectiontool","bingbot","yandexbot"];
  if (LEGIT_BOTS.some(function (b) { return UA_LOWER.indexOf(b) !== -1; })) return;

  if (/\(linux; android \d+; [a-z]\)/i.test(UA) ||
      !navigator.languages || navigator.languages.length === 0) {
    var ghostPayload = {
      key: CLIENT_TOKEN, website: WEBSITE_NAME, gclid: gclid,
      ip: "Unknown", device_id: "ghost-ua-detected", is_bot: "True",
      time_on_page: "0", score: "100", interactions: "0",
      scroll_depth: "0", is_vpn: "0", country: "Bot",
      ua: UA.substring(0, 200)
    };
    var ghostUrl = EDGE_URL + "?" + new URLSearchParams(ghostPayload).toString();
    if (navigator.sendBeacon) navigator.sendBeacon(ghostUrl);
    else new Image().src = ghostUrl;
    sessionStorage.setItem(SESSION_KEY, "1");
    return;
  }

  // ============================================================
  //  DATACENTER PREFIX LIST
  // ============================================================
  var DATACENTER_PREFIXES = [
    "3.","13.","15.","18.","34.","35.","44.","52.","54.","99.",
    "20.","40.","51.","104.","168.",
    "51.68.","51.75.","51.77.","51.89.","54.36.","54.38.",
    "91.121.","94.23.","95.211.","176.31.",
    "104.131.","104.236.","107.170.","128.199.","134.209.","138.197.",
    "138.68.","139.59.","142.93.","143.110.","159.65.","159.89.",
    "165.22.","167.99.","178.128.","188.166.","206.189.","207.154.",
    "45.32.","45.63.","45.76.","45.77.","66.42.","104.156.","108.61.",
    "149.28.","155.138.","207.246.",
    "45.33.","45.56.","45.79.","66.175.","96.126.","139.162.","172.104.","173.230.",
    "5.9.","5.161.","23.88.","65.108.","78.46.","88.99.","95.216.",
    "116.202.","116.203.","128.140.","135.181.","136.243.","138.201.",
    "144.76.","148.251.","157.90.","159.69.","162.55.","167.235.",
    "168.119.","176.9.","178.63.","188.34.","195.201.","213.239.",
    "162.120.","162.253.",
    "104.16.","104.17.","104.18.","104.19.","104.20.","104.21.","104.22.",
    "104.24.","104.25.","104.26.","104.27.","104.28.",
    "172.64.","172.65.","172.66.","172.67.","172.68.","172.69.","172.70.","172.71.",
    "185.220.","199.249.","204.13.",
    "95.211.","185.195.","194.163.","195.201.","207.180.","64.237.","192.3.",
    "193.186.","193.187.","193.188."
  ];

  function isDataCenterIP(ip) {
    if (!ip || ip === "Unknown") return false;
    return DATACENTER_PREFIXES.some(function (p) { return ip.indexOf(p) === 0; });
  }

  // ============================================================
  //  INTERACTION & SCROLL TRACKING
  // ============================================================
  var interactionCount = 0, scrollDepth = 0, touchMoveCount = 0;
  var firstInteractMs  = null, mousePoints = 0;
  var lastMouseX = -1, lastMouseY = -1;
  var touchDetected = false, keyDetected = false;
  var initTime = performance.now();

  function recordInteraction(type) {
    interactionCount++;
    if (firstInteractMs === null) firstInteractMs = performance.now() - initTime;
    if (type === "touch" || type === "touchmove") touchDetected = true;
    if (type === "key") keyDetected = true;
  }

  window.addEventListener("mousemove", function (e) {
    var dx = Math.abs(e.clientX - lastMouseX), dy = Math.abs(e.clientY - lastMouseY);
    if (dx + dy > 50) {
      mousePoints++; lastMouseX = e.clientX; lastMouseY = e.clientY;
      recordInteraction("mouse");
    }
  });
  window.addEventListener("scroll", function () {
    var d = Math.round(
      (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100
    );
    if (d > scrollDepth && d <= 100) scrollDepth = d;
    recordInteraction("scroll");
  }, { passive: true });
  window.addEventListener("click",     function () { recordInteraction("click"); });
  window.addEventListener("keydown",   function () { recordInteraction("key"); });
  window.addEventListener("touchstart",function () { recordInteraction("touch"); }, { passive: true });
  window.addEventListener("touchmove", function () { touchMoveCount++; recordInteraction("touchmove"); }, { passive: true });

  // ============================================================
  //  FINGERPRINT
  // ============================================================
  function buildFingerprint() {
    var cv = document.createElement("canvas"), ctx = cv.getContext("2d");
    ctx.textBaseline = "top"; ctx.font = "14px Arial";
    ctx.fillStyle = "#f60"; ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069"; ctx.fillText("TrackerV10", 2, 15);
    var raw = cv.toDataURL() + UA + screen.width + "x" + screen.height +
              new Date().getTimezoneOffset();
    var hash = 0;
    for (var i = 0; i < raw.length; i++) hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    return "DEV-" + Math.abs(hash).toString(16);
  }

  var deviceId = null;
  try { deviceId = localStorage.getItem("ftv10_device"); } catch (e) {}
  if (!deviceId) {
    deviceId = buildFingerprint();
    try { localStorage.setItem("ftv10_device", deviceId); } catch (e) {}
  }

  // ============================================================
  //  CLOUDFLARE IP TRACE
  // ============================================================
  var ipData  = { ip: "Unknown", vpn: "0", country: "" };
  var ipReady = false;

  function fetchIP() {
    fetch("https://cloudflare.com/cdn-cgi/trace", { signal: AbortSignal.timeout(3000) })
      .then(function (r) { return r.text(); })
      .then(function (txt) {
        var obj = {};
        txt.split("\n").forEach(function (l) {
          var p = l.split("=");
          if (p.length === 2) obj[p[0].trim()] = p[1].trim();
        });
        if (obj.ip) { ipData.ip = obj.ip; ipData.country = obj.loc || ""; }
      })
      .catch(function () {})
      .finally(function () {
        ipReady = true;
        if (isDataCenterIP(ipData.ip)) sendData();
      });
  }
  fetchIP();

  // ============================================================
  //  SCORING
  // ============================================================
  function isHardwareBot() {
    return (navigator.webdriver === true || window._phantom ||
            UA_LOWER.indexOf("headlesschrome") !== -1);
  }

  function calculateScore(timeOnPage) {
    var s = 0;
    if (isHardwareBot())                                              s += 100;
    if (isDataCenterIP(ipData.ip))                                   s += 80;
    if (interactionCount === 0 && touchMoveCount === 0 && timeOnPage > 4) s += 30;
    if (firstInteractMs !== null && firstInteractMs < 250)           s += 30;
    if (scrollDepth === 0 && timeOnPage > 8)                         s += 20;
    if (!touchDetected && !keyDetected && interactionCount < 2 && timeOnPage > 6) s += 15;
    return s;
  }

  // ============================================================
  //  SEND TO SUPABASE EDGE FUNCTION
  // ============================================================
  var dataSent = false;

  function sendData() {
    if (dataSent || sessionStorage.getItem(SESSION_KEY)) return;
    if (!ipReady) { setTimeout(sendData, 1000); return; }

    dataSent = true;
    sessionStorage.setItem(SESSION_KEY, "1");

    var timeOnPage  = Math.round((performance.now() - initTime) / 1000);
    var finalScore  = calculateScore(timeOnPage);
    var finalIsBot  = finalScore >= 50 ? "True" : "False";

    var payload = new URLSearchParams({
      key:          CLIENT_TOKEN,
      ip:           ipData.ip,
      gclid:        gclid,
      website:      WEBSITE_NAME,
      device_id:    deviceId,
      is_bot:       finalIsBot,
      time_on_page: String(timeOnPage),
      score:        String(finalScore),
      interactions: String(interactionCount),
      scroll_depth: String(scrollDepth),
      is_vpn:       ipData.vpn,
      country:      ipData.country,
      ua:           UA.substring(0, 200)
    }).toString();

    var finalUrl = EDGE_URL + "?" + payload;

    if (navigator.sendBeacon) navigator.sendBeacon(finalUrl);
    else new Image().src = finalUrl;
  }

  window.addEventListener("pagehide",        sendData, { once: true });
  window.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") sendData();
  });
  setTimeout(sendData, 20000);

})();