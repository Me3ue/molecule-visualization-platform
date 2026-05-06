'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Script from 'next/script';
import FeatureSideNav from '@/components/FeatureSideNav';

declare global {
  interface Window {
    $3Dmol: any;
  }
}

type ViewStyle = 'line' | 'stick' | 'cartoon';
type LabelMode = 'atom' | 'bond' | 'angle' | 'dihedral';

type PickedAtom = {
  serial: number;
  name: string;
  resname: string;
  resid: number;
  chain: string;
  x: number;
  y: number;
  z: number;
};

type MeasureKind = 'atom' | 'bond' | 'angle' | 'dihedral';

type MeasureItem = {
  id: string;
  mode: 'bond' | 'angle' | 'dihedral';
  atoms: PickedAtom[];
  value: number;
};

type AtomLabelItem = {
  id: string;
  atom: PickedAtom;
};

const distance = (a: PickedAtom, b: PickedAtom) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);

const angleDeg = (a: PickedAtom, b: PickedAtom, c: PickedAtom) => {
  const v1 = [a.x - b.x, a.y - b.y, a.z - b.z];
  const v2 = [c.x - b.x, c.y - b.y, c.z - b.z];
  const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  const n1 = Math.sqrt(v1[0] ** 2 + v1[1] ** 2 + v1[2] ** 2);
  const n2 = Math.sqrt(v2[0] ** 2 + v2[1] ** 2 + v2[2] ** 2);
  const cos = Math.max(-1, Math.min(1, dot / Math.max(1e-12, n1 * n2)));
  return (Math.acos(cos) * 180) / Math.PI;
};

const dihedralDeg = (a: PickedAtom, b: PickedAtom, c: PickedAtom, d: PickedAtom) => {
  const sub = (p: number[], q: number[]) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const cross = (u: number[], v: number[]) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - 
  u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const dot = (u: number[], v: number[]) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const norm = (u: number[]) => Math.sqrt(dot(u, u));
  const unit = (u: number[]) => {
    const n = Math.max(1e-12, norm(u));
    return [u[0] / n, u[1] / n, u[2] / n];
  };

  const p0 = [a.x, a.y, a.z];
  const p1 = [b.x, b.y, b.z];
  const p2 = [c.x, c.y, c.z];
  const p3 = [d.x, d.y, d.z];

  const b0 = sub(p0, p1);
  const b1 = sub(p2, p1);
  const b2 = sub(p3, p2);

  const b1u = unit(b1);
  const v = sub(b0, [b1u[0] * dot(b0, b1u), b1u[1] * dot(b0, b1u), b1u[2] * dot(b0, b1u)]);
  const w = sub(b2, [b1u[0] * dot(b2, b1u), b1u[1] * dot(b2, b1u), b1u[2] * dot(b2, b1u)]);

  const x = dot(v, w);
  const y = dot(cross(b1u, v), w);
  return (Math.atan2(y, x) * 180) / Math.PI;
};

const atomText = (a: PickedAtom) => `${a.resname}${a.resid}:${a.name}${a.chain ? `:${a.chain}` : ''}`;

export default function Feature4Page() {
  const viewerRef = useRef<any>(null);
  const modelRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const labelModeRef = useRef<LabelMode>('bond');
  const measurementsRef = useRef<MeasureItem[]>([]);

  const [demoPdbUrl, setDemoPdbUrl] = useState<string | null>(null);

  const [pdbFile, setPdbFile] = useState<File | null>(null);
  const [pdbText, setPdbText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRemoteLoading, setIsRemoteLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [viewStyle, setViewStyle] = useState<ViewStyle>('stick');

  const [labelMode, setLabelMode] = useState<LabelMode>('bond');
  const [pickBuffer, setPickBuffer] = useState<PickedAtom[]>([]);
  const [atomLabels, setAtomLabels] = useState<AtomLabelItem[]>([]);
  const [measurements, setMeasurements] = useState<MeasureItem[]>([]);
  const [labelFilter, setLabelFilter] = useState<MeasureKind>('bond');
  const [labelColors, setLabelColors] = useState<Record<MeasureKind, string>>({
    atom: '#22d3ee',
    bond: '#facc15',
    angle: '#60a5fa',
    dihedral: '#f472b6',
  });
  const [status, setStatus] = useState('请先上传 PDB 文件。');

  const requiredPickCount = useMemo(() => {
    if (labelMode === 'atom') return 1;
    if (labelMode === 'bond') return 2;
    if (labelMode === 'angle') return 3;
    return 4;
  }, [labelMode]);

  const ensureViewer = () => {
    if (!containerRef.current || !window.$3Dmol) return null;
    if (!viewerRef.current) {
      viewerRef.current = window.$3Dmol.createViewer(containerRef.current, {
        backgroundColor: '#090f1f',
        antialias: true,
        width: '100%',
        height: '100%',
      });
    }
    return viewerRef.current;
  };

  const applyStyle = (model: any) => {
    model.setStyle({}, {});
    if (viewStyle === 'line') model.setStyle({}, { line: { linewidth: 1.5 } });
    if (viewStyle === 'stick') model.setStyle({}, { stick: { radius: 0.18, colorscheme: 'chainHetatm' } });
    if (viewStyle === 'cartoon') model.setStyle({}, { cartoon: { color: 'spectrum' }, stick: { radius: 0.14 } });
  };

  const redrawMeasurements = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    viewer.removeAllShapes();
    viewer.removeAllLabels();

    atomLabels.forEach((it) => {
      const a = it.atom;
      viewer.addLabel(`${a.name}${a.resid}`, {
        position: { x: a.x, y: a.y, z: a.z },
        fontColor: labelColors.atom,
        backgroundOpacity: 0.35,
      });
    });

    measurements.forEach((m) => {
      if (m.mode === 'bond') {
        const [a, b] = m.atoms;
        viewer.addLine({ start: { x: a.x, y: a.y, z: a.z }, end: { x: b.x, y: b.y, z: b.z }, color: labelColors.bond, dashed: true });
        viewer.addLabel(`${m.value.toFixed(2)} Å`, {
          position: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 },
          fontColor: labelColors.bond,
          backgroundOpacity: 0.45,
        });
      }

      if (m.mode === 'angle') {
        const [a, b, c] = m.atoms;
        viewer.addLine({ start: { x: b.x, y: b.y, z: b.z }, end: { x: a.x, y: a.y, z: a.z }, color: labelColors.angle, dashed: true });
        viewer.addLine({ start: { x: b.x, y: b.y, z: b.z }, end: { x: c.x, y: c.y, z: c.z }, color: labelColors.angle, dashed: true });
        viewer.addLabel(`${m.value.toFixed(2)}°`, {
          position: { x: b.x, y: b.y, z: b.z },
          fontColor: labelColors.angle,
          backgroundOpacity: 0.45,
        });
      }

      if (m.mode === 'dihedral') {
        const [a, b, c, d] = m.atoms;
        viewer.addLine({ start: { x: a.x, y: a.y, z: a.z }, end: { x: b.x, y: b.y, z: b.z }, color: labelColors.dihedral, dashed: true });
        viewer.addLine({ start: { x: b.x, y: b.y, z: b.z }, end: { x: c.x, y: c.y, z: c.z }, color: labelColors.dihedral, dashed: true });
        viewer.addLine({ start: { x: c.x, y: c.y, z: c.z }, end: { x: d.x, y: d.y, z: d.z }, color: labelColors.dihedral, dashed: true });
        viewer.addLabel(`${m.value.toFixed(2)}°`, {
          position: { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2, z: (b.z + c.z) / 2 },
          fontColor: labelColors.dihedral,
          backgroundOpacity: 0.45,
        });
      }
    });

    pickBuffer.forEach((a, idx) => {
      viewer.addLabel(`${idx + 1}:${a.name}${a.resid}`, {
        position: { x: a.x, y: a.y, z: a.z },
        fontColor: '#22d3ee',
        backgroundOpacity: 0.35,
      });
    });

    viewer.render();
  };

  const makeKey = (atoms: PickedAtom[]) => atoms.map((a) => a.serial).join('-');

  const pushPick = (atom: any) => {
    const mode = labelModeRef.current;
    const picked: PickedAtom = {
      serial: Number(atom.serial ?? atom.index ?? 0),
      name: String(atom.atom ?? atom.elem ?? atom.name ?? 'X'),
      resname: String(atom.resn ?? atom.resname ?? ''),
      resid: Number(atom.resi ?? atom.resid ?? 0),
      chain: String(atom.chain ?? ''),
      x: Number(atom.x),
      y: Number(atom.y),
      z: Number(atom.z),
    };

    if (![picked.x, picked.y, picked.z].every(Number.isFinite)) return;

    if (mode === 'atom') {
      setAtomLabels((prev) => {
        const idx = prev.findIndex((x) => x.atom.serial === picked.serial);
        if (idx >= 0) {
          const next = prev.filter((x) => x.atom.serial !== picked.serial);
          setStatus(`已移除原子标签：${atomText(picked)}`);
          return next;
        }
        setStatus(`已添加原子标签：${atomText(picked)}（#${picked.serial}）`);
        return [...prev, { id: `${Date.now()}-${picked.serial}`, atom: picked }];
      });
      return;
    }

    setPickBuffer((prev) => {
      const next = [...prev, picked];
      const need = mode === 'bond' ? 2 : mode === 'angle' ? 3 : 4;
      if (next.length < need) {
        setStatus(`${mode} 模式：已选择 ${next.length}/${need} 个原子`);
        return next;
      }

      const atoms = next.slice(0, need);
      const key = makeKey(atoms);

      const existed = measurementsRef.current.find((m) => m.mode === mode && makeKey(m.atoms) === key);
      if (existed) {
        setMeasurements((old) => old.filter((m) => m.id !== existed.id));
        setStatus(`${labelMode} 已存在，重复点击同组原子：已删除该标签。`);
        return [];
      }

      let value = 0;
      if (mode === 'bond') value = distance(atoms[0], atoms[1]);
      if (mode === 'angle') value = angleDeg(atoms[0], atoms[1], atoms[2]);
      if (mode === 'dihedral') value = dihedralDeg(atoms[0], atoms[1], atoms[2], atoms[3]);

      const item: MeasureItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        mode,
        atoms,
        value,
      };

      setMeasurements((old) => [...old, item]);
      setStatus(
        mode === 'bond'
          ? `距离 = ${value.toFixed(3)} Å`
          : mode === 'angle'
            ? `角度 = ${value.toFixed(3)}°`
            : `二面角 = ${value.toFixed(3)}°`
      );
      return [];
    });
  };

  const afterPdbLoaded = (source: 'local' | 'remote') => {
    setAtomLabels([]);
    setMeasurements([]);
    setPickBuffer([]);
    setStatus(source === 'remote' ? '在线示例结构已加载。请点击原子进行测量。' : '文件已加载。请点击原子进行测量。');
  };

  const loadPdb = async () => {
    if (!pdbFile) return;
    try {
      setIsLoading(true);
      const txt = await pdbFile.text();
      setPdbText(txt);
      afterPdbLoaded('local');
    } catch {
      setStatus('文件读取失败，请重试。');
    } finally {
      setIsLoading(false);
    }
  };

  const loadRemotePdb = async (url: string) => {
    if (!url) return;
    try {
      setIsRemoteLoading(true);
      setStatus('正在加载在线示例结构...');
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const txt = await res.text();
      if (!txt.trim()) throw new Error('empty content');
      setPdbText(txt);
      afterPdbLoaded('remote');
    } catch {
      setStatus('在线示例加载失败。请检查链接是否可访问，或改为本地上传 PDB。');
    } finally {
      setIsRemoteLoading(false);
    }
  };

  useEffect(() => {
    const ready = typeof window !== 'undefined' && !!window.$3Dmol;
    setIsReady(ready);

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      setDemoPdbUrl(url.searchParams.get('pdb'));
    }
  }, []);

  useEffect(() => {
    if (!isReady || !demoPdbUrl) return;
    loadRemotePdb(demoPdbUrl);
  }, [isReady, demoPdbUrl]);

  useEffect(() => {
    if (!pdbText) return;
    const viewer = ensureViewer();
    if (!viewer) return;

    viewer.clear();
    const model = viewer.addModel(pdbText, 'pdb');
    modelRef.current = model;

    applyStyle(model);
    model.setClickable({}, true, (atom: any) => pushPick(atom));

    viewer.zoomTo();
    redrawMeasurements();
  }, [pdbText, viewStyle]);

  useEffect(() => {
    measurementsRef.current = measurements;
  }, [measurements]);

  useEffect(() => {
    labelModeRef.current = labelMode;
  }, [labelMode]);

  useEffect(() => {
    redrawMeasurements();
  }, [atomLabels, measurements, pickBuffer, labelColors]);

  useEffect(() => {
    setPickBuffer([]);
  }, [labelMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '1') setLabelMode('atom');
      if (e.key === '2') setLabelMode('bond');
      if (e.key === '3') setLabelMode('angle');
      if (e.key === '4') setLabelMode('dihedral');
      if (e.key === 'Escape') setPickBuffer([]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const clearAllMeasures = () => {
    setAtomLabels([]);
    setMeasurements([]);
    setPickBuffer([]);
    setStatus('已清空所有测量标签。');
  };

  const removeMeasure = (id: string) => {
    setMeasurements((prev) => prev.filter((m) => m.id !== id));
  };

  const filteredCount = labelFilter === 'atom'
    ? atomLabels.length
    : measurements.filter((m) => m.mode === labelFilter).length;

  const modeButton = (active: boolean) => `px-3 py-2 rounded-lg text-sm transition ${active ? 'bg-cyan-500/80 text-white' : 'bg-white/10 text-slate-300 hover:bg-white/20'}`;

  const canLoadLocalPdb = !!pdbFile && !isLoading && !isRemoteLoading && isReady;

  return (
    <>
      <Script src="https://3Dmol.org/build/3Dmol-min.js" strategy="afterInteractive" onLoad={() => setIsReady(true)} />
      <div className="min-h-screen flex bg-transparent">
        <FeatureSideNav activeId={4} />
        <div className="flex-1 p-8">
          <div className="mx-auto max-w-7xl space-y-6">
            <div className="glass-panel rounded-3xl p-8">
              <h1 className="text-3xl font-bold text-white">分子测量：距离 / 角度 / 二面角</h1>
              <p className="mt-2 text-sm text-slate-300">先选择标注模式，再依次点击 2/3/4 个原子完成测量。</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
              <div className="ui-card space-y-4">
                <div>
                  <label className="mb-2 block text-sm text-slate-300">上传 PDB</label>
                  <input type="file" accept=".pdb" className="ui-input w-full" onChange={(e) => setPdbFile(e.target.files?.[0] ?? null)} />
                  <button type="button" className="btn-primary mt-3 w-full" onClick={loadPdb} disabled={!canLoadLocalPdb}>
                    {isLoading ? '本地文件加载中...' : isRemoteLoading ? '在线示例加载中...' : !isReady ? '等待 3Dmol 加载...' : '加载本地结构'}
                  </button>
                  <p className="mt-2 text-xs text-slate-400">答辩推荐：使用在线示例链接自动加载（URL 参数：pdb）。</p>
                  {demoPdbUrl && (
                    <button
                      type="button"
                      className="mt-2 w-full rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-3 py-2 text-sm text-cyan-200 transition hover:bg-cyan-500/25"
                      onClick={() => loadRemotePdb(demoPdbUrl)}
                      disabled={!isReady || isRemoteLoading || isLoading}
                    >
                      {isRemoteLoading ? '在线示例加载中...' : '重新加载在线示例'}
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-300">标注测量模式（快捷键：1/2/3/4）</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={modeButton(labelMode === 'atom')} onClick={() => setLabelMode('atom')}>原子（1）</button>
                    <button type="button" className={modeButton(labelMode === 'bond')} onClick={() => setLabelMode('bond')}>距离（2）</button>
                    <button type="button" className={modeButton(labelMode === 'angle')} onClick={() => setLabelMode('angle')}>角度（3）</button>
                    <button type="button" className={modeButton(labelMode === 'dihedral')} onClick={() => setLabelMode('dihedral')}>二面角（4）</button>
                  </div>
                  <p className="text-xs text-slate-400">当前需要选择 {requiredPickCount} 个原子；按 Esc 清空当前选择缓存。</p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-300">显示样式</p>
                  <div className="flex gap-2">
                    <button type="button" className={modeButton(viewStyle === 'line')} onClick={() => setViewStyle('line')}>线框</button>
                    <button type="button" className={modeButton(viewStyle === 'stick')} onClick={() => setViewStyle('stick')}>棍棒</button>
                    <button type="button" className={modeButton(viewStyle === 'cartoon')} onClick={() => setViewStyle('cartoon')}>卡通</button>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-slate-300">{status}</div>

                <div className="space-y-3 rounded-xl border border-white/10 bg-black/30 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-300">标签面板</p>
                    <button type="button" className="btn-danger px-3 py-1 text-xs" onClick={clearAllMeasures}>清空</button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(['atom', 'bond', 'angle', 'dihedral'] as MeasureKind[]).map((k) => (
                      <button key={k} type="button" className={modeButton(labelFilter === k)} onClick={() => setLabelFilter(k)}>
                        {k === 'atom' ? '原子' : k === 'bond' ? '距离' : k === 'angle' ? '角度' : '二面角'}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                    <label className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-2">原子 <input type="color" value={labelColors.atom} onChange={(e) => setLabelColors((prev) => ({ ...prev, atom: e.target.value }))} /></label>
                    <label className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-2">距离 <input type="color" value={labelColors.bond} onChange={(e) => setLabelColors((prev) => ({ ...prev, bond: e.target.value }))} /></label>
                    <label className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-2">角度 <input type="color" value={labelColors.angle} onChange={(e) => setLabelColors((prev) => ({ ...prev, angle: e.target.value }))} /></label>
                    <label className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-2">二面角 <input type="color" value={labelColors.dihedral} onChange={(e) => setLabelColors((prev) => ({ ...prev, dihedral: e.target.value }))} /></label>
                  </div>

                  <p className="text-xs text-slate-400">当前筛选：{labelFilter.toUpperCase()}（{filteredCount}）</p>

                  <div className="max-h-52 space-y-2 overflow-auto">
                    {labelFilter === 'atom' && atomLabels.length === 0 && <p className="text-xs text-slate-400">暂无 Atom 标签</p>}
                    {labelFilter !== 'atom' && measurements.filter((m) => m.mode === labelFilter).length === 0 && <p className="text-xs text-slate-400">当前类型暂无标签</p>}

                    {labelFilter === 'atom' && atomLabels.map((a) => (
                      <div key={a.id} className="rounded-lg border border-white/10 bg-white/5 p-2 text-xs text-slate-200">
                        <div className="flex items-center justify-between">
                          <span>ATOM · {atomText(a.atom)}</span>
                          <button
                            type="button"
                            className="text-red-300 hover:text-red-200"
                            onClick={() => setAtomLabels((prev) => prev.filter((x) => x.id !== a.id))}
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    ))}

                    {labelFilter !== 'atom' && measurements.filter((m) => m.mode === labelFilter).map((m) => (
                      <div key={m.id} className="rounded-lg border border-white/10 bg-white/5 p-2 text-xs text-slate-200">
                        <div className="flex items-center justify-between">
                          <span>{m.mode.toUpperCase()} · {m.mode === 'bond' ? `${m.value.toFixed(3)} Å` : `${m.value.toFixed(3)}°`}</span>
                          <button type="button" className="text-red-300 hover:text-red-200" onClick={() => removeMeasure(m.id)}>删除</button>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400">{m.atoms.map((a) => atomText(a)).join('  →  ')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="ui-card">
                <div className="relative h-[680px] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70">
                  <div ref={containerRef} className="h-full w-full" />
                  {!pdbText && <div className="absolute inset-0 flex items-center justify-center text-slate-500">请先加载 PDB 结构</div>}
                </div>
                <p className="mt-3 text-sm text-slate-300">操作提示：先设测量模式，再依次点击原子（Bond=2，Angle=3，Dihedral=4）。</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
