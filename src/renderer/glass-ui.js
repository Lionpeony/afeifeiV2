/* 玻璃明暗开关 · 窗口外壳脚本（非组件本体）。
   上游 <glass-toggle> 见 glass-toggle.js（module 加载）；这里只管关闭键，
   以及顶栏/提示随明暗切换的配色（body.is-light 由 glass.css 消费）。 */
(() => {
  const close = document.getElementById("close");
  if (close) close.addEventListener("click", () => window.close());

  customElements.whenDefined("glass-toggle").then(() => {
    const el = document.querySelector("glass-toggle");
    if (!el) return;
    const sync = () => document.body.classList.toggle("is-light", Boolean(el.checked));
    el.addEventListener("change", sync);
    el.addEventListener("themechange", sync);
    sync();
  });
})();
