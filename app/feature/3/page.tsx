'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import Script from 'next/script';
import FeatureSideNav from '@/components/FeatureSideNav';

declare global {
  interface Window {
    $3Dmol: any;
  }
}

function filterAtomsBySelector(atoms: any[], selector: any): any[] {
  return atoms.filter((a: any) => {
    if (selector.chain && a.chain !== selector.chain) return false;
    if (selector.resn && a.resn !== selector.resn) return false;
    if (selector.serial !== undefined && a.serial !== selector.serial) return false;
    if (selector.resi !== undefined) {
      if (typeof selector.resi === 'object' && selector.resi.start !== undefined) {
        if (a.resi < selector.resi.start || a.resi > selector.resi.end) return false;
      } else if (a.resi !== selector.resi) return false;
    }
    return true;
  });
}

const DEFAULT_PDB_URL = '/demo/5P21.pdb';

export default function Feature3Page() {
  const viewerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [is3DmolReady, setIs3DmolReady] = useState(false);
  const [pdb, setPdb] = useState('');
  const [pdbFile, setPdbFile] = useState<File | null>(null);
  const [status, setStatus] = useState('请上传PDB后进行选择与分离。');
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectionType, setSelectionType] = useState<'residue' | 'chain' | 'region' | 'atom' | 'resn'>('chain');
  const [selectionValue, setSelectionValue] = useState('');
  const [selectedStyle, setSelectedStyle] = useState<'cartoon' | 'stick' | 'sphere' | 'line'>('cartoon');
  const [selectedColor, setSelectedColor] = useState('#22d3ee');
  const [residues, setResidues] = useState<{ id: number; chain: string; resn: string }[]>([]);
  const [chains, setChains] = useState<string[]>([]);
  const [atomSerials, setAtomSerials] = useState<number[]>([]);
  const [regionOptions, setRegionOptions] = useState<string[]>([]);
  const [isolatedSelection, setIsolatedSelection] = useState<string | null>(null);
  const [hiddenSelections, setHiddenSelections] = useState<string[]>([]);

  const initViewer = () => {
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

  useEffect(() => {
    let mounted = true;
    const checkReady = () => {
      if (!mounted) return;
      const ready = typeof window !== 'undefined' && !!window.$3Dmol;
      setIs3DmolReady(ready);
      if (ready) initViewer();
    };

    checkReady();
    const timer = setInterval(checkReady, 300);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const ensureViewerReady = async () => {
    for (let i = 0; i < 60; i += 1) {
      const v = initViewer();
      if (v) return v;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  };

  const parseSelectionToSelector = (selection: string) => {
    const [type, valueWithChain] = selection.split(':');
    switch (type) {
      case 'residue': {
        const [resId, chain] = valueWithChain?.split('|') || ['', ''];
        return { resi: parseInt(resId), chain: chain || undefined };
      }
      case 'chain':
        return { chain: valueWithChain?.toUpperCase() };
      case 'region': {
        const [start, end] = valueWithChain?.split('-').map(Number) || [0, 0];
        return { resi: { start, end } };
      }
      case 'atom':
        return { serial: parseInt(valueWithChain || '0') };
      case 'resn':
        return { resn: valueWithChain };
      default:
        return {};
    }
  };

  const getStyleOptions = () => {
    const styleOptions: any = {};
    switch (selectedStyle) {
      case 'cartoon':
        styleOptions.cartoon = { color: selectedColor };
        break;
      case 'stick':
        styleOptions.stick = { color: selectedColor, radius: 0.3 };
        break;
      case 'sphere':
        styleOptions.sphere = { color: selectedColor, radius: 1.0 };
        break;
      case 'line':
        styleOptions.line = { color: selectedColor, lineWidth: 3.0 };
        break;
    }
    return styleOptions;
  };

  const rebuildView = () => {
    if (!viewerRef.current || !pdb) return;

    viewerRef.current.clear();
    viewerRef.current.addModel(pdb, 'pdb');

    if (isolatedSelection) {
      const selObj = parseSelectionToSelector(isolatedSelection);
      viewerRef.current.setStyle({}, { hidden: true });
      viewerRef.current.setStyle(selObj, getStyleOptions());
      viewerRef.current.zoomTo(selObj);
      viewerRef.current.render();
      return;
    }

    viewerRef.current.setStyle({}, getStyleOptions());

    hiddenSelections.forEach((sel) => {
      const selObj = parseSelectionToSelector(sel);
      viewerRef.current.setStyle(selObj, { hidden: true });
    });

    viewerRef.current.zoomTo();
    viewerRef.current.render();
  };

  const getSelectionKey = () => {
    if (selectionType === 'residue' && selectionValue) {
      const [resId, chain] = selectionValue.split('|');
      return `residue:${resId}|${chain || ''}`;
    }
    if (selectionType === 'chain' && selectionValue) return `chain:${selectionValue}`;
    if (selectionType === 'region' && selectionValue) return `region:${selectionValue}`;
    if (selectionType === 'atom' && selectionValue) return `atom:${selectionValue}`;
    if (selectionType === 'resn' && selectionValue) return `resn:${selectionValue}`;
    return '';
  };

  const parseResidueInfo = (content: string) => {
    const lines = content.split('\n');
    const uniqueResidues = new Map<string, { id: number; chain: string; resn: string }>();
    const uniqueChains = new Set<string>();
    const uniqueSerials = new Set<number>();
    lines.forEach((line) => {
      if ((line.startsWith('ATOM') || line.startsWith('HETATM')) && line.length >= 27) {
        const resId = parseInt(line.substring(22, 26).trim());
        const chain = line.substring(21, 22).trim();
        const resn = line.substring(17, 20).trim();
        const serial = parseInt(line.substring(6, 11).trim());
        if (isNaN(resId) || !chain || !resn) return;
        uniqueResidues.set(`${resId}-${chain}`, { id: resId, chain, resn });
        uniqueChains.add(chain);
        if (!isNaN(serial)) uniqueSerials.add(serial);
      }
    });
    const residueList = Array.from(uniqueResidues.values()).sort((a, b) => (a.chain !== b.chain ? a.chain.localeCompare(b.chain) : a.id - b.id));
    setResidues(residueList);
    setChains(Array.from(uniqueChains).sort());
    setAtomSerials(Array.from(uniqueSerials).sort((a, b) => a - b));

    const ids = Array.from(new Set(residueList.map((r) => r.id))).sort((a, b) => a - b);
    const autoRegions: string[] = [];
    if (ids.length > 0) {
      for (let i = 0; i < ids.length; i += 20) {
        const start = ids[i];
        const end = ids[Math.min(i + 19, ids.length - 1)];
        autoRegions.push(`${start}-${end}`);
      }
    }
    setRegionOptions(autoRegions);
  };

  const applyPdbContent = async (content: string, fileName: string, source: 'local' | 'remote') => {
    const viewer = await ensureViewerReady();
    if (!viewer) {
      setStatus('3Dmol 初始化失败，请刷新页面后重试。');
      return;
    }

    viewer.clear();
    viewer.addModel(content, 'pdb');
    viewer.setStyle({}, getStyleOptions());
    viewer.zoomTo();
    viewer.render();

    setPdb(content);
    setPdbFile(new File([content], fileName, { type: 'chemical/x-pdb' }));
    parseResidueInfo(content);
    setStatus(source === 'remote' ? '默认示例已加载，可添加选择项进行隐藏、分离与空间分离。' : '文件已加载并显示。可添加选择项进行隐藏、分离与空间分离。');
    setSelectedRegions([]);
    setIsolatedSelection(null);
    setHiddenSelections([]);
  };

  const loadRemotePdb = async (url: string) => {
    if (!url) return;
    try {
      setStatus('正在加载默认示例...');
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const content = await res.text();
      if (!content.trim()) throw new Error('empty content');
      const remoteName = url.split('?')[0].split('/').pop() || 'default.pdb';
      await applyPdbContent(content, remoteName, 'remote');
    } catch {
      setStatus('默认示例加载失败，请检查 /demo/5P21.pdb 是否可访问。');
    }
  };

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.name.toLowerCase().endsWith('.pdb')) {
      setStatus('请上传 .pdb 文件。');
      return;
    }

    const content = await file.text();
    await applyPdbContent(content, file.name, 'local');
  };

  const residueTypes = useMemo(() => {
    return Array.from(new Set(residues.map((r) => r.resn))).sort();
  }, [residues]);

  const handleSelection = () => {
    if (!viewerRef.current || !pdb) return;
    const key = getSelectionKey();
    if (!key || selectedRegions.includes(key)) return;

    setSelectedRegions((prev) => [...prev, key]);

    let selector: any = {};
    if (selectionType === 'residue' && selectionValue) {
      const [resId, chain] = selectionValue.split('|');
      selector = { resi: parseInt(resId), chain: chain || undefined };
    } else if (selectionType === 'chain' && selectionValue) {
      selector = { chain: selectionValue.toUpperCase() };
    } else if (selectionType === 'region' && selectionValue) {
      const [start, end] = selectionValue.split('-').map(Number);
      selector = { resi: { start, end } };
    } else if (selectionType === 'atom' && selectionValue) {
      selector = { serial: parseInt(selectionValue) };
    } else if (selectionType === 'resn' && selectionValue) {
      selector = { resn: selectionValue };
    }

    viewerRef.current.setStyle(selector, getStyleOptions());
    viewerRef.current.render();
  };

  const handleIsolateSelection = (selection: string) => {
    if (!viewerRef.current || !pdb) return;
    const selector = parseSelectionToSelector(selection);

    if (isolatedSelection === selection) {
      setIsolatedSelection(null);
      setTimeout(() => rebuildView(), 0);
      return;
    }

    setIsolatedSelection(selection);
    setTimeout(() => rebuildView(), 0);
  };

  const handleToggleVisibility = (selection: string) => {
    if (!viewerRef.current) return;
    const isHidden = hiddenSelections.includes(selection);

    if (isHidden) {
      setHiddenSelections((prev) => prev.filter((s) => s !== selection));
    } else {
      setHiddenSelections((prev) => [...prev, selection]);
    }
    setTimeout(() => rebuildView(), 0);
  };

  const handleRemoveSelection = (selection: string) => {
    setSelectedRegions((prev) => prev.filter((s) => s !== selection));
    if (!viewerRef.current || !pdb) return;
    setTimeout(() => rebuildView(), 0);
  };

  const handleSeparateSelection = () => {
    if (!viewerRef.current || selectedRegions.length === 0 || !pdb) return;
    const viewer = viewerRef.current;
    const atoms = viewer.getModel().atoms;
    if (!atoms) return;

    selectedRegions.forEach((selection, index) => {
      const selector = parseSelectionToSelector(selection);
      const matched = filterAtomsBySelector(atoms, selector);
      const angle = (2 * Math.PI * index) / selectedRegions.length;
      const dx = Math.cos(angle) * 25;
      const dy = Math.sin(angle) * 25;
      matched.forEach((atom: any) => {
        atom.x += dx;
        atom.y += dy;
      });
    });
    viewer.render();
    setStatus(`已空间分离 ${selectedRegions.length} 个选择区域`);
  };

  const handleResetView = () => {
    if (!viewerRef.current || !pdb) return;
    setIsolatedSelection(null);
    setHiddenSelections([]);
    rebuildView();
    setStatus('已恢复全分子视图');
  };

  const handleClearAllSelections = () => {
    if (!viewerRef.current || !pdb) return;
    setSelectedRegions([]);
    setIsolatedSelection(null);
    setHiddenSelections([]);
    rebuildView();
    setStatus('已清除所有选择');
  };

  useEffect(() => {
    if (!is3DmolReady || !pdb) return;
    rebuildView();
  }, [is3DmolReady, pdb]);

  useEffect(() => {
    if (!is3DmolReady) return;
    const boot = async () => {
      const url = new URL(window.location.href);
      const pdbUrl = url.searchParams.get('pdb') || DEFAULT_PDB_URL;
      await loadRemotePdb(pdbUrl);
    };
    boot();
  }, [is3DmolReady]);

  useEffect(() => {
    if (!pdb) return;
    rebuildView();
  }, [selectedStyle, selectedColor]);

  const renderChainTag = (chain: string) => (
    <span className="ml-1 px-1.5 py-0.5 rounded text-xs bg-cyan-500/20 text-cyan-300">链 {chain}</span>
  );

  return (
    <>
      <Script src="/vendor/3Dmol-min.js" strategy="afterInteractive" onLoad={() => { setIs3DmolReady(true); initViewer(); }} />
      <div className="min-h-screen flex bg-transparent">
        <FeatureSideNav activeId={3} />
        <div className="flex-1 p-8">
          <div className="mx-auto max-w-7xl space-y-6">
            <div className="glass-panel rounded-3xl p-8">
              <h1 className="text-3xl font-bold text-white">分子选择与分离</h1>
              <p className="text-slate-300 text-sm mt-2">
                选择项用于隐藏、分离与空间分离等操作。
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
              <div className="ui-card space-y-3">
                <input
                  type="file"
                  accept=".pdb,.PDB"
                  onChange={upload}
                  className="ui-input w-full"
                  disabled={!is3DmolReady}
                />
                <p className="text-xs text-slate-400">当前文件：{pdbFile?.name ?? '未选择'}</p>

                <hr className="border-white/10" />
                <p className="text-xs text-slate-400">选择结构（区域/原子/残基类型已支持下拉）</p>
                <select
                  value={selectionType}
                  onChange={(e) => setSelectionType(e.target.value as any)}
                  className="ui-select w-full"
                >
                  <option value="residue">残基号</option>
                  <option value="chain">链</option>
                  <option value="region">区域</option>
                  <option value="atom">原子</option>
                  <option value="resn">残基类型</option>
                </select>

                {selectionType === 'residue' && (
                  <select
                    value={selectionValue}
                    onChange={(e) => setSelectionValue(e.target.value)}
                    className="ui-select w-full"
                  >
                    <option value="">选择残基</option>
                    {residues.map((r) => (
                      <option key={`${r.id}-${r.chain}`} value={`${r.id}|${r.chain}`}>
                        {r.id} - {r.resn} (链{r.chain})
                      </option>
                    ))}
                  </select>
                )}
                {selectionType === 'chain' && (
                  <select
                    value={selectionValue}
                    onChange={(e) => setSelectionValue(e.target.value)}
                    className="ui-select w-full"
                  >
                    <option value="">选择链</option>
                    {chains.map((c) => (
                      <option key={c} value={c}>链 {c}</option>
                    ))}
                  </select>
                )}
                {selectionType === 'region' && (
                  <>
                    <select
                      value={selectionValue}
                      onChange={(e) => setSelectionValue(e.target.value)}
                      className="ui-select w-full"
                    >
                      <option value="">选择区域</option>
                      {regionOptions.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                    <input
                      value={selectionValue}
                      onChange={(e) => setSelectionValue(e.target.value)}
                      className="ui-input w-full"
                      placeholder="也可手动输入，如 1-10"
                    />
                  </>
                )}

                {selectionType === 'atom' && (
                  <select
                    value={selectionValue}
                    onChange={(e) => setSelectionValue(e.target.value)}
                    className="ui-select w-full"
                  >
                    <option value="">选择原子编号</option>
                    {atomSerials.map((serial) => (
                      <option key={serial} value={String(serial)}>{serial}</option>
                    ))}
                  </select>
                )}

                {selectionType === 'resn' && (
                  <select
                    value={selectionValue}
                    onChange={(e) => setSelectionValue(e.target.value)}
                    className="ui-select w-full"
                  >
                    <option value="">选择残基类型</option>
                    {residueTypes.map((resn) => (
                      <option key={resn} value={resn}>{resn}</option>
                    ))}
                  </select>
                )}

                <div className="flex gap-2 items-center">
                  <label className="text-xs text-slate-400">样式</label>
                  <select
                    value={selectedStyle}
                    onChange={(e) => setSelectedStyle(e.target.value as any)}
                    className="ui-select flex-1"
                  >
                    <option value="cartoon">卡通</option>
                    <option value="stick">棍状</option>
                    <option value="sphere">球状</option>
                    <option value="line">线框</option>
                  </select>
                  <input
                    type="color"
                    value={selectedColor}
                    onChange={(e) => setSelectedColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-white/20"
                  />
                </div>
                <button className="btn-secondary w-full" onClick={handleSelection}>添加到操作列表</button>

                <hr className="border-white/10" />
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">已选 {selectedRegions.length} 项</span>
                  <button className="text-xs text-red-400 hover:text-red-300" onClick={handleClearAllSelections}>清除全部</button>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {selectedRegions.map((sel) => {
                    const [type, val] = sel.split(':');
                    const display = type === 'chain' ? `链 ${val}` : type === 'residue' ? val : sel;
                    return (
                      <div key={sel} className="flex items-center justify-between text-xs p-1.5 bg-black/30 rounded">
                        <span className="truncate">{display}</span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleToggleVisibility(sel)}
                            className={`px-1.5 py-0.5 rounded ${hiddenSelections.includes(sel) ? 'bg-red-500/40' : 'bg-white/10'}`}
                          >
                            {hiddenSelections.includes(sel) ? '显示' : '隐藏'}
                          </button>
                          <button
                            onClick={() => handleIsolateSelection(sel)}
                            className={`px-1.5 py-0.5 rounded ${isolatedSelection === sel ? 'bg-cyan-500/40' : 'bg-white/10'}`}
                          >
                            {isolatedSelection === sel ? '取消分离' : '分离'}
                          </button>
                          <button onClick={() => handleRemoveSelection(sel)} className="text-red-400">×</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {selectedRegions.length > 0 && (
                  <>
                    <button className="btn-secondary w-full" onClick={handleResetView}>重置视图</button>
                    <button className="btn-secondary w-full" onClick={handleSeparateSelection}>空间分离</button>
                  </>
                )}

                {!is3DmolReady && <p className="text-xs text-amber-300">3Dmol 脚本加载中，请稍候上传...</p>}
                <p className="text-xs text-slate-400">{status}</p>
              </div>

              <div className="ui-card">
                <div className="relative h-[620px] rounded-2xl border border-white/10 bg-slate-950/70 overflow-hidden">
                  <div ref={containerRef} className="h-full w-full" />
                  {!pdb && <div className="absolute inset-0 flex items-center justify-center text-slate-500">请先上传 PDB 结构</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
