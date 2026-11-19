/* 首屏启动层控制（纯 JS，React 之前执行）。
   只负责：首帧定主题、退场节奏、E01 重放。动画本身全在 splash.css。 */
(function () {
  var root = document.documentElement;
  var KEY = "afeifei.v42.theme";
  function readTheme() {
    try {
      return localStorage.getItem(KEY) || localStorage.getItem("afeifei.v31.theme");
    } catch (e) {
      return null;
    }
  }
  var pref = readTheme();
  if (!pref) {
    try {
      pref = new URLSearchParams(location.search).get("theme");
    } catch (e) {
      pref = null;
    }
  }
  var dark =
    pref === "dark" ||
    (pref !== "light" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";

  var node = document.getElementById("splash");
  if (!node) return;
  var tpl = node.cloneNode(true);
  var t0 = performance.now();
  var hid = false;

  function hide(target, started) {
    /* 开场编排到第三个音符飘完约 3.6s（splash.css），到点再退场 */
    var wait = Math.max(0, 3550 - (performance.now() - started));
    setTimeout(function () {
      target.classList.add("is-done");
      setTimeout(function () {
        if (target.parentNode) target.parentNode.removeChild(target);
      }, 560);
    }, wait);
  }

  window.__bootDone = function () {
    if (hid) return;
    hid = true;
    hide(node, t0);
  };
  window.__splashReplay = function () {
    var n = tpl.cloneNode(true);
    document.body.appendChild(n);
    hide(n, performance.now());
  };

  var q = null;
  try {
    q = new URLSearchParams(location.search);
  } catch (e) {
    q = null;
  }
  if (q && q.get("boot") === "0") {
    node.parentNode.removeChild(node);
    return;
  }
  /* 兜底：App 挂载异常也不能让启动层永远盖着 */
  setTimeout(window.__bootDone, 5300);
})();
