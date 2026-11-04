import { useEffect, useRef, useState } from "react";
import type { Track } from "../../../domain/library/schema.js";
import { pushPanel } from "../../input/panels.js";

/**
 * 改本地曲目的显示元数据（M11）。
 *
 * 抄 folia 的边界：**不写音频文件标签**，只盖在索引之上（见 domain/library/meta.ts）。
 * 所以这里的措辞必须诚实——用户以为改了文件，换台机器发现没改，比不能改更糟。
 */
export function EditMeta({
  track,
  onSave,
  onClose,
}: {
  track: Track;
  onSave(patch: { title?: string; artist?: string; album?: string }): Promise<void>;
  onClose(): void;
}) {
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artist);
  const [album, setAlbum] = useState(track.album);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => pushPanel("edit-meta", "modal", onClose), [onClose]);
  useEffect(() => {
    first.current?.focus();
    first.current?.select();
  }, []);

  const save = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onSave({ title, artist, album });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
      setBusy(false);
    }
  };

  const reset = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      // 三项全空 = 整条覆盖摘掉，回到文件里的值
      await onSave({});
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "还原失败");
      setBusy(false);
    }
  };

  return (
    <div
      className="dialog-mask"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="palette meta-edit" role="dialog" aria-label="编辑曲目信息">
        <p className="meta-edit-head">编辑曲目信息</p>
        <label className="meta-edit-row">
          <span>歌名</span>
          <input
            ref={first}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
            }}
          />
        </label>
        <label className="meta-edit-row">
          <span>歌手</span>
          <input
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
            }}
          />
        </label>
        <label className="meta-edit-row">
          <span>专辑</span>
          <input
            value={album}
            onChange={(e) => setAlbum(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
            }}
          />
        </label>
        <p className="meta-edit-note">
          只改播放器里显示的信息，不动音频文件本身；清空三项并保存 = 恢复文件里的原值。
        </p>
        {error ? <p className="meta-edit-error">{error}</p> : null}
        <div className="meta-edit-ops">
          <button type="button" className="btn" onClick={() => void reset()} disabled={busy}>
            恢复原值
          </button>
          <button type="button" className="primary" onClick={() => void save()} disabled={busy}>
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
