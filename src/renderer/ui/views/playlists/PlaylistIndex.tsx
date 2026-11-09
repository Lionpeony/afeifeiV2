import type { OnlinePlaylist } from "../../../../contracts/capability.js";
import type { SavedPlaylistView } from "../../services.js";

/** 选中的是「哪个源的哪个歌单」：收藏的歌单可能不属于当前下拉里那个源。 */
export interface Selection {
  sourceId: string;
  id: string;
}

interface Props {
  saved: SavedPlaylistView[];
  playlists: OnlinePlaylist[];
  sourceId: string;
  sourceName: string;
  /** 收藏的歌单可能来自别的源，标题里要写那个源的名字而不是内部 id */
  nameOf(sourceId: string): string;
  selected: Selection | null;
  onOpen(sourceId: string, id: string): void;
}

/** 34px 封套：一列文字里它是唯一能扫读的锚点；没有封面就摆一块暗面，不画碎图。 */
function Thumb({ url }: { url?: string }) {
  return (
    <span className="pl-thumb" aria-hidden="true">
      {url ? (
        <img src={url} alt="" width={34} height={34} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
      ) : (
        <i />
      )}
    </span>
  );
}

/**
 * 左栏目录：收藏的（本机 KV）在上，账号的（音源实时）在下。
 *
 * 两段刻意分开：收藏跨重启都在，账号歌单作者改了你也就跟着变。
 * 同一批歌单只在这里出现一次——顶部封面墙是把同一批数据画第二遍，已删。
 *
 * **这一栏只放内容，不放管理动作**：收藏 / 取消收藏挪到右栏抬头（跟着「正在看的
 * 这张歌单」走）。240px 宽里塞一颗 14px 星号，比封套还小，既点不准也读不懂。
 */
export function PlaylistIndex({ saved, playlists, sourceId, sourceName, nameOf, selected, onOpen }: Props) {
  const isOn = (src: string, id: string): boolean => selected?.sourceId === src && selected.id === id;

  return (
    <div className="pl-list" aria-label="歌单目录">
      {saved.length > 0 ? (
        <>
          <p className="pl-sect">我收藏的 · {saved.length}</p>
          {saved.map((p) => (
            <button
              key={`${p.sourceId}:${p.id}`}
              type="button"
              className={`pl-item pl-line-item${isOn(p.sourceId, p.id) ? " on" : ""}`}
              onClick={() => onOpen(p.sourceId, p.id)}
              title={`${p.name} · 来自${nameOf(p.sourceId)}`}
              aria-current={isOn(p.sourceId, p.id) ? "true" : undefined}
            >
              <Thumb url={p.coverUrl} />
              <span className="pl-name">{p.name}</span>
              <span className="pl-count">{p.count > 0 ? `${p.count} 首` : "—"}</span>
            </button>
          ))}
        </>
      ) : null}

      <p className="pl-sect">账号歌单 · {sourceName}</p>
      {playlists.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`pl-item pl-line-item${isOn(sourceId, p.id) ? " on" : ""}`}
          onClick={() => onOpen(sourceId, p.id)}
          title={p.name}
          aria-current={isOn(sourceId, p.id) ? "true" : undefined}
        >
          <Thumb url={p.coverUrl} />
          <span className="pl-name">{p.name}</span>
          <span className="pl-count">{p.count > 0 ? `${p.count} 首` : "—"}</span>
        </button>
      ))}

      {playlists.length === 0 && saved.length === 0 ? (
        <p className="pl-empty">还没有歌单。点右上「导入」粘一个分享链接，或登录音源账号后刷新。</p>
      ) : null}
      {playlists.length === 0 && saved.length > 0 ? <p className="pl-empty">这个账号没有更多歌单。</p> : null}
    </div>
  );
}
