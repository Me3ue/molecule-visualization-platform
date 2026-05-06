'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import FeatureSideNav from '@/components/FeatureSideNav';

const featureDescriptions = {
  1: {
    title: '分子结构 3D 可视化',
    description:
      '上传 PDB 文件后可查看分子详细结构（原子、键、骨架），支持旋转、缩放和高质量渲染，帮助你从多个角度观察分子构象。',
    uploadText: '请上传 PDB 文件以查看分子结构',
    buttonText: '上传 PDB 文件',
  },
};

export default function FeaturePage() {
  const params = useParams();
  const router = useRouter();
  const currentId = Number(params.id);
  const config = featureDescriptions[currentId as keyof typeof featureDescriptions] ?? featureDescriptions[1];

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pdbContent, setPdbContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const viewerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayMolecule = (content: string) => {
    if (!viewerRef.current) return;

    try {
      viewerRef.current.clear();
      viewerRef.current.addModel(content, 'pdb');
      viewerRef.current.setStyle({}, {
        cartoon: {
          colorscheme: {
            prop: 'ss',
            map: {
              helix: '#FF4D4D',
              sheet: '#4169E1',
              water: '#00FF99',
              '': '#B8860B',
            },
          },
          thickness: 0.55,
        },
        stick: {
          radius: 0.14,
          opacity: 0.9,
          colorscheme: 'chainHetatm',
        },
      });

      viewerRef.current.zoomTo();
      viewerRef.current.render();
    } finally {
      setIsLoading(false);
    }
  };

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

    if (content) {
      displayMolecule(content);
    } else if (pdbContent) {
      displayMolecule(pdbContent);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsLoading(true);
      setSelectedFile(file);
      const content = await file.text();
      setPdbContent(content);

      if (viewerRef.current) {
        displayMolecule(content);
      } else {
        initViewer(content);
      }
    } catch (error) {
      console.error('Error loading PDB file:', error);
      alert('加载 PDB 文件时出错，请确保文件格式正确。');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (viewerRef.current) {
        viewerRef.current.clear();
        viewerRef.current = null;
      }
    };
  }, []);

  return (
    <>
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js" strategy="beforeInteractive" />
      <Script
        src="https://cdn.jsdelivr.net/npm/3dmol@2.5.2/build/3Dmol-min.js"
        strategy="afterInteractive"
        onLoad={() => {
          if (window.$3Dmol && containerRef.current) {
            initViewer();
          }
        }}
      />

      <div className="min-h-screen flex bg-transparent">
        <FeatureSideNav activeId={Number.isNaN(currentId) ? 1 : currentId} />

        <div className="flex-1 p-8">
          <div className="mx-auto max-w-7xl">
            <div className="mb-8 rounded-3xl border border-white/15 bg-white/5 p-8 backdrop-blur-md">
              <h1 className="mb-4 text-3xl font-bold text-white">{config.title}</h1>
              <p className="leading-relaxed text-slate-200">{config.description}</p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/25 p-2 backdrop-blur-md">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <div className="mb-6 flex items-center justify-between">
                  <span className="text-sm text-slate-200">{config.uploadText}</span>
                  <label className="cursor-pointer rounded-full bg-gradient-to-r from-fuchsia-500 to-cyan-500 px-6 py-2 text-sm font-medium text-white transition hover:opacity-90">
                    {config.buttonText}
                    <input type="file" accept=".pdb" className="hidden" onChange={handleFileUpload} />
                  </label>
                </div>

                <div className="relative h-[560px] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70">
                  <div id="molecule-viewer" ref={containerRef} className="h-full w-full" style={{ display: selectedFile ? 'block' : 'none' }} />

                  {!selectedFile && (
                    <div className="flex h-full items-center justify-center text-slate-300">
                      <div className="text-center">
                        <p>请上传 PDB 文件以查看分子结构</p>
                        <p className="mt-2 text-sm text-slate-400">支持 .pdb 格式文件</p>
                      </div>
                    </div>
                  )}

                  {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-slate-100">
                      <p>正在加载分子结构...</p>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => router.push('/feature/2')}
                    className="rounded-full border border-cyan-300/50 bg-cyan-500/20 px-5 py-2 text-sm text-cyan-100 hover:bg-cyan-500/30"
                  >
                    进入更多视图功能
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
