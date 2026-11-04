/** 桩：folia `stores/useVisualizerSettingsStore`（zustand 设置仓）。machi 只读全局帧率上限一项。 */
export const useVisualizerSettingsStore = {
  getState: (): { visualizerFrameRate: number } => ({ visualizerFrameRate: 0 }),
};
