/* 首屏启动层控制（纯 JS，React 之前执行）。
   只负责：首帧定主题、真实启动阶段的进度线、退场节奏、E01 重放。
   动画本身全在 splash.css。 */
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
  /* 开场编排 ~1.2s 内不退场：再快也不能闪一下就走（sub-300ms 的加载不配动画，
     但启动层从首帧起就在，1.2s 是它自己的「最短登场」） */
  var MIN_SHOW = 1200;

  function fillOf(el) {
    var bar = el.querySelector(".splash__bar");
    return bar ? bar.querySelector("i") : null;
  }

  /* 进度线：启动阶段推进（React 挂载 30% → 装配完成 70% → 首屏就绪 100%）。
     只写 transform，闲时的微光由 CSS 自己循环。 */
  var STAGE = [0.12, 0.3, 0.68, 1];
  function stage(target, n) {
    var fill = fillOf(target);
    if (!fill) return;
    var p = STAGE[n] != null ? STAGE[n] : STAGE[STAGE.length - 1];
    fill.style.transform = "scaleX(" + p + ")";
  }
  window.__splashStage = function (n) {
    stage(node, n);
  };

  function hide(target, started) {
    /* 启动完成立即退场：最多补到最短登场时间，不等情况播完 */
    var wait = Math.max(0, MIN_SHOW - (performance.now() - started));
    setTimeout(function () {
      target.classList.add("is-done");
      setTimeout(function () {
        if (target.parentNode) target.parentNode.removeChild(target);
      }, 420);
    }, wait);
  }

  window.__bootDone = function () {
    if (hid) return;
    hid = true;
    stage(node, 3);
    hide(node, t0);
  };
  window.__splashReplay = function () {
    var n = tpl.cloneNode(true);
    document.body.appendChild(n);
    /* 重放没有真实启动要等：调音循环演 2.8s 就谢幕 */
    stage(n, 2);
    setTimeout(function () {
      n.classList.add("is-done");
      setTimeout(function () {
        if (n.parentNode) n.parentNode.removeChild(n);
      }, 420);
    }, 2800);
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
  /* 兜底：装配通道整体卡死（外层 12s 放行）也不能把用户关在门外 */
  setTimeout(window.__bootDone, 12500);
})();
