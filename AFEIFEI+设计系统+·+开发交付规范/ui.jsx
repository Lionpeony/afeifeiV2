/* shared ui primitives + icons for the spec page */

function copyText(text, message) {
  const done = () => window.dispatchEvent(new CustomEvent("doc-toast", { detail: message || "已复制" }));
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => {
      if (legacyCopy(text)) done();
    });
  } else if (legacyCopy(text)) {
    done();
  }
}

function legacyCopy(text) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

const IconCopy = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a1 1 0 0 1 1-1h9" />
  </svg>
);

const IconCheck = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 12.5l5 5L20 6.5" />
  </svg>
);

const IconWarn = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3.5L22 20H2L12 3.5z" />
    <path d="M12 9.5v4.5M12 17.2v.1" />
  </svg>
);

const IconX = ({ size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

const IconPlay = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5.5l11 6.5-11 6.5z" />
  </svg>
);

const IconArrow = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 19C5 11 11 5 19 5" />
    <path d="M14 5h5v5" />
  </svg>
);

const IconPick = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2.6c3.6 2.4 6.4 4.6 6.4 8.2 0 3.2-2.9 6.4-6.4 10.6-3.5-4.2-6.4-7.4-6.4-10.6 0-3.6 2.8-5.8 6.4-8.2z" />
  </svg>
);

function Section({ id, num, title, kicker, meta, children }) {
  return (
    <section className="track" id={id} data-screen-label={num + " · " + title}>
      <div className="track-head">
        <div className="track-num num">{num}</div>
        <div className="track-titles">
          <div className="kicker">{kicker}</div>
          <h2>{title}</h2>
        </div>
        <div className="track-meta">{meta}</div>
      </div>
      {children}
    </section>
  );
}

function SubHead({ num, title, desc }) {
  return (
    <div className="sub-head">
      <span className="sub-num">{num}</span>
      <h3>{title}</h3>
      {desc ? <span className="sub-desc">{desc}</span> : null}
    </div>
  );
}

function Note({ children, rot = "l" }) {
  return (
    <div className="note-wrap">
      <span className="note-mark"><IconArrow size={16} /></span>
      <span className={"note rot-" + rot}>{children}</span>
    </div>
  );
}

function Swatch({ item, darkMode }) {
  const kind = item.kind || "color";
  const isGradient = kind === "gradient";
  const isShadow = kind === "shadow";
  const isRing = kind === "ring";
  const isAlpha = kind === "alpha";
  const copyValue = "--" + item.token.replace(/^--/, "") + ": " + item.value + ";";

  return (
    <button
      type="button"
      className="swatch card"
      onClick={() => copyText(copyValue, "已复制 " + item.token)}
      title={"复制 " + item.token}
      data-comment-anchor={"token-" + item.token.replace(/^--/, "")}
    >
      <span
        className={"swatch-chip" + (isGradient ? " gradient-chip" : "") + (item.onDark ? " on-dark" : "")}
        style={
          isGradient
            ? undefined
            : isShadow
              ? { background: "#FFE8EF" }
              : isRing
                ? { background: "#FFF8F5" }
                : isAlpha
                  ? { background: "#FFF8F5" }
                  : { background: item.resolve || item.value }
        }
      >
        {isShadow ? <span className="shadow-plate" style={{ boxShadow: item.value }}></span> : null}
        {isRing ? <span className="ring-target"></span> : null}
        {isAlpha ? (
          <span className="alpha-lines"><i></i><i></i><i></i></span>
        ) : null}
        {item.contrast ? (
          <span className={"swatch-contrast" + (item.status === "fail" ? " fail" : "")}>
            {item.status === "fail" ? <IconWarn size={9} /> : null}
            {item.contrast}
          </span>
        ) : null}
        <span className="swatch-copy"><IconCopy size={10} />复制</span>
      </span>
      <span className="swatch-name">{item.token}</span>
      <span className="swatch-hex">{item.value}</span>
      <span className="swatch-use">{item.use}</span>
      {item.warn ? (
        <span className="swatch-warn"><IconWarn size={11} />{item.warn}</span>
      ) : null}
    </button>
  );
}

Object.assign(window, {
  copyText, IconCopy, IconCheck, IconWarn, IconX, IconPlay, IconArrow, IconPick,
  Section, SubHead, Note, Swatch
});
