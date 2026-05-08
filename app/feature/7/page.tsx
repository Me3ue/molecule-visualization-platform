'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Script from 'next/script';
import FeatureSideNav from '@/components/FeatureSideNav';

declare global {
  interface Window {
    NGL: any;
  }
}

type AtomPick = {
  index: number;
  label: string;
};

const DEFAULT_GRO_URL = '/demo/pull_nopbc.gro';
const DEFAULT_XTC_URL = '/demo/pull_nopbc.xtc';

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const distance3 = (a: [number, number, number], b: [number, number, number]) => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

export default function Feature7BondDistanceTrajectoryPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  const nglStageRef = useRef<any>(null);
  const structureCompRef = useRef<any>(null);
  const trajObjRef = useRef<any>(null);
  const topUrlRef = useRef<string | null>(null);
  const trajUrlRef = useRef<string | null>(null);
  const pickedRepsRef = useRef<any[]>([]);
  const distanceOverlayCompRef = useRef<any>(null);
  const calcRequestIdRef = useRef(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [isNglReady, setIsNglReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [topologyFile, setTopologyFile] = useState<File | null>(null);
  const [trajectoryFile, setTrajectoryFile] = useState<File | null>(null);

  const [frameCount, setFrameCount] = useState(0);
  const [frame, setFrame] = useState(0);
  const [fps, setFps] = useState(8);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoLoop, setAutoLoop] = useState(true);

  const [pickedAtoms, setPickedAtoms] = useState<AtomPick[]>([]);
  const [isSelectionLocked, setIsSelectionLocked] = useState(false);
  const [distanceSeries, setDistanceSeries] = useState<number[]>([]);
  const [threshold, setThreshold] = useState(5);
  const [timeStepPs, setTimeStepPs] = useState(2);
  const [status, setStatus] = useState('请上传 GROMACS 拓扑（.gro）和轨迹（.xtc）。');
  const [isDemoLoading, setIsDemoLoading] = useState(false);

  const currentDistance = distanceSeries[frame] ?? null;
  const aboveThresholdCount = distanceSeries.filter((d) => d >= threshold).length;
  const currentTimeNs = (frame * timeStepPs) / 1000;

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const revokeUrls = () => {
    if (topUrlRef.current) {
      URL.revokeObjectURL(topUrlRef.current);
      topUrlRef.current = null;
    }
    if (trajUrlRef.current) {
      URL.revokeObjectURL(trajUrlRef.current);
      trajUrlRef.current = null;
    }
  };

  const ensureStage = () => {
    if (!containerRef.current || !(window as any).NGL) return null;

    if (!nglStageRef.current) {
      nglStageRef.current = new window.NGL.Stage(containerRef.current, {
        backgroundColor: '#090f1f',
        tooltip: true,
      });
    }

    return nglStageRef.current;
  };

  const applyFrame = async (nextFrame: number) => {
    if (!trajObjRef.current || frameCount <= 0) return;
    const safeFrame = clamp(nextFrame, 0, frameCount - 1);

    if (typeof trajObjRef.current.setFrame === 'function') {
      await trajObjRef.current.setFrame(safeFrame);
    } else if (typeof trajObjRef.current.loadFrame === 'function') {
      await trajObjRef.current.loadFrame(safeFrame);
    }

    nglStageRef.current?.viewer?.requestRender?.();
    setFrame(safeFrame);
  };

  const clearPickHighlight = () => {
    const comp = structureCompRef.current;
    if (!comp) return;
    for (const rep of pickedRepsRef.current) {
      try {
        comp.removeRepresentation(rep);
      } catch {
        // noop
      }
    }
    pickedRepsRef.current = [];
  };

  const clearDistanceOverlay = () => {
    const comp = structureCompRef.current;
    if (!comp || !distanceOverlayCompRef.current) return;
    try {
      comp.removeRepresentation(distanceOverlayCompRef.current);
    } catch {
      // noop
    }
    distanceOverlayCompRef.current = null;
  };

  const applyDistanceOverlay = (atoms: AtomPick[], isAlert: boolean) => {
    const comp = structureCompRef.current;
    if (!comp || atoms.length !== 2) {
      clearDistanceOverlay();
      return;
    }

    clearDistanceOverlay();

    const color = isAlert ? '#ef4444' : '#facc15';

    const rep = comp.addRepresentation('distance', {
      atomPair: [[atoms[0].index, atoms[1].index]],
      color,
      labelColor: color,
      labelSize: 1.2,
      linewidth: 2,
      useCylinder: false,
      opacity: 1,
    });

    distanceOverlayCompRef.current = rep;
    nglStageRef.current?.viewer?.requestRender?.();
  };

  const applyPickHighlight = (atoms: AtomPick[]) => {
    const comp = structureCompRef.current;
    if (!comp) return;

    clearPickHighlight();

    const colors = ['#f59e0b', '#22d3ee'];
    atoms.forEach((a, idx) => {
      const rep = comp.addRepresentation('ball+stick', {
        sele: `@${a.index}`,
        color: colors[idx] ?? '#f8fafc',
        radiusScale: 0.35,
      });
      pickedRepsRef.current.push(rep);
    });

    nglStageRef.current?.viewer?.requestRender?.();
  };

  const getAtomPositionFromStructure = (atomIndex: number) => {
    const comp = structureCompRef.current;
    if (!comp?.structure) return null;
    const atom = comp.structure.getAtomProxy(atomIndex);
    if (!atom) return null;
    return [Number(atom.x), Number(atom.y), Number(atom.z)] as [number, number, number];
  };

  const recalculateDistanceSeries = async (atoms: AtomPick[]) => {
    const requestId = ++calcRequestIdRef.current;

    if (atoms.length !== 2 || frameCount <= 0 || !trajObjRef.current) {
      setDistanceSeries([]);
      return;
    }

    const aIndex = atoms[0].index;
    const bIndex = atoms[1].index;

    try {
      const traj = trajObjRef.current;
      const originalFrame = frame;
      const series: number[] = [];

      for (let i = 0; i < frameCount; i += 1) {
        if (requestId !== calcRequestIdRef.current) return;

        if (typeof traj.setFrame === 'function') {
          await traj.setFrame(i);
        } else if (typeof traj.loadFrame === 'function') {
          await traj.loadFrame(i);
        } else {
          throw new Error('当前轨迹对象不支持逐帧读取（setFrame/loadFrame）');
        }

        const pa = getAtomPositionFromStructure(aIndex);
        const pb = getAtomPositionFromStructure(bIndex);
        if (!pa || !pb) {
          throw new Error('无法读取所选原子的坐标');
        }

        series.push(distance3(pa, pb));
      }

      if (requestId !== calcRequestIdRef.current) return;

      if (typeof traj.setFrame === 'function') {
        await traj.setFrame(originalFrame);
      } else if (typeof traj.loadFrame === 'function') {
        await traj.loadFrame(originalFrame);
      }

      nglStageRef.current?.viewer?.requestRender?.();
      setDistanceSeries(series);
      setStatus(`已选中两个原子，完成 ${series.length} 帧距离计算。`);
    } catch (e: any) {
      if (requestId !== calcRequestIdRef.current) return;
      setDistanceSeries([]);
      setStatus(`已选中原子，但距离轨迹计算失败：${e?.message || '未知错误'}`);
    }
  };

  const loadDefaultDemo = async () => {
    try {
      setIsDemoLoading(true);
      setStatus('正在加载默认 GRO + XTC 示例...');
      const [groRes, xtcRes] = await Promise.all([fetch(DEFAULT_GRO_URL), fetch(DEFAULT_XTC_URL)]);
      if (!groRes.ok) throw new Error(`GRO HTTP ${groRes.status}`);
      if (!xtcRes.ok) throw new Error(`XTC HTTP ${xtcRes.status}`);
      const [groBlob, xtcBlob] = await Promise.all([groRes.blob(), xtcRes.blob()]);
      setTopologyFile(new File([groBlob], 'pull_nopbc.gro', { type: 'application/octet-stream' }));
      setTrajectoryFile(new File([xtcBlob], 'pull_nopbc.xtc', { type: 'application/octet-stream' }));
      setStatus('默认示例已就绪，正在自动加载...');
    } catch (e: any) {
      setStatus(`默认示例加载失败：${e?.message || '未知错误'}`);
    } finally {
      setIsDemoLoading(false);
    }
  };

  const loadGromacs = async () => {
    if (!topologyFile || !trajectoryFile) {
      setStatus('请同时上传 .gro 与 .xtc 文件。');
      return;
    }

    const topExt = topologyFile.name.split('.').pop()?.toLowerCase();
    const trajExt = trajectoryFile.name.split('.').pop()?.toLowerCase();

    if (topExt !== 'gro' || trajExt !== 'xtc') {
      setStatus('文件扩展名不匹配：需要 .gro（拓扑）+ .xtc（轨迹）。');
      return;
    }

    try {
      setIsLoading(true);
      setIsPlaying(false);
      clearTimer();

      const stage = ensureStage();
      if (!stage) {
        setStatus('NGL 尚未加载完成，请稍后重试。');
        return;
      }

      stage.removeAllComponents();
      revokeUrls();

      topUrlRef.current = URL.createObjectURL(topologyFile);
      trajUrlRef.current = URL.createObjectURL(trajectoryFile);

      const structureComp = await stage.loadFile(topUrlRef.current, { ext: 'gro' });
      structureComp.addRepresentation('cartoon', { color: 'residueindex' });
      structureComp.addRepresentation('licorice', { radius: 0.15, colorScheme: 'element' });
      structureComp.autoView();
      structureCompRef.current = structureComp;

      const trajParams = {
        ext: 'xtc',
        centerPbc: true,
        removePbc: true,
        superpose: true,
      };

      const NGLAny = (window as any).NGL;
      const blobDatasource = {
        getUrl: (u: string) => u,
        getCountUrl: (u: string) => u,
      };
      NGLAny?.DatasourceRegistry?.add?.('blob', blobDatasource);
      NGLAny?.DatasourceRegistry?.add?.('blob:', blobDatasource);

      let trajPlayer: any = null;
      try {
        const trajBuffer = await trajectoryFile.arrayBuffer();
        const trajNamedFile = new File([trajBuffer], trajectoryFile.name || 'trajectory.xtc', {
          type: 'application/octet-stream',
        });
        const trajData = await NGLAny.autoLoad(trajNamedFile, { ext: 'xtc' });
        trajPlayer = await structureComp.addTrajectory(trajData, trajParams);
      } catch {
        trajPlayer = await structureComp.addTrajectory(trajUrlRef.current, trajParams);
      }

      const trajObj = trajPlayer?.trajectory ?? structureComp?.trajList?.[0]?.trajectory ?? trajPlayer;
      if (!trajObj) throw new Error('轨迹对象创建失败');
      trajObjRef.current = trajObj;

      const getCount = () => Number(
        trajObj?.frameCount ??
        trajObj?.numframes ??
        trajObj?.nframes ??
        structureComp?.trajList?.[0]?.trajectory?.frameCount ??
        structureComp?.trajList?.[0]?.trajectory?.numframes ??
        0
      );

      let count = getCount();
      for (let i = 0; i < 300 && count <= 0; i += 1) {
        await new Promise((r) => setTimeout(r, 100));
        count = getCount();
      }

      const safeCount = Math.max(0, count || 0);
      setFrameCount(safeCount);
      setFrame(0);
      setPickedAtoms([]);
      setIsSelectionLocked(false);
      setDistanceSeries([]);
      calcRequestIdRef.current += 1;
      clearPickHighlight();
      clearDistanceOverlay();

      if (safeCount > 0) {
        if (typeof trajObj.setFrame === 'function') {
          await trajObj.setFrame(0);
        } else if (typeof trajObj.loadFrame === 'function') {
          await trajObj.loadFrame(0);
        }
      }

      stage.viewer?.requestRender?.();
      setStatus(safeCount > 0 ? `GROMACS 轨迹加载成功，共 ${safeCount} 帧。请在右侧 3D 视图点击两个原子。` : '结构已加载，但未检测到轨迹帧数。');
    } catch (e: any) {
      setStatus(`加载失败：${e?.message || '未知错误'}`);
      setFrameCount(0);
      setFrame(0);
      setPickedAtoms([]);
      setDistanceSeries([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const checkReady = () => {
      if (!mounted) return;
      setIsNglReady(typeof window !== 'undefined' && !!(window as any).NGL);
    };
    checkReady();
    const timer = setInterval(checkReady, 300);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!isNglReady || isDemoLoading) return;
    if (!topologyFile || !trajectoryFile) {
      loadDefaultDemo();
      return;
    }
    if (frameCount === 0 && !isLoading) {
      loadGromacs();
    }
  }, [isNglReady, topologyFile, trajectoryFile]);

  useEffect(() => {
    const stage = nglStageRef.current;
    if (!stage) return;

    const onClick = (pickingProxy: any) => {
      if (isSelectionLocked) return;

      const atom = pickingProxy?.atom;
      if (!atom) return;

      const atomIdx = Number(atom.index);
      if (!Number.isFinite(atomIdx)) return;

      const label = `${atom.resname || ''}:${atom.resno || ''}:${atom.atomname || ''} (@${atomIdx})`;

      setPickedAtoms((prev) => {
        let next: AtomPick[];
        if (prev.length === 0) {
          next = [{ index: atomIdx, label }];
        } else if (prev.length === 1) {
          if (prev[0].index === atomIdx) return prev;
          next = [prev[0], { index: atomIdx, label }];
        } else {
          next = [{ index: atomIdx, label }];
        }

        applyPickHighlight(next);
        const nextDistance = distanceSeries[frame];
        applyDistanceOverlay(next, typeof nextDistance === 'number' && nextDistance >= threshold);
        return next;
      });
    };

    stage.signals.clicked.add(onClick);
    return () => {
      stage.signals.clicked.remove(onClick);
    };
  }, [frameCount, isSelectionLocked]);

  useEffect(() => {
    clearTimer();
    if (!isPlaying || frameCount <= 1) return;

    timerRef.current = setInterval(() => {
      const atEnd = frame + 1 >= frameCount;
      if (atEnd && !autoLoop) {
        clearTimer();
        setIsPlaying(false);
        applyFrame(frameCount - 1);
        return;
      }
      const next = atEnd ? 0 : frame + 1;
      applyFrame(next);
    }, Math.max(60, Math.floor(1000 / fps)));

    return clearTimer;
  }, [isPlaying, frameCount, frame, fps, autoLoop]);

  useEffect(() => {
    recalculateDistanceSeries(pickedAtoms);
  }, [pickedAtoms, frameCount]);

  useEffect(() => {
    const isAlert = typeof currentDistance === 'number' && currentDistance >= threshold;
    applyDistanceOverlay(pickedAtoms, isAlert);
  }, [pickedAtoms, currentDistance, threshold]);

  useEffect(() => {
    return () => {
      calcRequestIdRef.current += 1;
      clearTimer();
      revokeUrls();
      clearDistanceOverlay();
      if (nglStageRef.current) {
        nglStageRef.current.dispose();
        nglStageRef.current = null;
      }
    };
  }, []);

  const chartPath = useMemo(() => {
    if (distanceSeries.length === 0) return '';
    const xLeft = 18;
    const xRight = 742;
    const yTop = 22;
    const yBottom = 252;
    const minV = Math.min(...distanceSeries);
    const maxV = Math.max(...distanceSeries);
    const range = Math.max(1e-6, maxV - minV);

    return distanceSeries
      .map((v, i) => {
        const x = xLeft + (i / Math.max(1, distanceSeries.length - 1)) * (xRight - xLeft);
        const y = yBottom - ((v - minV) / range) * (yBottom - yTop);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [distanceSeries]);

  const frameMarkerX = useMemo(() => {
    if (!distanceSeries.length) return 18;
    const xLeft = 18;
    const xRight = 742;
    return xLeft + (frame / Math.max(1, distanceSeries.length - 1)) * (xRight - xLeft);
  }, [distanceSeries, frame]);

  return (
    <>
      <Script src="/vendor/ngl.js" strategy="afterInteractive" onLoad={() => setIsNglReady(true)} />

      <div className="min-h-screen flex bg-transparent">
        <FeatureSideNav activeId={7} />

        <div className="flex-1 p-8">
          <div className="mx-auto max-w-7xl space-y-6">
            <div className="glass-panel rounded-3xl p-8">
              <h1 className="text-3xl font-bold text-white">GROMACS 轨迹距离变化可视化</h1>
              <p className="mt-3 text-slate-200">
                导入 GRO+XTC，直接点击 3D 视图选择两个原子，查看 Bond 距离随帧变化曲线。
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
              <div className="space-y-4">
                <div className="ui-card space-y-3">
                  <h3 className="text-white font-semibold">导入 GROMACS 轨迹</h3>

                  <label className="text-sm text-slate-300">拓扑（.gro）</label>
                  <input
                    className="ui-input w-full"
                    type="file"
                    accept=".gro"
                    onChange={(e) => setTopologyFile(e.target.files?.[0] ?? null)}
                  />
                  <p className="text-xs text-slate-400">当前拓扑文件：{topologyFile?.name ?? '未选择'}</p>

                  <label className="text-sm text-slate-300">轨迹（.xtc）</label>
                  <input
                    className="ui-input w-full"
                    type="file"
                    accept=".xtc"
                    onChange={(e) => setTrajectoryFile(e.target.files?.[0] ?? null)}
                  />
                  <p className="text-xs text-slate-400">当前轨迹文件：{trajectoryFile?.name ?? '未选择'}</p>

                  <button className="btn-primary w-full" onClick={loadGromacs} disabled={isLoading || !isNglReady}>
                    {isLoading ? '加载中...' : '加载 GRO + XTC'}
                  </button>
                </div>

                <div className="ui-card space-y-3">
                  <h3 className="text-white font-semibold">选择两个原子</h3>
                  <p className="text-sm text-slate-300">在右侧 3D 视图直接点击原子。已选择 2 个后，再点会重新开始选择（可锁定避免误点）。</p>
                  <div className="text-sm text-slate-200 space-y-1">
                    <p>A: {pickedAtoms[0]?.label ?? '-'}</p>
                    <p>B: {pickedAtoms[1]?.label ?? '-'}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className="btn-secondary"
                      onClick={() => setIsSelectionLocked((v) => !v)}
                      disabled={pickedAtoms.length < 2}
                    >
                      {isSelectionLocked ? '解除锁定' : '锁定当前选择'}
                    </button>
                    <button
                      className="btn-danger"
                      onClick={() => {
                        calcRequestIdRef.current += 1;
                        setPickedAtoms([]);
                        setIsSelectionLocked(false);
                        setDistanceSeries([]);
                        clearPickHighlight();
                        clearDistanceOverlay();
                        setStatus('已清空选择，请重新点击两个原子。');
                      }}
                    >
                      清空选择
                    </button>
                  </div>

                  <label className="text-sm text-slate-300">距离阈值（Å）</label>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value || 0))}
                    className="w-full rounded-xl bg-slate-900/70 text-slate-100 px-3 py-2 border border-white/10"
                  />

                  <label className="text-sm text-slate-300">时间步长（ps / frame）</label>
                  <input
                    type="number"
                    min={0.001}
                    step={0.1}
                    value={timeStepPs}
                    onChange={(e) => setTimeStepPs(Math.max(0.001, Number(e.target.value || 0.001)))}
                    className="w-full rounded-xl bg-slate-900/70 text-slate-100 px-3 py-2 border border-white/10"
                  />
                </div>

                <div className="ui-card space-y-3">
                  <h3 className="text-white font-semibold">播放与帧控制</h3>

                  <div className="grid grid-cols-2 gap-2">
                    <button className="btn-secondary" onClick={() => setIsPlaying((v) => !v)} disabled={frameCount <= 1}>
                      {isPlaying ? '暂停' : '播放'}
                    </button>
                    <button className="btn-secondary" onClick={() => applyFrame(0)} disabled={frameCount <= 0}>
                      回到首帧
                    </button>
                  </div>

                  <label className="text-sm text-slate-300">帧率（FPS）：{fps}</label>
                  <input type="range" min={1} max={30} value={fps} onChange={(e) => setFps(Number(e.target.value))} className="w-full" />

                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input type="checkbox" checked={autoLoop} onChange={(e) => setAutoLoop(e.target.checked)} />
                    循环播放
                  </label>

                  <label className="text-sm text-slate-300">帧位置：{frame + 1}/{frameCount}</label>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, frameCount - 1)}
                    value={frame}
                    onChange={(e) => applyFrame(Number(e.target.value))}
                    disabled={frameCount <= 0}
                    className="w-full"
                  />
                </div>

                <div className="ui-card text-sm text-slate-300 space-y-1">
                  <p>当前距离：{currentDistance != null ? `${currentDistance.toFixed(3)} Å` : '-'}</p>
                  <p>当前时间：{currentTimeNs.toFixed(3)} ns（步长 {timeStepPs.toFixed(3)} ps/frame）</p>
                  <p>超阈值帧数（≥ {threshold.toFixed(1)} Å）：{aboveThresholdCount}/{distanceSeries.length}</p>
                  <p>选择状态：{isSelectionLocked ? '已锁定（点击不会改变 A/B）' : '未锁定（点击会更新 A/B）'}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="ui-card h-[520px] p-0 overflow-hidden">
                  <div ref={containerRef} className="w-full h-full" />
                </div>

                <div className="ui-card">
                  <h3 className="text-white font-semibold mb-3">距离-帧曲线</h3>
                  {distanceSeries.length > 0 ? (
                    <div className="rounded-xl bg-slate-900/60 p-3 border border-white/10">
                      <svg viewBox="0 0 760 280" className="w-full h-auto">
                        <text x="380" y="16" textAnchor="middle" fill="#fca5a5" fontSize="12">Label Graph</text>
                        <text x="380" y="272" textAnchor="middle" fill="#94a3b8" fontSize="11">Frame</text>
                        <text x="10" y="145" textAnchor="middle" fill="#94a3b8" fontSize="11" transform="rotate(-90 10 145)">Bonds (Å)</text>

                        <line x1="18" y1="22" x2="18" y2="252" stroke="#64748b" strokeWidth="1" />
                        <line x1="18" y1="252" x2="742" y2="252" stroke="#64748b" strokeWidth="1" />

                        <path d={chartPath} fill="none" stroke="#7dd3fc" strokeWidth="2" />
                        <line x1={frameMarkerX} x2={frameMarkerX} y1={22} y2={252} stroke="#facc15" strokeWidth="2" />
                      </svg>
                    </div>
                  ) : (
                    <div className="text-slate-400 text-sm">请先加载 GRO+XTC 并在 3D 视图中点击两个原子。</div>
                  )}
                </div>
              </div>
            </div>

            <div className="ui-card text-sm text-slate-300">{status}</div>
          </div>
        </div>
      </div>
    </>
  );
}
