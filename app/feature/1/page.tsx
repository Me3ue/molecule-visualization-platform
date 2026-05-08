'use client';

import { useState, useRef, useEffect } from 'react';
import Script from 'next/script';
import FeatureSideNav from '@/components/FeatureSideNav';

const DEFAULT_PDB_URL = '/demo/1CRN.pdb';

const viewOptions = [
  { id: 'cartoon', name: '基础视图' },
  { id: 'stick', name: '棍状视图' },
  { id: 'sphere', name: '球状视图' },
  { id: 'surface', name: '表面视图' },
];

export default function Feature1Page() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pdbContent, setPdbContent] = useState('');
  const [selectedView, setSelectedView] = useState('cartoon');
  const [isLoading, setIsLoading] = useState(false);
  const [isRemoteLoading, setIsRemoteLoading] = useState(false);
  const viewerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const initViewer = (content?: string) => {
    if (!containerRef.current || !window.$3Dmol) return;
    if (!viewerRef.current) {
      viewerRef.current = window.$3Dmol.createViewer(containerRef.current, {
        backgroundColor: '#090f1f',
        antialias: true,
        width: '100%',
        height: '100%',
      });
    }
    if (content) displayMolecule(content, selectedView);
  };

  const displayMolecule = (content: string, viewType: string) => {
    if (!viewerRef.current) return;
    setIsLoading(true);
    viewerRef.current.clear();
    viewerRef.current.addModel(content, 'pdb');

    if (viewType === 'cartoon') viewerRef.current.setStyle({}, { cartoon: { colorscheme: 'ssPyMol' } });
    if (viewType === 'stick') viewerRef.current.setStyle({}, { stick: { radius: 0.2, colorscheme: 'chainHetatm' } });
    if (viewType === 'sphere') viewerRef.current.setStyle({}, { sphere: { radius: 0.7, colorscheme: 'chainHetatm' } });
    if (viewType === 'surface') {
      viewerRef.current.setStyle({}, { line: { hidden: true } });
      viewerRef.current.addSurface(window.$3Dmol.SurfaceType.SAS, { opacity: 0.9, colorscheme: 'spectrum' });
    }

    viewerRef.current.zoomTo();
    viewerRef.current.render();
    setIsLoading(false);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    const content = await file.text();
    setPdbContent(content);
    if (!viewerRef.current) initViewer(content);
    else displayMolecule(content, selectedView);
  };

  const changeView = (viewId: string) => {
    setSelectedView(viewId);
    if (pdbContent) displayMolecule(pdbContent, viewId);
  };

  const loadRemotePdb = async (url: string) => {
    if (!url) return;
    setIsRemoteLoading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const content = await res.text();
      if (!content.trim()) throw new Error('empty content');
      const remoteName = url.split('?')[0].split('/').pop() || 'default.pdb';
      setPdbContent(content);
      setSelectedFile(new File([content], remoteName, { type: 'chemical/x-pdb' }));
      if (!viewerRef.current) initViewer(content);
      else displayMolecule(content, selectedView);
    } finally {
      setIsRemoteLoading(false);
    }
  };

  useEffect(() => {
    const boot = async () => {
      const url = new URL(window.location.href);
      const pdbUrl = url.searchParams.get('pdb') || DEFAULT_PDB_URL;
      await loadRemotePdb(pdbUrl);
    };
    boot();
  }, []);

  return (
    <>
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js" strategy="beforeInteractive" />
      <Script src="/vendor/3Dmol-min.js" strategy="afterInteractive" onLoad={() => initViewer()} />

      <div className="min-h-screen flex bg-transparent">
        <FeatureSideNav activeId={1} />
        <div className="flex-1 p-8">
          <div className="mx-auto max-w-7xl space-y-6">
            <div className="glass-panel rounded-3xl p-8">
              <h1 className="text-3xl font-bold text-white">结构与基础视图</h1>
              <p className="mt-2 text-slate-200">上传PDB文件，进行结构浏览与多视图切换。</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
              <div className="ui-card space-y-3">
                <label className="text-sm text-slate-200">上传 PDB</label>
                <input type="file" accept=".pdb" onChange={handleFileUpload} className="ui-input w-full" />
                <p className="text-xs text-slate-400">当前文件：{selectedFile?.name ?? '未选择'}</p>
                <button type="button" className="btn-secondary w-full" onClick={() => loadRemotePdb(DEFAULT_PDB_URL)} disabled={isRemoteLoading}>
                  {isRemoteLoading ? '默认示例加载中...' : '恢复默认演示结构'}
                </button>
                {viewOptions.map((v) => (
                  <button key={v.id} type="button" className={`w-full rounded-xl px-3 py-2 text-left ${selectedView === v.id ? 'bg-cyan-500/30 text-white' : 'bg-white/5 text-slate-200'}`} onClick={() => changeView(v.id)}>
                    {v.name}
                  </button>
                ))}
              </div>

              <div className="ui-card">
                <div className="relative h-[620px] rounded-2xl border border-white/10 bg-slate-950/70 overflow-hidden">
                  <div ref={containerRef} className="h-full w-full" style={{ display: selectedFile ? 'block' : 'none' }} />
                  {!selectedFile && <div className="h-full flex items-center justify-center text-slate-300">请上传 PDB 文件</div>}
                  {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">渲染中...</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
