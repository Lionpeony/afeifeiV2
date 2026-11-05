import { useEffect, useState } from "react";
import { getActiveSource, setActiveSource, subscribeActiveSource } from "./active-source.js";

/**
 * 页面的「当前音源」选择器：读写全局单值，页面不再各存一份。
 * 源列表变化（注册完成 / 能力变化）且当前值失效时，回落到第一个源。
 */
export function useActiveSource(sources: readonly { id: string }[]): [string, (id: string) => void] {
  const [id, setId] = useState(getActiveSource());
  useEffect(() => subscribeActiveSource(() => setId(getActiveSource())), []);
  useEffect(() => {
    if (sources.length === 0) return;
    if (!sources.some((source) => source.id === getActiveSource())) {
      setActiveSource(sources[0]!.id);
    }
  }, [sources]);
  return [sources.some((source) => source.id === id) ? id : (sources[0]?.id ?? ""), setActiveSource];
}
