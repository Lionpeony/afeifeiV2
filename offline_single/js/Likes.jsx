/* ---------- 我喜欢的音乐 ---------- */
function Likes() {
  const { liked, playAll, goTo, setPage } = useApp();
  const ids = React.useMemo(() => liked.slice().reverse(), [liked]);

  return (
    <div className="page likes" data-screen-label="我喜欢的音乐">
      <div className="likes__head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>MY FAVORITES · {ids.length} 首</div>
          <h1 className="display">我喜欢的<span className="marker">音乐</span></h1>
          <p className="body" style={{ marginTop: 10, maxWidth: 440 }}>
            盖过拨片印记的歌都会落在这儿，最新的在最上面。
          </p>
        </div>
        <div className="likes__stat">
          <b className="num">{ids.length}</b>
          <span>首被我标记过</span>
        </div>
      </div>

      {ids.length === 0 ? (
        <div style={{ maxWidth: 520, marginTop: 8 }}>
          <EmptySetlist title="还没有留下印记的歌。" sub="听到喜欢的那首，点一下红心，它就住在这儿了。" cta="去发现找一首" onGo={() => setPage("discover")} />
        </div>
      ) : (
        <div className="paper likes__sheet">
          <Tape w={76} rot={-2.6} style={{ top: -11, left: 40 }} />
          <div className="likes__sheet-head">
            <span className="eyebrow">TAPE SIDE A · 手写目录</span>
            <div className="row gap8">
              <button className="btn btn-primary btn-sm" onClick={() => playAll(ids.slice(0, 12))}>
                <IconPlay size={13} />全部播放
              </button>
            </div>
          </div>
          <TrackTable ids={ids} />
        </div>
      )}

      <div className="likes__foot row gap8">
        <IconPickOutline size={13} style={{ color: "var(--coral)" }} />
        <span className="hand" style={{ fontSize: 11.5, color: "var(--text-3)" }}>
          红心和底部播放栏是连在一起的，取消就真的取消了。
        </span>
      </div>
    </div>
  );
}

Object.assign(window, { Likes });
