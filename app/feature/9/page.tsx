'use client';

import FeatureSideNav from '@/components/FeatureSideNav';

export default function TrajectoryKeyframeEventPage() {
  return (
    <div className="min-h-screen flex bg-transparent">
      <FeatureSideNav activeId={9} />

      <div className="flex-1 p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="glass-panel rounded-3xl p-8">
            <h1 className="text-3xl font-bold text-white">关键帧与事件</h1>
            <p className="mt-3 text-slate-200">
              面向轨迹中的重要构象事件，支持关键帧归档、事件注释、事件跳转与导出报告。
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="ui-card h-[560px] flex items-center justify-center text-slate-400">
              事件时间线可视化（预留）
            </div>

            <div className="space-y-4">
              <div className="ui-card">
                <h3 className="text-white font-semibold">事件筛选</h3>
                <div className="mt-3 space-y-2">
                  <button className="btn-secondary w-full">按关键帧筛选</button>
                  <button className="btn-secondary w-full">按残基区域筛选</button>
                  <button className="btn-secondary w-full">按距离阈值筛选</button>
                </div>
              </div>

              <div className="ui-card">
                <h3 className="text-white font-semibold">事件管理</h3>
                <div className="mt-3 space-y-2">
                  <button className="btn-secondary w-full">添加注释</button>
                  <button className="btn-secondary w-full">生成快照</button>
                  <button className="btn-danger w-full">清空事件</button>
                </div>
              </div>

              <div className="ui-card text-sm text-slate-300">
                提示：你可以在 feature/7 中标记关键帧，然后在此页进行事件化管理。
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
