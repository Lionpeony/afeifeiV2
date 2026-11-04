/**
 * 桩：folia `services/analysis/gpuActivity`（拍点/鼓点分离等 GPU 任务的活动查询）。
 * 我们没有这类任务：恒 false，自动降级不会因它豁免帧。
 */
export const isGpuAnalysisActive = (_now?: number): boolean => false;
