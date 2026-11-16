/* ---------- 本地音乐 / 下载管理 ---------- */
function LocalFiles({ mode }) {
  const { goTo, openPlayer, scanState, startScan, downloads, setPage } = useApp();
  const isLocal = mode === "local";
  const tasks = downloads.filter(d => d.state === "downloading");
  const done = downloads.filter(d => d.state === "done");

  return (
    <div className="page loc" data-screen-label={isLocal ? "本地音乐" : "下载管理"}>
      <div className="loc__head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            {isLocal ? "LOCAL LIBRARY · 这台电脑" : "DOWNLOADS · 缓存目录"}
          </div>
          <h1 className="display">{isLocal ? "本地音乐" : "下载管理"}</h1>
          <p className="body" style={{ marginTop: 10, maxWidth: 460 }}>
            {isLocal ? "扫一遍硬盘里的音频文件，只读路径，不改动原文件。" : "下载只是把音源那边的文件存到本地缓存，卸载时就一起清掉。"}
          </p>
        </div>
        <div className="row gap8">
          <button className="btn btn-ghost btn-sm" onClick={() => { goTo("t1"); openPlayer(); }}>
            <IconPlay size={13} />试听一首
          </button>
        </div>
      </div>

      <div className="loc__tabs">
        <button className={"loc__tab" + (isLocal ? " is-on" : "")} onClick={() => setPage("local")}>本地音乐</button>
        <button className={"loc__tab" + (!isLocal ? " is-on" : "")} onClick={() => setPage("downloads")}>下载管理</button>
        <span className="spacer"></span>
        <span className="meta num">{isLocal ? LOCAL_TRACKS.length + " 个文件" : downloads.length + " 个任务"}</span>
      </div>

      {isLocal ? (
        <>
          <div className="scan-bar">
            <div className="scan-bar__left">
              <IconFolder size={16} style={{ color: "var(--text-3)" }} />
              <span className="meta">D:/乐队/ · 未设置其他文件夹</span>
            </div>
            <button className={"btn btn-soft btn-sm" + (scanState === "scanning" ? " is-busy" : "")}
              onClick={startScan} disabled={scanState === "scanning"}>
              {scanState === "scanning" ? <><IconRefresh size={13} />扫描中…</> : <><IconFolder size={13} />扫描本地文件夹</>}
            </button>
          </div>

          {scanState === "scanning" && (
            <div className="scan-loading">
              <span className="scan-loading__guitar"><GuitarFigure w={120} h={58} /></span>
              <span className="hand">正在数文件夹里的音轨……</span>
            </div>
          )}

          <div className="paper loc__sheet">
            <Tape w={64} rot={-2} style={{ top: -9, left: 28 }} />
            <div className="loc__sheet-head">
              <span className="eyebrow">本地文件 · 按修改时间</span>
              <span className="meta">共 {LOCAL_TRACKS.length} 首</span>
            </div>
            {LOCAL_TRACKS.map((t, i) => (
              <div key={t.id} className="loc-row" style={enterStyle(i, 28)}>
                <span className="loc-row__art"><TrackArt id={t.id} size={36} radius={8} /></span>
                <span className="loc-row__main">
                  <span className="loc-row__title truncate">{t.title}</span>
                  <span className="loc-row__path truncate">{t.path}</span>
                </span>
                <span className="loc-row__tag">本地</span>
                <span className="loc-row__fmt num">{t.fmt} · {t.size}</span>
                <span className="loc-row__dur num">{fmt(t.dur)}</span>
                <button className="icon-btn" title="播放" onClick={() => { goTo(i === 0 ? "t1" : i === 1 ? "t2" : "t4"); openPlayer(); }}>
                  <IconPlay size={15} />
                </button>
              </div>
            ))}
          </div>
          <div className="row gap8" style={{ marginTop: 18 }}>
            <IconNote size={13} style={{ color: "var(--text-3)" }} />
            <span className="hand" style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              本地文件不进「我喜欢的音乐」，除非你手动点红心。
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="loc__sect">
            <h2 className="sect-title">下载中<span>IN PROGRESS</span></h2>
            <span className="meta num">{tasks.length} 个任务</span>
          </div>

          {tasks.length === 0 ? (
            <EmptySetlist title="没有正在下载的歌。" sub="在曲目上右键就能下一首，慢慢来。" onGo={() => setPage("playlists")} cta="去歌单挑一首" />
          ) : (
            <div className="dl-list">
              {tasks.map((d, i) => (
                <div key={d.id} className="dl-row" style={enterStyle(i, 30)}>
                  <span className="dl-row__art"><TrackArt id={d.id} size={44} radius={10} /></span>
                  <span className="dl-row__main">
                    <span className="dl-row__title truncate">{d.title}</span>
                    <span className="dl-row__meta truncate">
                      {d.artist} · {SOURCES[d.source].short} · {d.size}
                    </span>
                    <span className="dl-bar">
                      <i style={{ width: d.pct + "%" }}></i>
                      <span className="dl-bar__pick"><IconPick size={11} /></span>
                    </span>
                  </span>
                  <span className="dl-row__pct num">{d.pct}%</span>
                  <button className="icon-btn" title="暂停">
                    <IconPause size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="loc__sect" style={{ marginTop: 28 }}>
            <h2 className="sect-title">已完成<span>FINISHED</span></h2>
            <span className="meta num">{done.length} 首 · 占 23.4 MB</span>
          </div>

          <div className="paper loc__sheet">
            <Tape w={64} rot={-1.6} style={{ top: -9, left: 28 }} />
            {done.map((d, i) => (
              <div key={d.id} className="loc-row" style={enterStyle(i, 26)}>
                <span className="loc-row__art"><TrackArt id={d.id} size={36} radius={8} /></span>
                <span className="loc-row__main">
                  <span className="loc-row__title truncate">{d.title}</span>
                  <span className="loc-row__path truncate">{d.artist} · {SOURCES[d.source].name}</span>
                </span>
                <span className="loc-row__tag loc-row__tag--done">已下载</span>
                <span className="loc-row__fmt num">{d.size}</span>
                <span className="loc-row__dur num">完成</span>
                <button className="icon-btn" title="播放" onClick={() => { goTo(d.id === "d3" ? "t11" : "t24"); openPlayer(); }}>
                  <IconPlay size={15} />
                </button>
              </div>
            ))}
          </div>

          <div className="row gap8" style={{ marginTop: 18 }}>
            <IconDownload size={13} style={{ color: "var(--text-3)" }} />
            <span className="hand" style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              进度条上的拨片走到头，这首就落地了。
            </span>
          </div>
        </>
      )}
    </div>
  );
}

Object.assign(window, { LocalFiles });
