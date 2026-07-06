(function () {
  "use strict";

  var EDGE_URL = "https://dcqppxhrahpwqtobgsfo.supabase.co/functions/v1/fraud-ingest";
  var CONV_URL = "https://dcqppxhrahpwqtobgsfo.supabase.co/functions/v1/conversion-ingest";

  var WEBSITE_NAME = "";
  var CLIENT_TOKEN = "";

  if (window._ftSite && window._ftKey) {
    WEBSITE_NAME = window._ftSite;
    CLIENT_TOKEN = window._ftKey;
  }

  if (!CLIENT_TOKEN) {
    var scriptEl = document.currentScript || (function () {
      var tags = document.getElementsByTagName("script");
      return tags[tags.length - 1];
    })();
    var scriptSrc = scriptEl ? scriptEl.src : "";
    try {
      var qIdx = scriptSrc.indexOf("?");
      if (qIdx !== -1) {
        new URLSearchParams(scriptSrc.slice(qIdx + 1)).forEach(function (v, k) {
          if (k === "site") WEBSITE_NAME = v;
          if (k === "key")  CLIENT_TOKEN = v;
        });
      }
      if (!CLIENT_TOKEN && scriptEl) {
        WEBSITE_NAME = scriptEl.getAttribute("data-site") || WEBSITE_NAME;
        CLIENT_TOKEN = scriptEl.getAttribute("data-key")  || CLIENT_TOKEN;
      }
    } catch (e) {}
  }

  if (!CLIENT_TOKEN || !WEBSITE_NAME || WEBSITE_NAME === "Unknown") return;

  var EDGE_IP      = (window._ftIP && window._ftIP !== "Unknown") ? window._ftIP : null;
  var EDGE_COUNTRY = window._ftCountry || "";

  var urlParams = new URLSearchParams(window.location.search);
  var rawGclid  = urlParams.get("gclid");
  var rawWbraid = urlParams.get("wbraid") || urlParams.get("gbraid");
  var gclid     = rawGclid || rawWbraid;

  if (!gclid) return;
  if (rawGclid && (rawGclid.length < 20 || rawGclid.toLowerCase().startsWith("gtm_"))) return;
  if (!rawGclid && rawWbraid && rawWbraid.length < 10) return;
  if (/test|fake|demo/i.test(gclid) || document.cookie.indexOf("__TAG_ASSISTANT") !== -1) return;

  var SESSION_KEY = "ftv11_" + gclid;
  if (sessionStorage.getItem(SESSION_KEY)) return;

  var UA       = navigator.userAgent;
  var UA_LOWER = UA.toLowerCase();

  var LEGIT_BOTS = ["googlebot","adsbot-google","mediapartners-google",
                    "google-inspectiontool","bingbot","yandexbot"];
  if (LEGIT_BOTS.some(function (b) { return UA_LOWER.indexOf(b) !== -1; })) return;

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

  function isHardwareBot() {
    return (
      navigator.webdriver === true ||
      !!window._phantom ||
      UA_LOWER.indexOf("headlesschrome") !== -1
    );
  }

  var noLangs = !navigator.languages || navigator.languages.length === 0;

  if (isHardwareBot()) {
    var ghostPayload = {
      key:          CLIENT_TOKEN,
      website:      WEBSITE_NAME,
      gclid:        gclid,
      ip:           EDGE_IP || "Unknown",
      device_id:    "ghost-ua-detected",
      is_bot:       "True",
      time_on_page: "0",
      score:        "100",
      interactions: "0",
      scroll_depth: "0",
      is_vpn:       "0",
      country:      EDGE_COUNTRY || "Bot",
      ua:           UA.substring(0, 200)
    };
    var ghostUrl = EDGE_URL + "?" + new URLSearchParams(ghostPayload).toString();
    if (navigator.sendBeacon) navigator.sendBeacon(ghostUrl);
    else new Image().src = ghostUrl;
    sessionStorage.setItem(SESSION_KEY, "1");
    return;
  }

  // ── Active time tracking (tab background time exclude) ──
  var activeTime   = 0;
  var lastVisible  = performance.now();
  var initTime     = performance.now();

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      activeTime += performance.now() - lastVisible;
    } else {
      lastVisible = performance.now();
    }
  });

  function getActiveTime() {
    var current = (document.visibilityState === "hidden")
      ? activeTime
      : activeTime + (performance.now() - lastVisible);
    return Math.round(current / 1000);
  }

  // ── Interaction tracking ──
  var interactionCount      = 0;
  var scrollDepth           = 0;
  var touchMoveCount        = 0;
  var firstInteractMs       = null;
  var firstNonScrollMs      = null;
  var mousePoints           = 0;
  var lastMouseX            = -1;
  var lastMouseY            = -1;
  var touchDetected         = false;
  var keyDetected           = false;
  var mouseMovements        = [];
  var clickTimings          = [];
  var honeypotTriggered     = false;

  function recordInteraction(type) {
    interactionCount++;
    var now = performance.now();
    if (firstInteractMs === null) firstInteractMs = now - initTime;
    if (type !== "scroll" && firstNonScrollMs === null) firstNonScrollMs = now - initTime;
    if (type === "touch" || type === "touchmove") touchDetected = true;
    if (type === "key") keyDetected = true;
  }

  window.addEventListener("mousemove", function (e) {
    var dx = Math.abs(e.clientX - lastMouseX);
    var dy = Math.abs(e.clientY - lastMouseY);
    if (dx + dy > 50) {
      mousePoints++;
      mouseMovements.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (mouseMovements.length > 30) mouseMovements.shift();
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      recordInteraction("mouse");
    }
  });

  window.addEventListener("scroll", function () {
    var scrollable = Math.max(
      document.body.scrollHeight        || 0,
      document.documentElement.scrollHeight || 0
    ) - window.innerHeight;
    var d;
    if (scrollable <= 0) {
      d = 100;
    } else {
      d = Math.round((window.scrollY / scrollable) * 100);
      if (d > 100) d = 100;
      if (d < 0)   d = 0;
    }
    if (d > scrollDepth) scrollDepth = d;
    recordInteraction("scroll");
  }, { passive: true });

  window.addEventListener("click", function () {
    clickTimings.push(performance.now() % 100);
    if (clickTimings.length > 10) clickTimings.shift();
    recordInteraction("click");
  });

  window.addEventListener("keydown",    function () { recordInteraction("key"); });
  window.addEventListener("touchstart", function () { recordInteraction("touch"); }, { passive: true });
  window.addEventListener("touchmove",  function () {
    touchMoveCount++;
    recordInteraction("touchmove");
  }, { passive: true });

  // ── Mouse entropy (bots move in straight lines) ──
  function getMouseEntropy() {
    if (mouseMovements.length < 6) return 1;
    var angles = [];
    for (var i = 1; i < mouseMovements.length - 1; i++) {
      var dx1 = mouseMovements[i].x   - mouseMovements[i - 1].x;
      var dy1 = mouseMovements[i].y   - mouseMovements[i - 1].y;
      var dx2 = mouseMovements[i + 1].x - mouseMovements[i].x;
      var dy2 = mouseMovements[i + 1].y - mouseMovements[i].y;
      if (dx1 === 0 && dy1 === 0) continue;
      if (dx2 === 0 && dy2 === 0) continue;
      angles.push(Math.abs(Math.atan2(dy2, dx2) - Math.atan2(dy1, dx1)));
    }
    if (angles.length === 0) return 1;
    return angles.reduce(function (s, a) { return s + a; }, 0) / angles.length;
  }

  // ── Click timing (bots click on round milliseconds) ──
  function hasRobotClickTimings() {
    if (clickTimings.length < 3) return false;
    var roundCount = clickTimings.filter(function (t) {
      return t < 5 || (t > 45 && t < 55) || t > 95;
    }).length;
    return (roundCount / clickTimings.length) > 0.7;
  }

  // ── Improved fingerprint (stable across sessions) ──
  function buildFingerprint() {
    var cv  = document.createElement("canvas");
    var ctx = cv.getContext("2d");
    ctx.textBaseline = "top";
    ctx.font         = "14px Arial";
    ctx.fillStyle    = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle    = "#069";
    ctx.fillText("TrackerV11", 2, 15);

    var plugins = "";
    try {
      plugins = Array.prototype.slice.call(navigator.plugins || [])
        .map(function (p) { return p.name; }).sort().join(",");
    } catch (e) {}

    var tz      = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}

    var memory  = navigator.deviceMemory        || 0;
    var cores   = navigator.hardwareConcurrency || 0;

    var raw = cv.toDataURL()
            + UA
            + screen.width + "x" + screen.height
            + new Date().getTimezoneOffset()
            + cores + memory + tz + plugins;

    var hash = 0;
    for (var i = 0; i < raw.length; i++)
      hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    return "DEV-" + Math.abs(hash).toString(16);
  }

  var deviceId = null;
  try { deviceId = localStorage.getItem("ftv11_device"); } catch (e) {}
  if (!deviceId) {
    deviceId = buildFingerprint();
    try { localStorage.setItem("ftv11_device", deviceId); } catch (e) {}
  }

  // ── Honeypot injection ──
  function injectHoneypot() {
    document.querySelectorAll("form").forEach(function (form) {
      if (form.querySelector(".ftv11-hp")) return;
      var hp       = document.createElement("input");
      hp.type      = "text";
      hp.name      = "website";
      hp.className = "ftv11-hp";
      hp.style.cssText = "position:absolute;left:-9999px;opacity:0;height:0;width:0;";
      hp.tabIndex  = -1;
      hp.autocomplete = "off";
      form.appendChild(hp);
      form.addEventListener("submit", function () {
        if (hp.value !== "") honeypotTriggered = true;
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectHoneypot);
  } else {
    injectHoneypot();
  }

  // ── IP + conversion state ──
  var ipData      = { ip: "Unknown", vpn: "0", country: "" };
  var ipReady     = false;
  var convSent    = {};
  var convPending = [];

  function flushPendingConversions() {
    while (convPending.length > 0) {
      _doSendConversion(convPending.shift());
    }
  }

  function _doSendConversion(type) {
    if (convSent[type]) return;
    if (interactionCount < 1 && scrollDepth === 0 && !touchDetected) return;
    convSent[type] = true;
    var url = CONV_URL + "?" + new URLSearchParams({
      key:       CLIENT_TOKEN,
      gclid:     gclid,
      website:   WEBSITE_NAME,
      type:      type,
      ip:        ipData.ip,
      device_id: deviceId
    }).toString();
    if (navigator.sendBeacon) navigator.sendBeacon(url);
    else new Image().src = url;
  }

  function sendConversion(type) {
    if (convSent[type]) return;
    if (ipReady) {
      _doSendConversion(type);
    } else {
      if (convPending.indexOf(type) === -1) convPending.push(type);
    }
  }

  function bindConversions() {
    document.querySelectorAll('a[href^="tel:"]').forEach(function (el) {
      el.addEventListener("click", function () { sendConversion("phone"); });
    });
    document.querySelectorAll('a[href*="wa.me"], a[href*="whatsapp"]').forEach(function (el) {
      el.addEventListener("click", function () { sendConversion("whatsapp"); });
    });
    document.querySelectorAll("form").forEach(function (form) {
      form.addEventListener("submit", function () { sendConversion("form"); });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindConversions);
  } else {
    bindConversions();
  }

  // ── IP fetch ──
  function fetchIP() {
    if (EDGE_IP) {
      ipData.ip      = EDGE_IP;
      ipData.country = EDGE_COUNTRY || ipData.country;
      ipReady        = true;
      flushPendingConversions();
      if (isDataCenterIP(ipData.ip)) sendData();
      return;
    }
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
        flushPendingConversions();
        if (isDataCenterIP(ipData.ip)) sendData();
      });
  }
  fetchIP();

  // ── Score calculation ──
  function calculateScore(timeOnPage) {
    var s = 0;

    if (isHardwareBot())                                                           s += 100;
    if (isDataCenterIP(ipData.ip))                                                 s += 80;
    if (honeypotTriggered)                                                         s += 80;
    if (noLangs)                                                                   s += 20;
    if (interactionCount === 0 && touchMoveCount === 0 && timeOnPage > 4)         s += 30;
    if (firstNonScrollMs !== null && firstNonScrollMs < 250)                      s += 30;
    if (scrollDepth === 0 && timeOnPage > 8)                                      s += 20;
    if (!touchDetected && !keyDetected && interactionCount < 2 && timeOnPage > 6) s += 15;

    if (mousePoints > 5 && getMouseEntropy() < 0.1)                               s += 25;
    if (hasRobotClickTimings())                                                    s += 20;

    return Math.min(s, 100);
  }

  // ── Main send ──
  var dataSent  = false;
  var finalUrl  = "";

  function sendData() {
    if (dataSent || sessionStorage.getItem(SESSION_KEY)) return;
    if (!ipReady) { setTimeout(sendData, 1000); return; }

    dataSent = true;
    sessionStorage.setItem(SESSION_KEY, "1");

    var timeOnPage = getActiveTime();
    var finalScore = calculateScore(timeOnPage);
    var finalIsBot = finalScore >= 50 ? "True" : "False";

    finalUrl = EDGE_URL + "?" + new URLSearchParams({
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

    if (navigator.sendBeacon) navigator.sendBeacon(finalUrl);
    else new Image().src = finalUrl;
  }

  // ── iOS BFCache-safe pagehide ──
  window.addEventListener("pagehide", function (e) {
    if (!dataSent && ipReady) {
      var timeOnPage = getActiveTime();
      var finalScore = calculateScore(timeOnPage);
      var finalIsBot = finalScore >= 50 ? "True" : "False";
      finalUrl = EDGE_URL + "?" + new URLSearchParams({
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
    }
    if (e.persisted) {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", finalUrl, false);
        xhr.send();
      } catch (ex) {
        new Image().src = finalUrl;
      }
    } else {
      sendData();
    }
  }, { once: true });

  window.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") sendData();
  });

  setTimeout(sendData, 20000);

})();
