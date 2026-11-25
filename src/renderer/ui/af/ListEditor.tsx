/* 新建 / 编辑我的歌单（v5.6 原型） */
import { useEffect, useRef, useState } from "react";

import { useAf } from "./context.js";
import { useDialogFocus } from "./dialog-focus.js";
import { TrackArt } from "./art.js";
import { IconCheck, IconPlus, IconX } from "./icons.js";
import { packLineCopy, packSlotCopy } from "./copy.js";
import type { AfMyList } from "./context.js";

const COVER_KEYS = ["amp", "rain", "river", "dark", "curtain", "store", "moon", "paper"];
const COVER_NAMES: Record<string, string> = {
  amp: "音箱", rain: "雨", river: "河堤", dark: "熄灯", curtain: "幕布", store: "便利店", moon: "月亮", paper: "纸页",
};

export function ListEditor() {
  const af = useAf();
  const { listEditor, setListEditor, myLists, setMyLists, openList, toast, setPage, palette } = af;
  const editing = listEditor?.list ?? null;
  const [name, setName] = useState(editing?.name ?? "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [cover, setCover] = useState(editing?.cover ?? "amp");
  const [confirmDel, setConfirmDel] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  useDialogFocus(Boolean(listEditor), formRef);

  useEffect(() => {
    if (!listEditor) return;
    const l = listEditor.list;
    setName(l?.name ?? "");
    setNote(l?.note ?? "");
    setCover(l?.cover ?? "amp");
    setConfirmDel(false);
  }, [listEditor]);

  useEffect(() => {
    const fn = (e: KeyboardEvent): void => { if (e.key === "Escape") setListEditor(null); };
    if (listEditor) document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [listEditor, setListEditor]);

  if (!listEditor) return null;

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    const n = name.trim();
    if (!n) { toast("给这张歌单起个名字吧", { hand: true }); return; }
    const stamp = Date.now();
    if (editing) {
      setMyLists(myLists.map((l) => (l.id === editing.id ? { ...l, name: n, note: note.trim(), cover, updatedAt: stamp } : l)));
      toast(`「${n}」改好了`, { icon: "check" });
    } else {
      const id = "u" + stamp.toString(36);
      setMyLists([{ id, name: n, note: note.trim(), cover, tracks: listEditor.tracks ?? [], createdAt: stamp, updatedAt: stamp }, ...myLists]);
      toast(`建好「${n}」，往里丢歌吧`, { icon: "check" });
      setPage("playlists");
      openList(id);
    }
    setListEditor(null);
  };

  const remove = (): void => {
    if (!editing) return;
    if (!confirmDel) { setConfirmDel(true); toast(packSlotCopy(palette, "confirmDelete", editing.name), { hand: true }); return; }
    setMyLists(myLists.filter((l) => l.id !== editing.id));
    toast("歌单删掉了，歌还在库里", { hand: true });
    setListEditor(null);
  };

  return (
    <>
      <div className="dlg-mask" onClick={() => setListEditor(null)}></div>
      <form ref={formRef} tabIndex={-1} className="dlg" onSubmit={submit} role="dialog" aria-modal="true" aria-label={editing ? "编辑歌单" : "新建歌单"}>
        <div className="dlg__head">
          <div>
            <div className="eyebrow">{editing ? "EDIT LIST" : "NEW LIST"}</div>
            <h2 className="dlg__title">{editing ? "改一改这张歌单" : "新建一张歌单"}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={() => setListEditor(null)} title="关闭" aria-label="关闭"><IconX size={15} /></button>
        </div>

        <div className="dlg__field">
          <label htmlFor="list-name">名字</label>
          <input id="list-name" className="dlg__input" value={name} maxLength={18} onChange={(e) => setName(e.target.value)} placeholder="比如：深夜排练室" autoFocus />
          <span className="dlg__count">{name.length}/18</span>
        </div>

        <div className="dlg__field">
          <label htmlFor="list-note">一句说明</label>
          <input id="list-note" className="dlg__input" value={note} maxLength={24} onChange={(e) => setNote(e.target.value)} placeholder="给未来的自己留句话（可留空）" />
        </div>

        <div className="dlg__field">
          <label>封面</label>
          <div className="cover-pick">
            {COVER_KEYS.map((k) => (
              <button type="button" key={k} className={cover === k ? "is-on" : ""} onClick={() => setCover(k)} title={COVER_NAMES[k]} aria-label={"封面 " + COVER_NAMES[k]}>
                <TrackArt id={"cover-" + k} size={44} radius={8} />
              </button>
            ))}
          </div>
        </div>

        <div className="dlg__foot">
          {editing ? <button type="button" className="dlg__del" onClick={remove}>{confirmDel ? "再点一次确认删除" : "删除歌单"}</button> : null}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setListEditor(null)}>再想想</button>
          <button type="submit" className="btn btn-primary btn-sm"><IconCheck size={13} />{editing ? "保存" : "建好了"}</button>
        </div>
      </form>
    </>
  );
}

/* 行菜单里的「加入我的歌单」二级面板 */
export function AddToListPanel({ trackId, onDone }: { trackId: string; onDone(): void }) {
  const af = useAf();
  return (
    <div className="rowmenu__sub">
      <div className="rowmenu__sub-title eyebrow">加入我的歌单</div>
      {af.myLists.length === 0 ? <div className="rowmenu__empty">{packLineCopy(af.palette, "playlistsEmpty")}</div> : null}
      {af.myLists.map((l: AfMyList) => (
        <button key={l.id} className="rowmenu__sublist" onClick={() => { af.addToMyList(l.id, trackId); af.toast(`已加入「${l.name}」`, { icon: "check" }); onDone(); }}>
          <TrackArt id={"cover-" + l.cover} size={22} radius={6} />
          <span className="truncate">{l.name}</span>
          <span className="num">{l.tracks.length}</span>
        </button>
      ))}
      <button className="rowmenu__sublist rowmenu__sublist--new" onClick={() => { af.setListEditor({ mode: "new", tracks: [trackId] }); onDone(); }}>
        <IconPlus size={13} />新建歌单并加进去
      </button>
    </div>
  );
}
