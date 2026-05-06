'use client';

import { useState, useRef, useEffect } from 'react';
import Script from 'next/script';
import FeatureSideNav from '@/components/FeatureSideNav';
import './styles.css';

declare global {
  interface Window {
    $3Dmol: any;
  }
}

const colorSchemes = [
  { id: 'elementColors', name: '元素配色', icon: '⚛️', description: '根据原子类型显示不同颜色' },
  { id: 'hydrophobic', name: '疏水性配色', icon: '💧', description: '红色疏水、蓝色亲水' },
  { id: 'electrostatic', name: '静电势配色', icon: '⚡', description: '红负电荷、蓝正电荷' },
  { id: 'bFactor', name: 'B因子配色', icon: '🌡️', description: '温度因子分布' },
  { id: 'conservation', name: '序列保守性', icon: '🧬', description: '进化保守程度' },
  { id: 'atomHighlight', name: '原子高亮', icon: '💡', description: '点击原子高亮' },
];

export default function Feature2Page() {
  const viewerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdb, setPdb] = useState('');
  const [pdbFile, setPdbFile] = useState<File | null>(null);
  const [scheme, setScheme] = useState('elementColors');
  const [highlightedAtoms, setHighlightedAtoms] = useState<any[]>([]);
  const highlightedRef = useRef<any[]>([]);
  highlightedRef.current = highlightedAtoms;
  const [activeTab, setActiveTab] = useState<'coloring' | 'position'>('coloring');

  // 分子位置功能状态
  const [selectedAtoms, setSelectedAtoms] = useState<number[]>([]);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const [backgroundColor, setBackgroundColor] = useState('black');
  const [isLoading, setIsLoading] = useState(false);
  const [is3DMolReady, setIs3DMolReady] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.$3Dmol) {
      setIs3DMolReady(true);
    }
  }, []);

  const ensureViewer = () => {
    if (!containerRef.current || !window.$3Dmol) return null;
    if (!viewerRef.current) {
      viewerRef.current = window.$3Dmol.createViewer(containerRef.current, {
        backgroundColor: backgroundColor,
        antialias: true,
        width: '100%',
        height: '100%',
      });
    }
    return viewerRef.current;
  };

  const applyColorScheme = (content: string, s: string) => {
    const viewer = ensureViewer();
    if (!viewer || !content) return;
    viewer.clear();
    viewer.addModel(content, 'pdb');

    viewer.setClickable({}, false);
    viewer.removeAllSurfaces();
    viewer.removeAllLabels();
    setHighlightedAtoms([]);

    switch (s) {
      case 'elementColors':
        viewer.setStyle({}, {
          stick: { radius: 0.25, colorscheme: 'element', opacity: 1 },
          sphere: { radius: 0.6, colorscheme: 'element', opacity: 0.95 },
        });
        break;
      case 'hydrophobic':
        viewer.setStyle({}, { line: { hidden: true } });
        viewer.addSurface(window.$3Dmol.SurfaceType.SAS, {
          opacity: 1,
          colorscheme: { prop: 'hydrophobicity', gradient: new window.$3Dmol.Gradient.RWB(1) },
        });
        break;
      case 'electrostatic':
        viewer.setStyle({}, { line: { hidden: true } });
        viewer.addSurface(window.$3Dmol.SurfaceType.SAS, {
          opacity: 1,
          colorscheme: { prop: 'charge', gradient: new window.$3Dmol.Gradient.RWB(2) },
        });
        break;
      case 'bFactor':
        viewer.setStyle({}, { line: { hidden: true } });
        viewer.addSurface(window.$3Dmol.SurfaceType.SAS, {
          opacity: 1,
          colorfunc: function (atom: any) {
            if (atom.b === undefined) return 'white';
            const val = Math.min(100, Math.max(0, atom.b)) / 100;
            if (val < 0.5) {
              const scale = val * 2;
              return `rgb(${Math.floor(255 * scale)}, ${Math.floor(255 * scale)}, 255)`;
            } else {
              const scale = (val - 0.5) * 2;
              return `rgb(255, ${Math.floor(255 * (1 - scale))}, ${Math.floor(255 * (1 - scale))})`;
            }
          },
        });
        break;
      case 'conservation':
        viewer.setStyle({}, {
          cartoon: {
            colorscheme: {
              prop: 'resi',
              map: function (residue: number) {
                const score = (residue % 20) / 19;
                if (score > 0.7) return 'rgb(255, 0, 0)';
                if (score > 0.4) {
                  const scale = (score - 0.4) / 0.3;
                  return `rgb(255, ${Math.floor(255 * (1 - scale))}, ${Math.floor(255 * (1 - scale))})`;
                }
                const scale = score / 0.4;
                return `rgb(${Math.floor(255 * scale)}, ${Math.floor(255 * scale)}, 255)`;
              },
            },
          },
          stick: { radius: 0.2, colorscheme: 'element' },
        });
        break;
      case 'atomHighlight':
        viewer.setStyle({}, {
          cartoon: { color: 'lightgrey', opacity: 0.4 },
          stick: { radius: 0.15, colorscheme: 'element', opacity: 0.9 },
          sphere: { radius: 0.4, colorscheme: 'element', opacity: 0.8 },
        });
        viewer.setClickable({}, true, (atom: any) => {
          const current = highlightedRef.current;
          const idx = current.findIndex((a: any) =>
            a.chain === atom.chain && a.resn === atom.resn && a.resi === atom.resi && a.atom === atom.atom
          );
          if (idx !== -1) {
            const newList = [...current];
            newList.splice(idx, 1);
            setHighlightedAtoms(newList);
            viewer.setStyle({}, {
              cartoon: { color: 'lightgrey', opacity: 0.4 },
              stick: { radius: 0.15, colorscheme: 'element', opacity: 0.9 },
              sphere: { radius: 0.4, colorscheme: 'element', opacity: 0.8 },
            });
            viewer.removeAllLabels();
            newList.forEach((a: any) => {
              viewer.setStyle({ chain: a.chain, resi: a.resi, atom: a.atom }, {
                cartoon: { color: '#FFD700', opacity: 0.7 },
                stick: { radius: 0.3, color: '#FFD700', opacity: 1 },
                sphere: { radius: 0.7, color: '#FFD700', opacity: 1 },
              });
              viewer.addLabel(`${a.resn}${a.resi}:${a.atom}`,
                { position: { x: a.x, y: a.y, z: a.z }, backgroundColor: '#FFFF00', fontColor: '#000000', fontSize: 12 },
              );
            });
          } else {
            const newList = [...current, atom];
            setHighlightedAtoms(newList);
            viewer.setStyle({ chain: atom.chain, resi: atom.resi, atom: atom.atom }, {
              cartoon: { color: '#FFD700', opacity: 0.7 },
              stick: { radius: 0.3, color: '#FFD700', opacity: 1 },
              sphere: { radius: 0.7, color: '#FFD700', opacity: 1 },
            });
            viewer.addLabel(`${atom.resn}${atom.resi}:${atom.atom}`,
              { position: { x: atom.x, y: atom.y, z: atom.z }, backgroundColor: '#FFFF00', fontColor: '#000000', fontSize: 12 },
            );
          }
          viewer.render();
        });
        break;
    }
    viewer.zoomTo();
    viewer.render();
  };

  const initPositionMode = (content: string) => {
    const viewer = ensureViewer();
    if (!viewer || !content) return;
    viewer.clear();
    viewer.addModel(content, 'pdb');
    viewer.setStyle({}, { sphere: { radius: 1.2, colorscheme: 'byElement' } });
    viewer.setClickable({}, true, (atom: any, vwr: any) => {
      const v = vwr || viewer;
      const atomId = atom.serial;
      v.setStyle({}, { sphere: { radius: 1.2, colorscheme: 'byElement' } });
      v.setStyle({ serial: atomId }, { sphere: { radius: 1.5, color: 'yellow' } });
      setSelectedAtoms((prev) => {
        if (prev.length >= 2) {
          v.removeAllLabels();
          v.removeAllShapes();
          return [atomId];
        }
        const newSel = [...prev, atomId];
        if (newSel.length === 2) measureAtomDistance(newSel[0], newSel[1], v);
        return newSel;
      });
      v.render();
    });
    viewer.setHoverable({}, true, (atom: any) => {
      viewer.addLabel(`原子 ${atom.serial}: ${atom.elem}`, {
        position: { x: atom.x, y: atom.y, z: atom.z },
        backgroundColor: 'black',
        fontColor: 'white',
        fontSize: 12,
      });
      viewer.render();
    }, () => {
      viewer.removeAllLabels();
      viewer.render();
    });
    viewer.zoomTo();
    viewer.render();
    setDebugInfo('模型已加载，点击原子可测量距离');
  };

  const measureAtomDistance = (atom1: number, atom2: number, viewer: any) => {
    try {
      const atoms = viewer.getModel().atoms;
      const a1 = atoms.find((a: any) => a.serial === atom1);
      const a2 = atoms.find((a: any) => a.serial === atom2);
      if (!a1 || !a2) return;
      const d = Math.sqrt(
        Math.pow(a1.x - a2.x, 2) + Math.pow(a1.y - a2.y, 2) + Math.pow(a1.z - a2.z, 2)
      );
      viewer.addLine({
        start: { x: a1.x, y: a1.y, z: a1.z },
        end: { x: a2.x, y: a2.y, z: a2.z },
        color: '0xFFFF00',
        dashed: true,
        linewidth: 3,
      });
      const mid = {
        x: (a1.x + a2.x) / 2,
        y: (a1.y + a2.y) / 2,
        z: (a1.z + a2.z) / 2,
      };
      viewer.addLabel(`${d.toFixed(2)} Å`, {
        position: mid,
        backgroundColor: 'black',
        fontColor: 'yellow',
        fontSize: 14,
      });
      viewer.render();
      setDebugInfo(`原子 ${atom1} 和 ${atom2} 之间的距离: ${d.toFixed(2)} Å`);
    } catch (e) {
      setDebugInfo('测量失败');
    }
  };

  const analyzeHydrogenBonds = (cutoff: number = 3.2) => {
    const viewer = viewerRef.current;
    if (!viewer || !pdb) return;
    const atoms = viewer.getModel().atoms;
    if (!atoms?.length) return;
    viewer.removeAllLabels();
    viewer.removeAllShapes();
    viewer.setStyle({}, { stick: { radius: 0.15, colorscheme: 'byElement', opacity: 0.8 } });
    const donors = ['N', 'O', 'S'];
    const acceptors = ['O', 'N', 'F', 'CL'];
    const hbonds: { atom1: any; atom2: any; distance: number }[] = [];
    const hbondSerials = new Set<number>();
    for (let i = 0; i < atoms.length; i++) {
      for (let j = i + 1; j < atoms.length; j++) {
        const a1 = atoms[i];
        const a2 = atoms[j];
        if (!donors.includes(a1.elem?.toUpperCase()) && !acceptors.includes(a1.elem?.toUpperCase())) continue;
        if (!donors.includes(a2.elem?.toUpperCase()) && !acceptors.includes(a2.elem?.toUpperCase())) continue;
        const d = Math.sqrt(
          Math.pow(a1.x - a2.x, 2) + Math.pow(a1.y - a2.y, 2) + Math.pow(a1.z - a2.z, 2)
        );
        if (d >= 2.5 && d <= cutoff) {
          hbonds.push({ atom1: a1, atom2: a2, distance: d });
          hbondSerials.add(a1.serial);
          hbondSerials.add(a2.serial);
        }
      }
    }
    hbonds.forEach(({ atom1, atom2, distance }) => {
      viewer.addLine({
        start: { x: atom1.x, y: atom1.y, z: atom1.z },
        end: { x: atom2.x, y: atom2.y, z: atom2.z },
        color: '#FFD700',
        dashed: true,
        linewidth: 2.5,
      });
      viewer.addLabel(`${distance.toFixed(1)}Å`, {
        position: {
          x: (atom1.x + atom2.x) / 2,
          y: (atom1.y + atom2.y) / 2,
          z: (atom1.z + atom2.z) / 2,
        },
        backgroundColor: 'rgba(0,0,0,0.7)',
        fontColor: '#FFD700',
        fontSize: 12,
      });
    });
    viewer.render();
    setDebugInfo(`发现 ${hbonds.length} 个可能的氢键`);
  };

  const analyzeNeighborAtoms = () => {
    const viewer = viewerRef.current;
    if (!viewer || selectedAtoms.length === 0) return;
    const atoms = viewer.getModel().atoms;
    const ref = atoms.find((a: any) => a.serial === selectedAtoms[0]);
    if (!ref) return;
    viewer.removeAllLabels();
    viewer.removeAllShapes();
    const cutoff = 5;
    const nearby: { atom: any; distance: number }[] = [];
    atoms.forEach((a: any) => {
      if (a.serial === ref.serial) return;
      const d = Math.sqrt(
        Math.pow(a.x - ref.x, 2) + Math.pow(a.y - ref.y, 2) + Math.pow(a.z - ref.z, 2)
      );
      if (d <= cutoff) nearby.push({ atom: a, distance: d });
    });
    nearby.sort((a, b) => a.distance - b.distance);
    const toShow = nearby.slice(0, 10);
    viewer.setStyle({ serial: ref.serial }, { sphere: { radius: 1.5, color: 'magenta', opacity: 0.8 } });
    toShow.forEach(({ atom, distance }) => {
      viewer.setStyle({ serial: atom.serial }, { sphere: { radius: 1.2, color: 'cyan', opacity: 0.8 } });
      viewer.addLine({
        start: { x: ref.x, y: ref.y, z: ref.z },
        end: { x: atom.x, y: atom.y, z: atom.z },
        color: 'cyan',
        dashed: true,
      });
      viewer.addLabel(`${distance.toFixed(1)}Å`, {
        position: {
          x: (ref.x + atom.x) / 2,
          y: (ref.y + atom.y) / 2,
          z: (ref.z + atom.z) / 2,
        },
        backgroundColor: 'rgba(0,0,0,0.6)',
        fontColor: 'white',
        fontSize: 10,
      });
    });
    viewer.render();
    setDebugInfo(`已显示 ${toShow.length} 个相邻原子`);
  };

  const updateBackground = (color: string) => {
    setBackgroundColor(color);
    if (viewerRef.current) {
      viewerRef.current.setBackgroundColor(color);
      viewerRef.current.render();
    }
  };

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.name.endsWith('.pdb')) return;
    setIsLoading(true);
    const content = await file.text();
    setPdb(content);
    setPdbFile(file);
    setIsLoading(false);
  };

  useEffect(() => {
    if (!pdb) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const tryRender = () => {
      if (cancelled) return;
      attempts += 1;

      const scriptReady = typeof window !== 'undefined' && !!window.$3Dmol;
      const containerReady = !!containerRef.current;

      if (scriptReady && containerReady) {
        if (!is3DMolReady) setIs3DMolReady(true);
        if (activeTab === 'coloring') {
          applyColorScheme(pdb, scheme);
        } else {
          initPositionMode(pdb);
        }
        return;
      }

      if (attempts < 30) {
        timer = setTimeout(tryRender, 100);
      } else {
        setDebugInfo('3Dmol 初始化超时，请稍后重试');
      }
    };

    tryRender();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pdb, scheme, activeTab, is3DMolReady]);

  const clearAllMeasurements = () => {
    if (!viewerRef.current) return;
    viewerRef.current.removeAllLabels();
    viewerRef.current.removeAllShapes();
    viewerRef.current.setStyle({}, { sphere: { radius: 1.2, colorscheme: 'byElement' } });
    viewerRef.current.render();
    setSelectedAtoms([]);
    setDebugInfo(null);
  };

  return (
    <>
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js" strategy="beforeInteractive" />
      <Script
        src="/vendor/3Dmol-min.js"
        strategy="afterInteractive"
        onReady={() => setIs3DMolReady(true)}
      />
      <div className="min-h-screen flex bg-transparent">
        <FeatureSideNav activeId={2} />
        <div className="flex-1 p-8">
          <div className="mx-auto max-w-7xl space-y-6">
            <div className="glass-panel rounded-3xl p-8">
              <h1 className="text-3xl font-bold text-white mb-2">配色与空间定位</h1>
              <p className="text-slate-300 text-sm">
                分子配色：元素配色、疏水性、静电势、B因子、序列保守性、原子高亮 | 分子位置：距离测量、氢键分析、相邻原子分析
              </p>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                className={`px-4 py-2 rounded-lg ${activeTab === 'coloring' ? 'bg-cyan-500/80 text-white' : 'bg-white/10 text-slate-300'}`}
                onClick={() => setActiveTab('coloring')}
              >
                分子配色
              </button>
              <button
                className={`px-4 py-2 rounded-lg ${activeTab === 'position' ? 'bg-cyan-500/80 text-white' : 'bg-white/10 text-slate-300'}`}
                onClick={() => setActiveTab('position')}
              >
                分子位置
              </button>
            </div>

            <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
              <div className="ui-card space-y-3">
                <input type="file" accept=".pdb" onChange={upload} className="ui-input w-full" />

                {activeTab === 'coloring' && (
                  <>
                    {pdbFile && (
                      <>
                        <p className="text-xs text-slate-400">背景</p>
                        <div className="flex gap-2">
                          {['white', '#f0f0f0', '#333333', 'black'].map((c) => (
                            <button
                              key={c}
                              onClick={() => updateBackground(c)}
                              className={`w-8 h-8 rounded-full border-2 ${backgroundColor === c ? 'border-cyan-400' : 'border-white/20'}`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </>
                    )}

                    <p className="text-xs text-slate-400">配色方案</p>
                    {colorSchemes.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setScheme(s.id)}
                        className={`w-full px-3 py-2 rounded-lg text-left text-sm ${scheme === s.id ? 'bg-cyan-500/60 text-white' : 'bg-white/5 text-slate-200 hover:bg-white/10'}`}
                      >
                        {s.icon} {s.name}
                      </button>
                    ))}
                  </>
                )}

                {activeTab === 'position' && pdbFile && (
                  <>
                    <p className="text-xs text-slate-400">背景</p>
                    <div className="flex gap-2">
                      {['white', '#f0f0f0', '#333333', 'black'].map((c) => (
                        <button
                          key={c}
                          onClick={() => updateBackground(c)}
                          className={`w-8 h-8 rounded-full border-2 ${backgroundColor === c ? 'border-cyan-400' : 'border-white/20'}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <button className="btn-secondary w-full" onClick={() => analyzeHydrogenBonds(3.2)}>
                      显示氢键
                    </button>
                    <button
                      className="btn-secondary w-full"
                      onClick={analyzeNeighborAtoms}
                      disabled={selectedAtoms.length === 0}
                    >
                      分析相邻原子
                    </button>
                    <button className="btn-danger w-full" onClick={clearAllMeasurements}>
                      清除测量
                    </button>
                    {debugInfo && (
                      <div className="p-2 bg-black/30 rounded text-xs text-slate-300">{debugInfo}</div>
                    )}
                  </>
                )}
              </div>

              <div className="ui-card relative">
                <div
                  ref={containerRef}
                  className="h-[620px] w-full rounded-2xl border border-white/10 bg-slate-950/70"
                />
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl">
                    <p className="text-cyan-300">加载中...</p>
                  </div>
                )}
                {!pdb && (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                    请上传 PDB 文件
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
