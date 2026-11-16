/* ---------- 通用曲目表（# / TITLE / ARTIST / ALBUM / TIME） ---------- */
const TrackTable = ({ ids = [], source, dense, footer }) => {
  const {
    currentId, playing, struckId, liked, toggleLike, onomaAt, playAt,
    tryPlay, openRowMenu, source: curSource
  } = useApp();
  const srcLabel = source || (SOURCES[curSource] ? SOURCES[curSource].name : "");

  return (
    <div className={"tbl" + (dense ? " tbl--dense" : "")}>
      <div className="tbl__head">
        <span className="tbl__c-no">#</span>
        <span className="tbl__c-title">TITLE</span>
        <span className="tbl__c-artist">ARTIST</span>
        <span className="tbl__c-album">ALBUM</span>
        <span className="tbl__c-time">TIME</span>
      </div>
      {ids.map((id, i) => {
        const t = TRACK_MAP[id];
        if (!t) return null;
        const isCur = id === currentId;
        const isOn = liked.includes(id);
        const av = (t.avail && t.avail[curSource]) || "ok";
        const dim = av !== "ok";
        return (
          <div key={id}
            className={"tbl__row" + (isCur ? " is-current" : "") + (struckId === id ? " is-struck" : "") + (dim ? " is-dim" : "")}
            style={enterStyle(i, 22)}
            onClick={() => tryPlay(id, ids, i)}
            role="button" tabIndex={0} aria-label={t.title}
            onKeyDown={e => { if (e.key === "Enter") tryPlay(id, ids, i); }}>
            <span className="tbl__c-no">
              {isCur && playing ? <Bars /> : <span className="num">{String(i + 1).padStart(2, "0")}</span>}
            </span>
            <span className="tbl__c-title">
              <img className="tbl__cover" src={t.cover} alt="" loading="lazy" />
              <span className="tbl__title-text">
                <span className="tbl__name truncate" title={t.title}>{t.title}</span>
                <span className="tbl__sub truncate" title={t.artist}>{t.artist}{srcLabel ? " · " + srcLabel : ""}</span>
              </span>
              {dim && (
                <span className={"tbl__badge" + (av === "vip" ? " is-vip" : "")}
                  title={av === "vip" ? "这家要会员才能听" : "这首不在这家 live house 的曲目单里"}>
                  {av === "vip" ? "VIP" : "未收录"}
                </span>
              )}
            </span>
            <span className="tbl__c-artist truncate" title={t.artist}>{t.artist}</span>
            <span className="tbl__c-album truncate" title={t.album}>{t.album}</span>
            <span className="tbl__c-time">
              <button className={"tbl__heart" + (isOn ? " is-on" : "")}
                onClick={e => { e.stopPropagation(); if (!isOn) onomaAt(e.currentTarget, "ポンッ", "coral"); toggleLike(id); }}
                title="喜欢">
                {isOn ? <IconHeartFill size={14} /> : <IconHeart size={14} />}
              </button>
              <button className="tbl__more" title="更多操作"
                onClick={e => { e.stopPropagation(); openRowMenu(id, e.currentTarget.parentElement.getBoundingClientRect()); }}>
                <IconMore size={15} />
              </button>
              <span className="num">{fmt(t.dur)}</span>
            </span>
            {struckId === id && <Strike />}
          </div>
        );
      })}
      {footer}
    </div>
  );
};

Object.assign(window, { TrackTable });
