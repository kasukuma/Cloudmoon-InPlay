var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

const DEFAULT_ALLOWED_HOSTS = [
  "web.cloudmoonapp.com",
  "cloudmoonapp.com",
  "www.cloudmoonapp.com",
  "assets.cloudmoonapp.com",
  "cdn.jsdelivr.net",
  "unpkg.com",
  "cdnjs.cloudflare.com",
  "fonts.gstatic.com",
  "fonts.googleapis.com",
  "ssl.gstatic.com",
  "googleapis.com",
  "gstatic.com"
];

function resolveAllowedHosts(env) {
  if (!env || typeof env.ALLOWED_HOSTS !== "string") {
    return DEFAULT_ALLOWED_HOSTS;
  }

  return env.ALLOWED_HOSTS
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

function isPrivateHostname(hostname) {
  if (!hostname) {
    return true;
  }

  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]") {
    return true;
  }

  if (/^127\./.test(normalized)) {
    return true;
  }

  if (/^10\./.test(normalized) || /^192\.168\./.test(normalized) || /^172\.(1[6-9]|2\d|3[01])\./.test(normalized)) {
    return true;
  }

  if (/^169\.254\./.test(normalized) || /^fc00:/i.test(normalized) || /^fe80:/i.test(normalized)) {
    return true;
  }

  return false;
}

function isAllowedTarget(targetURL, env = {}) {
  try {
    const url = new URL(targetURL);
    const protocolOk = ["http:", "https:", "ws:", "wss:"].includes(url.protocol);
    if (!protocolOk) {
      return false;
    }

    const hostname = url.hostname.toLowerCase();
    if (isPrivateHostname(hostname)) {
      return false;
    }

    const allowedHosts = resolveAllowedHosts(env);
    return allowedHosts.some((host) => {
      const normalizedHost = host.toLowerCase();
      return normalizedHost === hostname || hostname.endsWith(`.${normalizedHost}`);
    });
  } catch (error) {
    return false;
  }
}

function buildProxyTarget(request, env = {}) {
  const url = new URL(request.url);

  if (url.pathname.startsWith("/proxy/")) {
    const encodedURL = url.pathname.substring("/proxy/".length);
    const decodedURL = decodeURIComponent(encodedURL);
    const baseTarget = decodedURL.includes("://") ? decodedURL : `https://${decodedURL}`;
    return url.search ? `${baseTarget}${url.search}` : baseTarget;
  }

  return `https://web.cloudmoonapp.com${url.pathname}${url.search}`;
}

function getWebRTCConfig(env = {}) {
  const stunServers = [
    "stun:stun.cloudflare.com:3478",
    "stun:stun.cloudflare.com:5349"
  ];

  const iceServers = [{ urls: stunServers }];
  const turnURL = typeof env.TURN_URL === "string" ? env.TURN_URL.trim() : "turns:global.turn.cloudflare.com:443?transport=tcp";

  if (turnURL) {
    const turnConfig = { urls: [turnURL] };
    if (typeof env.TURN_USERNAME === "string" && env.TURN_USERNAME.trim()) {
      turnConfig.username = env.TURN_USERNAME.trim();
    }
    if (typeof env.TURN_CREDENTIAL === "string" && env.TURN_CREDENTIAL.trim()) {
      turnConfig.credential = env.TURN_CREDENTIAL.trim();
    }
    iceServers.push(turnConfig);
  }

  return iceServers;
}

async function handleWebSocketUpgrade(request, env = {}) {
  const targetURL = buildProxyTarget(request, env);
  if (!isAllowedTarget(targetURL, env)) {
    return new Response("Forbidden: host not allowed", { status: 403 });
  }

  const upstreamURL = new URL(targetURL);
  const upstreamProtocol = upstreamURL.protocol === "https:" ? "wss:" : upstreamURL.protocol === "http:" ? "ws:" : upstreamURL.protocol;
  upstreamURL.protocol = upstreamProtocol;

  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  const upstream = new WebSocket(upstreamURL.toString());

  const relayMessage = (source, target) => {
    source.addEventListener("message", (event) => {
      try {
        if (typeof event.data === "string") {
          target.send(event.data);
        } else if (event.data instanceof ArrayBuffer) {
          target.send(event.data);
        } else if (event.data instanceof Blob) {
          target.send(event.data);
        } else {
          target.send(String(event.data));
        }
      } catch (error) {
        console.warn("[Worker] WebSocket relay message error", error);
      }
    });
  };

  const relayClose = (source, target) => {
    source.addEventListener("close", (event) => {
      try {
        target.close(event.code, event.reason || "worker-relay-close");
      } catch (error) {
        console.warn("[Worker] WebSocket relay close error", error);
      }
    });
  };

  const relayError = (source, target, label) => {
    source.addEventListener("error", () => {
      try {
        target.close(1011, `${label}-error`);
      } catch (error) {
        console.warn("[Worker] WebSocket relay error forwarding failed", error);
      }
    });
  };

  server.accept();
  relayMessage(server, upstream);
  relayMessage(upstream, server);
  relayClose(server, upstream);
  relayClose(upstream, server);
  relayError(server, upstream, "client");
  relayError(upstream, server, "upstream");

  return new Response(null, {
    status: 101,
    webSocket: client
  });
}

var worker_default = {
  async fetch(request, env) {
    return handleRequest(request, env);
  }
};

var AD_PATTERNS = [
  "googlesyndication.com",
  "doubleclick.net",
  "googleadservices.com",
  "google-analytics.com",
  "googletagmanager.com",
  "googletagservices.com",
  "adservice.google.com",
  "pagead2.googlesyndication.com",
  "tpc.googlesyndication.com",
  "video-ad-stats.googlesyndication.com",
  "ads.google.com",
  "adssettings.google.com",
  "static.ads-twitter.com",
  "ads-api.twitter.com",
  "ads.facebook.com",
  "an.facebook.com",
  "adnxs.com",
  "advertising.com",
  "outbrain.com",
  "taboola.com",
  "criteo.com",
  "pubmatic.com",
  "rubiconproject.com",
  "openx.net",
  "adsafeprotected.com",
  "moatads.com",
  "scorecardresearch.com",
  "/ads/",
  "/ad/",
  "/advert/",
  "/advertisement/",
  "/adsense/",
  "/adserver/",
  "/analytics/",
  "prebid",
  "advertis",
  "banner",
  "popup"
];

function isAdRequest(url) {
  const urlLower = url.toLowerCase();
  return AD_PATTERNS.some((pattern) => urlLower.includes(pattern));
}
__name(isAdRequest, "isAdRequest");

async function handleRequest(request, env = {}) {
  const url = new URL(request.url);
  if (request.headers.get("Upgrade") && request.headers.get("Upgrade").toLowerCase() === "websocket") {
    return handleWebSocketUpgrade(request, env);
  }

  if (url.pathname === "/" || url.pathname === "") {
    return new Response(getMainHTML(env), {
      headers: {
        "Content-Type": "text/html",
        "Permissions-Policy": "accelerometer=*, gyroscope=*, camera=*, microphone=*, geolocation=*, hid=*, midi=*, clipboard-read=*, clipboard-write=*, xr-spatial-tracking=*, gamepad=*"
      }
    });
  }

  if (url.pathname === "/manifest.json") {
    return new Response(getManifest(), {
      headers: { "Content-Type": "application/manifest+json" }
    });
  }

  if (url.pathname === "/sw.js") {
    return new Response(getServiceWorker(), {
      headers: {
        "Content-Type": "application/javascript",
        "Service-Worker-Allowed": "/"
      }
    });
  }

  if (url.pathname === "/favicon.png") {
    const iconRes = await fetch("https://ssl.gstatic.com/classroom/favicon.png");
    const iconHeaders = new Headers(iconRes.headers);
    iconHeaders.set("Cache-Control", "public, max-age=86400");
    return new Response(iconRes.body, {
      status: iconRes.status,
      headers: iconHeaders
    });
  }

  if (url.pathname === "/icon.svg") {
    let iconRes = await fetch("https://fonts.gstatic.com/s/i/productlogos/classroom/v8/192px.svg");
    const isSVG = iconRes.ok;
    if (!isSVG) {
      iconRes = await fetch("https://ssl.gstatic.com/classroom/favicon.png");
    }
    const iconHeaders = new Headers(iconRes.headers);
    iconHeaders.set("Content-Type", isSVG ? "image/svg+xml" : "image/png");
    iconHeaders.set("Cache-Control", "public, max-age=86400");
    return new Response(iconRes.body, {
      status: iconRes.status,
      headers: iconHeaders
    });
  }

  if (url.pathname === "/icon-192.png") {
    let iconRes = await fetch("https://fonts.gstatic.com/s/i/productlogos/classroom/v8/192px.png");
    if (!iconRes.ok) {
      iconRes = await fetch("https://ssl.gstatic.com/classroom/favicon.png");
    }
    const iconHeaders = new Headers(iconRes.headers);
    iconHeaders.set("Content-Type", "image/png");
    iconHeaders.set("Cache-Control", "public, max-age=86400");
    return new Response(iconRes.body, {
      status: iconRes.status,
      headers: iconHeaders
    });
  }

  if (url.pathname === "/icon-512.png") {
    let iconRes = await fetch("https://fonts.gstatic.com/s/i/productlogos/classroom/v8/512px.png");
    if (!iconRes.ok) {
      iconRes = await fetch("https://fonts.gstatic.com/s/i/productlogos/classroom/v8/192px.png");
    }
    if (!iconRes.ok) {
      iconRes = await fetch("https://ssl.gstatic.com/classroom/favicon.png");
    }
    const iconHeaders = new Headers(iconRes.headers);
    iconHeaders.set("Content-Type", "image/png");
    iconHeaders.set("Cache-Control", "public, max-age=86400");
    return new Response(iconRes.body, {
      status: iconRes.status,
      headers: iconHeaders
    });
  }

  return proxyCloudMoon(request, env);
}
__name(handleRequest, "handleRequest");

async function proxyCloudMoon(request, env = {}) {
  const url = new URL(request.url);
  let targetURL;

  try {
    targetURL = buildProxyTarget(request, env);
  } catch (error) {
    console.error("Failed to resolve proxy URL:", error);
    return new Response("Invalid proxy URL", { status: 400 });
  }

  if (!isAllowedTarget(targetURL, env)) {
    console.warn("[Worker] Blocked disallowed target host:", targetURL);
    return new Response("Forbidden: host not allowed", { status: 403 });
  }

  if (isAdRequest(targetURL)) {
    console.log("[Ad Blocked] Blocked an add URL request for recource savings:", targetURL);
    return new Response("", { status: 204 });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Max-Age": "86400"
      }
    });
  }

  console.log("Proxying:", targetURL);
  const headers = new Headers(request.headers);
  const upstreamURL = new URL(targetURL);
  headers.set("Host", upstreamURL.host);
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ray");
  headers.delete("x-forwarded-proto");
  headers.delete("x-real-ip");
  if (upstreamURL.origin && !headers.has("Origin")) {
    headers.set("Origin", upstreamURL.origin);
  }
  if (!headers.has("User-Agent")) {
    headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
  }

  const proxyRequest = new Request(targetURL, {
    method: request.method,
    headers,
    body: request.body,
    redirect: "follow"
  });

  let response;
  try {
    response = await fetch(proxyRequest);
  } catch (error) {
    console.error("Proxy fetch failed:", error);
    return new Response("Failed to fetch resource", { status: 502 });
  }

  if (response.status === 404) {
    console.log("[Worker] Resource could not found (404):", targetURL);
  }

  const newHeaders = new Headers(response.headers);
  newHeaders.set("Access-Control-Allow-Origin", "*");
  newHeaders.set("Access-Control-Allow-Methods", "*");
  newHeaders.set("Access-Control-Allow-Headers", "*");
  newHeaders.set("Access-Control-Allow-Credentials", "true");
  newHeaders.delete("Content-Security-Policy");
  newHeaders.delete("X-Frame-Options");
  newHeaders.delete("Frame-Options");

  const contentType = response.headers.get("Content-Type") || "";
  if (contentType.includes("text/html")) {
    let html = await response.text();
    html = blockAdsInHTML(html);
    const injectionCode = `
<style id="cm-ad-blocker-css">
  .a-div-horizontal,
  .a-div-vertical,
  .a-div-placeholder,
  .a-div-box {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    position: absolute !important;
    width: 0 !important;
    height: 0 !important;
    overflow: hidden !important;
  }
</style>
<script id="cm-fix-js">
(function(){
  const RTC_ICE_SERVERS = ${JSON.stringify(getWebRTCConfig(env))};
  window.__CLOUDMOON_ICE_SERVERS__ = RTC_ICE_SERVERS;
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0];
    if (typeof url === 'string' && isAdUrl(url)) {
      return Promise.reject(new Error('Ad blocked'));
    }
    return originalFetch.apply(this, args);
  };

  const originalXHR = window.XMLHttpRequest.prototype.open;
  window.XMLHttpRequest.prototype.open = function(method, url) {
    if (isAdUrl(url)) {
      return;
    }
    return originalXHR.apply(this, arguments);
  };

  function isAdUrl(url) {
    const adPatterns = [
      'googlesyndication', 'doubleclick', 'googleadservices',
      'google-analytics', 'googletagmanager', 'googletagservices',
      '/ads/', '/ad/', '/advert', 'adsense', 'analytics',
      'facebook.com/ads', 'twitter.com/ads'
    ];
    return adPatterns.some((pattern) => String(url).toLowerCase().includes(pattern));
  }

  function removeAds() {
    const selectors = [
      'iframe[src*="googlesyndication"]',
      'iframe[src*="doubleclick"]',
      'iframe[src*="google-analytics"]',
      'div[id*="google_ads"]',
      'div[class*="adsbygoogle"]',
      'ins.adsbygoogle',
      '[data-ad-slot]',
      '[data-ad-client]'
    ];
    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        el.style.display = 'none';
        try { el.remove(); } catch (error) {}
      });
    });

    const adDivs = document.querySelectorAll('.a-div-horizontal, .a-div-vertical, .a-div-placeholder, .a-div-box');
    adDivs.forEach((el) => {
      el.style.display = 'none';
      el.style.visibility = 'hidden';
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
      el.style.position = 'absolute';
      el.style.width = '0';
      el.style.height = '0';
      el.style.overflow = 'hidden';
      try { el.remove(); } catch (error) {}
    });
  }

  function fixButtons() {
    var allBtns = document.querySelectorAll("button.google-button, button.apple-button");
    for (var i = 0; i < allBtns.length; i++) {
      var btn = allBtns[i];
      var styleAttr = btn.getAttribute("style") || "";
      if (styleAttr.indexOf("123, 108, 196") !== -1 || styleAttr.indexOf("123,108,196") !== -1) {
        btn.style.setProperty("display", "flex", "important");
        btn.style.setProperty("visibility", "visible", "important");
        btn.style.setProperty("opacity", "1", "important");
        btn.style.setProperty("pointer-events", "auto", "important");
        btn.style.setProperty("flex-direction", "row", "important");
        btn.style.setProperty("justify-content", "center", "important");
        btn.style.setProperty("align-items", "center", "important");
        btn.style.setProperty("gap", "1rem", "important");
        btn.style.setProperty("width", "min(350px, 100%)", "important");
        btn.style.setProperty("height", "45px", "important");
        btn.style.setProperty("border-radius", "5rem", "important");
        btn.style.setProperty("cursor", "pointer", "important");
        btn.style.setProperty("font-size", "1rem", "important");
      } else if (styleAttr.indexOf("255, 255, 255") !== -1 || styleAttr.indexOf("#fff") !== -1 || styleAttr.indexOf("white") !== -1 || btn.querySelector("svg")) {
        btn.style.setProperty("display", "none", "important");
        btn.style.setProperty("visibility", "hidden", "important");
      }
    }
  }

  removeAds();
  fixButtons();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function() {
      fixButtons();
      removeAds();
    });
  }
  window.addEventListener("load", function() {
    fixButtons();
    removeAds();
  });
  setInterval(function() {
    fixButtons();
    removeAds();
  }, 200);

  var observer = new MutationObserver(function() {
    fixButtons();
    removeAds();
  });
  function startObserver() {
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class"]
      });
    } else {
      setTimeout(startObserver, 10);
    }
  }
  startObserver();

  var origOpen = window.open;
  var workerOrigin = window.location.origin;
  function sendGameUrl(url) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "LOAD_GAME", url }, workerOrigin);
    }
  }
  function makeFakeWindow() {
    var locObj = { _href: 'about:blank' };
    Object.defineProperty(locObj, 'href', {
      get: function() { return this._href; },
      set: function(url) {
        this._href = url;
        if (typeof url === 'string' && url.indexOf('/run-site/') > -1) { sendGameUrl(url); }
      }
    });
    locObj.assign = function(url) { locObj.href = url; };
    locObj.replace = function(url) { locObj.href = url; };
    return {
      closed: false,
      close: function(){},
      focus: function(){},
      blur: function(){},
      location: locObj,
      document: { write: function(){}, close: function(){}, open: function(){} }
    };
  }
  window.open = function(u, t, f) {
    if (u && u.indexOf('/run-site/') > -1) {
      sendGameUrl(u);
      return makeFakeWindow();
    }
    if (!u || u === '' || u === 'about:blank') {
      return makeFakeWindow();
    }
    return origOpen.call(this, u, t, f);
  };
  document.addEventListener('click', function(e) {
    var a = e.target.closest('a');
    if (a && a.href && a.href.indexOf('/run-site/') > -1) {
      e.preventDefault();
      e.stopImmediatePropagation();
      sendGameUrl(a.href);
    }
  }, true);
  window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'REQUEST_FULLSCREEN') {
      var gameWrapper = document.querySelector('#gameWrapper');
      if (gameWrapper) {
        var inputDiv = document.querySelector('#input-div');
        var sidebar = document.querySelector('.sidebar.sidebar-open') || document.querySelector('.sidebar');
        var floatingBall = document.querySelector('#floating-ball');
        var elementsToRestore = [];

        function storeAndMoveElement(element) {
          if (!element) return;
          var originalParent = element.parentNode;
          var originalNextSibling = element.nextSibling;
          var originalStyle = element.getAttribute('style') || '';
          elementsToRestore.push({
            element,
            parent: originalParent,
            nextSibling: originalNextSibling,
            styleAttr: originalStyle,
          });
          gameWrapper.appendChild(element);
          element.style.position = 'fixed';
          element.style.zIndex = '999999';
          element.style.pointerEvents = 'auto';
          if (element.id === 'input-div') {
            element.style.bottom = '20px';
            element.style.left = '0px';
          } else if (element.id === 'floating-ball') {
            element.style.left = '0px';
            element.style.top = '50%';
            element.style.transform = 'translateY(-50%)';
          }
        }

        var originalWrapperPosition = gameWrapper.style.position;
        gameWrapper.style.position = 'relative';
        storeAndMoveElement(inputDiv);
        storeAndMoveElement(sidebar);
        storeAndMoveElement(floatingBall);

        var fullscreenExitHandler = function() {
          if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement) {
            return;
          }
          elementsToRestore.forEach(function(item) {
            if (item.element && item.parent) {
              if (item.nextSibling && item.nextSibling.parentNode === item.parent) {
                item.parent.insertBefore(item.element, item.nextSibling);
              } else {
                item.parent.appendChild(item.element);
              }
              if (item.styleAttr) {
                item.element.setAttribute('style', item.styleAttr);
              } else {
                item.element.removeAttribute('style');
              }
            }
          });
          if (originalWrapperPosition) {
            gameWrapper.style.position = originalWrapperPosition;
          } else {
            gameWrapper.style.position = '';
          }
          document.removeEventListener('fullscreenchange', fullscreenExitHandler);
          document.removeEventListener('webkitfullscreenchange', fullscreenExitHandler);
          document.removeEventListener('mozfullscreenchange', fullscreenExitHandler);
          document.removeEventListener('MSFullscreenChange', fullscreenExitHandler);
        };
        document.addEventListener('fullscreenchange', fullscreenExitHandler);
        document.addEventListener('webkitfullscreenchange', fullscreenExitHandler);
        document.addEventListener('mozfullscreenchange', fullscreenExitHandler);
        document.addEventListener('MSFullscreenChange', fullscreenExitHandler);
      }
    }
  });
})();
</script>`;

    if (html.includes("</head>")) {
      html = html.replace("</head>", injectionCode + "</head>");
    } else {
      html = injectionCode + html;
    }

    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  }

  if (contentType.includes("javascript") || contentType.includes("application/x-javascript")) {
    if (isAdRequest(targetURL)) {
      console.log("[Ad Blocked] Blocked ad script to save client recources:", targetURL);
      return new Response("// Ad script blocked", {
        status: 200,
        headers: { "Content-Type": "application/javascript" }
      });
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}
__name(proxyCloudMoon, "proxyCloudMoon");

function blockAdsInHTML(html) {
  html = html.replace(/<script[^>]*googlesyndication[^>]*>[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<script[^>]*adsbygoogle[^>]*>[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<script[^>]*google-analytics[^>]*>[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<script[^>]*googletagmanager[^>]*>[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<script[^>]*doubleclick[^>]*>[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<iframe[^>]*googlesyndication[^>]*>[\s\S]*?<\/iframe>/gi, "");
  html = html.replace(/<iframe[^>]*doubleclick[^>]*>[\s\S]*?<\/iframe>/gi, "");
  html = html.replace(/<ins[^>]*adsbygoogle[^>]*>[\s\S]*?<\/ins>/gi, "");
  html = html.replace(/<div[^>]*id="google_ads[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "");
  return html;
}
__name(blockAdsInHTML, "blockAdsInHTML");

function getMainHTML(env = {}) {
  const rtcIceServers = JSON.stringify(getWebRTCConfig(env));
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Home - Classroom</title>
  <meta name="description" content="Play Roblox, Fortnite, Call of Duty Mobile, Delta Force, and more in your browser">
  <meta name="theme-color" content="#2d2d2d">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="CloudMoon">
  <link rel="manifest" href="/manifest.json">
  <link rel="apple-touch-icon" href="/favicon.png">
  <link rel="icon" id="favicon" type="image/png" href="/favicon.png">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background: #0d1117; color: #c9d1d9; overflow: hidden; }
    #container { width: 100vw; height: 100vh; display: flex; flex-direction: column; }
    #frame-container { flex: 1; width: 100%; height: 100%; background: white; position: relative; }
    iframe { width: 100%; height: 100%; border: none; background: white; outline: none; }
    iframe:focus { outline: none; }
    #btn-dock { position: fixed; bottom: 18px; left: 18px; display: flex; flex-direction: row; gap: 10px; z-index: 9999; transition: opacity 0.3s; }
    #btn-dock.hidden { opacity: 0; pointer-events: none; }
    .dock-btn { width: 44px; height: 44px; border-radius: 50%; border: none; background: rgba(45, 45, 45, 0.85); color: #e0e0e0; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 10px rgba(0,0,0,0.4); }
    .dock-btn:hover { background: rgba(74, 74, 74, 0.95); }
    #install-btn { display: none; }
  </style>
</head>
<body>
  <div id="container">
    <div id="frame-container"></div>
  </div>
  <div id="btn-dock">
    <button class="dock-btn" id="home-btn" onclick="goBack()" title="Home">home</button>
    <button class="dock-btn" id="fullscreen-btn" onclick="enterFullscreen()" title="Fullscreen">full</button>
    <button class="dock-btn" id="install-btn" onclick="installPWA()" title="Install App">install</button>
  </div>
  <script>
    const frameContainer = document.getElementById('frame-container');
    let mainURL = '/web.cloudmoonapp.com/';
    let currentIframe = null;
    const SHADOW_LAYERS = 4;
    const RTC_ICE_SERVERS = ${rtcIceServers};
    window.__CLOUDMOON_ICE_SERVERS__ = Array.isArray(RTC_ICE_SERVERS) ? RTC_ICE_SERVERS : [];

    function generateRandomId() {
      return 'x' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    }

    function createMultiLayerShadowFrame(url, isGame = false) {
      frameContainer.innerHTML = '';
      let currentHost = document.createElement('div');
      currentHost.style.width = '100%';
      currentHost.style.height = '100%';
      currentHost.style.margin = '0';
      currentHost.style.padding = '0';
      currentHost.style.border = 'none';
      currentHost.style.display = 'block';
      currentHost.style.overflow = 'hidden';
      frameContainer.appendChild(currentHost);

      for (let i = 0; i < SHADOW_LAYERS; i++) {
        const shadowRoot = currentHost.attachShadow({ mode: 'closed' });

        if (i < SHADOW_LAYERS - 1) {
          const nextHost = document.createElement('div');
          nextHost.style.width = '100%';
          nextHost.style.height = '100%';
          nextHost.style.margin = '0';
          nextHost.style.padding = '0';
          nextHost.style.border = 'none';
          nextHost.style.display = 'block';
          nextHost.style.overflow = 'hidden';
          shadowRoot.appendChild(nextHost);
          currentHost = nextHost;
        } else {
          const iframe = document.createElement('iframe');
          iframe.style.width = '100%';
          iframe.style.height = '100%';
          iframe.style.border = 'none';
          iframe.style.margin = '0';
          iframe.style.padding = '0';
          iframe.style.display = 'block';
          iframe.style.overflow = 'hidden';
          iframe.setAttribute('sandbox', 'allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts allow-downloads allow-pointer-lock allow-top-navigation-by-user-activation');
          iframe.setAttribute('allow', 'accelerometer; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; clipboard-read; clipboard-write; xr-spatial-tracking; gamepad');
          iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
          iframe.src = url;
          shadowRoot.appendChild(iframe);
          currentIframe = iframe;
          iframe.addEventListener('load', () => currentIframe && currentIframe.focus());
        }
      }
    }

    function loadGame(url) {
      let fixedURL = url;
      const workerDomain = window.location.origin;
      if (url.includes(workerDomain)) {
        fixedURL = url;
      } else if (url.includes('://')) {
        fixedURL = workerDomain + '/proxy/' + encodeURIComponent(url);
      } else if (url.startsWith('/')) {
        fixedURL = url;
      }
      createMultiLayerShadowFrame(fixedURL, true);
    }

    function goBack() {
      createMultiLayerShadowFrame(mainURL, false);
      if (document.fullscreenElement) {
        document.exitFullscreen();
      }
    }

    function enterFullscreen() {
      if (currentIframe && currentIframe.contentWindow) {
        currentIframe.contentWindow.postMessage({ type: 'REQUEST_FULLSCREEN' }, window.location.origin);
      }
    }

    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data && event.data.type === 'LOAD_GAME') {
        loadGame(event.data.url);
      }
    });

    createMultiLayerShadowFrame(mainURL, false);

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((error) => {
          console.log('[Worker] Navigational Service Worker registration failed:', error);
        });
      });
    }
  </script>
</body>
</html>`;
}
__name(getMainHTML, "getMainHTML");

function getManifest() {
  return JSON.stringify({
    "id": "/?source=pwa",
    "name": "Google Classroom",
    "short_name": "Classroom",
    "description": "A Simple way for Parents, Students, And teachers to connect trought learning using Googles most powerfull Google classroom version yet",
    "start_url": "/?source=pwa",
    "scope": "/",
    "display": "standalone",
    "display_override": ["standalone", "minimal-ui"],
    "background_color": "#0d1117",
    "theme_color": "#2d2d2d",
    "orientation": "any",
    "icons": [
      { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
      { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
      { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
      { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" },
      { "src": "/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" }
    ],
    "categories": ["games", "entertainment"],
    "prefer_related_applications": false
  });
}
__name(getManifest, "getManifest");

function getServiceWorker() {
  return `// CloudMoon InPlay Service Worker
const CACHE_NAME = 'cloudmoon-v3';
const RUNTIME_CACHE = 'cloudmoon-runtime-v3';
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const critical = ['/', '/manifest.json', '/sw.js'];
      const optional = ['/favicon.png', '/icon.svg', '/icon-192.png', '/icon-512.png'];
      await cache.addAll(critical);
      await Promise.allSettled(
        optional.map(url =>
          fetch(url).then(res => {
            if (res && res.status === 200) return cache.put(url, res);
          }).catch(() => {})
        )
      );
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  const reqPath = new URL(event.request.url).pathname;
  if (reqPath.startsWith('/run-site/') || reqPath.startsWith('/proxy/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(event.request, responseToCache);
          }).catch(() => {});
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((response) => {
          if (response) return response;
          if (event.request.mode === 'navigate') return caches.match('/');
          return new Response('', { status: 200, statusText: 'OK', headers: new Headers({ 'Content-Type': 'text/plain' }) });
        });
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});`;
}
__name(getServiceWorker, "getServiceWorker");

export {
  buildProxyTarget,
  getWebRTCConfig,
  isAllowedTarget,
  worker_default as default
};
//# sourceMappingURL=worker.js.map
