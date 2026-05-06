'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Script from 'next/script';
import FeatureSideNav from '@/components/FeatureSideNav';

declare global {
  interface Window {
    $3Dmol: any;
    NGL: any;
  }
}

type TrajFormat = 'pdb' | 'xyz' | 'sdf' | 'mol2' | 'xtc' | 'rst7';
type TopologyFormat = 'pdb' | 'sdf' | 'mol2' | 'gro' | 'prmtop';

const trajectoryFormats = [
  { value: 'pdb', label: 'PDB（多 MODEL）', accept: '.pdb' },
  { value: 'xyz', label: 'XYZ（多帧）', accept: '.xyz' },
  { value: 'sdf', label: 'SDF（多构象）', accept: '.sdf' },
  { value: 'mol2', label: 'MOL2（多构象）', accept: '.mol2' },
  { value: 'xtc', label: 'GROMACS XTC（需配合 GRO）', accept: '.xtc' },
  { value: 'rst7', label: 'Amber RST7（需配合 PRMTOP）', accept: '.rst7,.inpcrd,.restrt,.crd' },
] as const;

const topologyFormats = [
  { value: 'pdb', label: 'PDB', accept: '.pdb' },
  { value: 'sdf', label: 'SDF', accept: '.sdf' },
  { value: 'mol2', label: 'MOL2', accept: '.mol2' },
  { value: 'gro', label: 'GROMACS GRO', accept: '.gro' },
  { value: 'prmtop', label: 'Amber PRMTOP', accept: '.prmtop,.parm7,.top' },
] as const;

export default function MolecularDynamicsTrajectoryPage() {
  const viewerRef = useRef<any>(null);
  const nglStageRef = useRef<any>(null);
  const nglTrajectoryRef = useRef<any>(null);
  const nglSdfFramesRef = useRef<string[]>([]);
  const nglSdfComponentRef = useRef<any>(null);
  const groUrlRef = useRef<string | null>(null);
  const xtcUrlRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<BlobPart[]>([]);

  const [topologyFile, setTopologyFile] = useState<File | null>(null);
  const [trajectoryFile, setTrajectoryFile] = useState<File | null>(null);
  const [topologyFormat, setTopologyFormat] = useState<TopologyFormat>('gro');
  const [trajFormat, setTrajFormat] = useState<TrajFormat>('xtc');
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isNglMode, setIsNglMode] = useState(false);
  const [hasTrajectory, setHasTrajectory] = useState(false);
  const [canSnapshot, setCanSnapshot] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [fps, setFps] = useState(8);
  const [autoLoop, setAutoLoop] = useState(true);
  const [status, setStatus] = useState('请先导入拓扑文件和轨迹文件。');
  const [isRecording, setIsRecording] = useState(false);
  const [isNglReady, setIsNglReady] = useState(false);
  const [is3DmolReady, setIs3DmolReady] = useState(false);
  const [showReference, setShowReference] = useState(false);

  const currentTrajAccept = useMemo(
    () => trajectoryFormats.find((f) => f.value === trajFormat)?.accept ?? '.pdb',
    [trajFormat]
  );

  const currentTopologyAccept = useMemo(
    () => topologyFormats.find((f) => f.value === topologyFormat)?.accept ?? '.pdb',
    [topologyFormat]
  );

  const requiresNgl = useMemo(
    () => trajFormat === 'sdf' || trajFormat === 'xtc' || trajFormat === 'rst7' || topologyFormat === 'gro' || topologyFormat === 'prmtop',
    [trajFormat, topologyFormat]
  );

  const isEngineReady = requiresNgl ? isNglReady : is3DmolReady;

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const getFileExt = (file: File | null) => {
    if (!file) return '';
    const idx = file.name.lastIndexOf('.');
    return idx >= 0 ? file.name.slice(idx + 1).toLowerCase() : '';
  };

  const resetRenderEngines = () => {
    if (viewerRef.current) {
      viewerRef.current.clear();
      viewerRef.current.render();
    }
    nglTrajectoryRef.current = null;
    nglSdfFramesRef.current = [];
    nglSdfComponentRef.current = null;
    if (nglStageRef.current) {
      nglStageRef.current.removeAllComponents();
    }
    if (groUrlRef.current) {
      URL.revokeObjectURL(groUrlRef.current);
      groUrlRef.current = null;
    }
    if (xtcUrlRef.current) {
      URL.revokeObjectURL(xtcUrlRef.current);
      xtcUrlRef.current = null;
    }
    setIsNglMode(false);
    setHasTrajectory(false);
    setCanSnapshot(false);
    setFrameCount(0);
    setCurrentFrame(0);
  };

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

  useEffect(() => {
    let mounted = true;
    const checkReady = () => {
      if (!mounted) return;
      const ready = typeof window !== 'undefined' && !!(window as any).$3Dmol;
      setIs3DmolReady(ready);
    };

    checkReady();
    const timer = setInterval(checkReady, 300);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const checkReady = () => {
      if (!mounted) return;
      const ready = typeof window !== 'undefined' && !!(window as any).NGL;
      setIsNglReady(ready);
    };

    checkReady();
    const timer = setInterval(checkReady, 300);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const detectFrameCount = (content: string, format: TrajFormat) => {
    if (format === 'pdb') return Math.max((content.match(/^MODEL\s+/gm) || []).length, 1);
    if (format === 'xyz') {
      const lines = content.split(/\r?\n/);
      let i = 0;
      let count = 0;
      while (i < lines.length) {
        const atomNum = Number(lines[i]?.trim());
        if (!Number.isFinite(atomNum) || atomNum <= 0) break;
        i += atomNum + 2;
        count += 1;
      }
      return Math.max(count, 1);
    }
    if (format === 'sdf') return Math.max(content.split(/\$\$\$\$/g).filter((b) => b.trim()).length, 1);
    if (format === 'mol2') return Math.max((content.match(/@<TRIPOS>MOLECULE/g) || []).length, 1);
    return 1;
  };

  const applyFrame = async (frame: number) => {
    if (frameCount === 0) return;
    const safeFrame = Math.max(0, Math.min(frame, frameCount - 1));

    if (isNglMode) {
      const sdfFrames = nglSdfFramesRef.current;
      const stage = nglStageRef.current;

      // SDF 多构象：手动逐帧替换组件
      if (sdfFrames.length > 0 && stage) {
        const frameText = sdfFrames[safeFrame];
        if (!frameText) return;

        try {
          if (nglSdfComponentRef.current) {
            stage.removeComponent(nglSdfComponentRef.current);
            nglSdfComponentRef.current = null;
          }

          const blob = new Blob([frameText], { type: 'chemical/x-mdl-sdfile' });
          const url = URL.createObjectURL(blob);
          const comp = await stage.loadFile(url, { ext: 'sdf' });
          URL.revokeObjectURL(url);

          comp.addRepresentation('ball+stick', { multipleBond: true, aspectRatio: 1.6, radiusScale: 0.35 });
          comp.autoView();
          nglSdfComponentRef.current = comp;
          stage.viewer?.requestRender?.();
          setCurrentFrame(safeFrame);
          return;
        } catch {
          return;
        }
      }

      // XTC 轨迹：原有 NGL 逻辑
      const trajPlayer = nglTrajectoryRef.current;
      if (!trajPlayer) return;

      if (typeof trajPlayer.setFrame === 'function') {
        await trajPlayer.setFrame(safeFrame);
      } else if (trajPlayer.trajectory && typeof trajPlayer.trajectory.setFrame === 'function') {
        await trajPlayer.trajectory.setFrame(safeFrame);
      }

      nglStageRef.current?.viewer?.requestRender?.();
      setCurrentFrame(safeFrame);
      return;
    }

    if (!viewerRef.current) return;
    await viewerRef.current.setFrame(safeFrame);
    viewerRef.current.render();
    setCurrentFrame(safeFrame);
  };

  const loadTrajectory = async () => {
    if (!topologyFile || !trajectoryFile) return setStatus('请先同时上传拓扑文件和轨迹文件。');

    try {
      setIsLoading(true);
      clearTimer();
      setIsPlaying(false);

      const topExt = getFileExt(topologyFile);
      const trajExt = getFileExt(trajectoryFile);
      const isGroXtcByName = topExt === 'gro' && trajExt === 'xtc';
      const amberTopExtSet = new Set(['prmtop', 'parm7', 'top']);
      const amberTrajExtSet = new Set(['rst7', 'inpcrd', 'restrt', 'crd']);
      const isAmberByName = amberTopExtSet.has(topExt) && amberTrajExtSet.has(trajExt);

      // SDF 多构象：直接切到 NGL 手动逐帧实现，绕开 3Dmol 对部分 SDF 的兼容问题
      if (trajFormat === 'sdf') {
        resetRenderEngines();

        for (let i = 0; i < 40 && !(window as any).NGL; i += 1) {
          await new Promise((r) => setTimeout(r, 100));
        }

        if (!containerRef.current || !(window as any).NGL) {
          setStatus('NGL 尚未加载完成，请稍后重试。');
          return;
        }

        const stage = nglStageRef.current ?? new window.NGL.Stage(containerRef.current, {
          backgroundColor: '#090f1f',
          tooltip: false,
        });
        nglStageRef.current = stage;
        stage.removeAllComponents();
        stage.removeAllRepresentations?.();

        const trajectory = await trajectoryFile.text();
        const extractMolBlock = (s: string) => {
          const lines = s.split(/\r?\n/);
          const endIdx = lines.findIndex((line) => line.trim() === 'M  END' || line.trim() === 'M END');
          if (endIdx < 0) return s.trim();
          return lines.slice(0, endIdx + 1).join('\n').trim();
        };

        const sdfFrames = trajectory
          .split(/\$\$\$\$/g)
          .map((b) => b.trim())
          .filter(Boolean)
          .map((b) => extractMolBlock(b))
          .filter(Boolean)
          .map((b) => `${b}\n$$$$\n`);

        if (sdfFrames.length === 0) {
          throw new Error('SDF 轨迹为空或格式不正确（未找到有效帧）');
        }

        nglSdfFramesRef.current = sdfFrames;
        setIsNglMode(true);
        setCanSnapshot(true);
        setHasTrajectory(sdfFrames.length > 1);
        setFrameCount(sdfFrames.length);
        setCurrentFrame(0);

        const firstBlob = new Blob([sdfFrames[0]], { type: 'chemical/x-mdl-sdfile' });
        const firstUrl = URL.createObjectURL(firstBlob);
        const comp = await stage.loadFile(firstUrl, { ext: 'sdf' });
        URL.revokeObjectURL(firstUrl);
        comp.addRepresentation('ball+stick', { multipleBond: true, aspectRatio: 1.6, radiusScale: 0.35 });
        comp.autoView();
        nglSdfComponentRef.current = comp;
        stage.viewer?.requestRender?.();
        setStatus(`SDF 多构象加载成功（NGL 模式），共 ${sdfFrames.length} 帧。`);
        return;
      }

      // GROMACS / Amber：使用 NGL 加载双文件轨迹
      if (isGroXtcByName || topologyFormat === 'gro' || trajFormat === 'xtc' || isAmberByName || topologyFormat === 'prmtop' || trajFormat === 'rst7') {
        resetRenderEngines();

        const useAmber = isAmberByName || topologyFormat === 'prmtop' || trajFormat === 'rst7';
        if (useAmber && !isAmberByName) {
          setStatus('检测到文件扩展名与格式选择不一致：Amber 请上传 .prmtop + .rst7（或 .inpcrd/.restrt/.crd）。');
          return;
        }
        if (!useAmber && !isGroXtcByName) {
          setStatus('检测到文件扩展名与格式选择不一致：请确保上传的是 .gro + .xtc。');
          return;
        }

        for (let i = 0; i < 40 && !(window as any).NGL; i += 1) {
          await new Promise((r) => setTimeout(r, 100));
        }

        if (!containerRef.current || !(window as any).NGL) {
          setStatus('NGL 尚未加载完成，请稍后重试。');
          return;
        }

        const stage = nglStageRef.current ?? new window.NGL.Stage(containerRef.current, {
          backgroundColor: '#090f1f',
          tooltip: false,
        });
        nglStageRef.current = stage;

        stage.removeAllComponents();
        stage.removeAllRepresentations?.();

        groUrlRef.current = URL.createObjectURL(topologyFile);
        xtcUrlRef.current = URL.createObjectURL(trajectoryFile);

        const topExt = useAmber ? 'prmtop' : 'gro';
        const trajExt = useAmber ? 'rst7' : 'xtc';

        const structureComp = await stage.loadFile(groUrlRef.current, { ext: topExt });
        structureComp.addRepresentation('cartoon', { color: 'residueindex' });
        structureComp.addRepresentation('licorice', { radius: 0.15, colorScheme: 'element' });
        structureComp.autoView();
        setIsNglMode(true);
        setCanSnapshot(true);

        const modeLabel = useAmber ? 'Amber' : 'GROMACS';

        // Amber: 先走后台 rst7->PDB(MODEL) 转换，保证可在前端作为多帧轨迹加载；失败再单帧兜底。
        if (useAmber) {
          let convertErrorMsg = '';
          try {
            const formData = new FormData();
            formData.append('topology', topologyFile);
            formData.append('trajectory', trajectoryFile);

            const resp = await fetch('/api/trajectory/convert-rst7', {
              method: 'POST',
              body: formData,
            });

            const payload = await resp.json().catch(() => ({} as any));
            if (resp.ok) {
              const pdbText = String(payload?.pdb || '');
              const convertedFrames = Number(payload?.frameCount || 0);

              if (pdbText.trim()) {
                resetRenderEngines();
                const viewer = ensureViewer();
                if (!viewer) {
                  setStatus('3Dmol 尚未加载完成，请稍后重试。');
                  return;
                }

                viewer.clear();
                viewer.addModelsAsFrames(pdbText, 'pdb');
                viewer.setStyle({ model: -1 }, { stick: { radius: 0.16, colorscheme: 'chainHetatm' } });
                viewer.zoomTo();

                const safeCount = Math.max(1, convertedFrames || detectFrameCount(pdbText, 'pdb'));
                setIsNglMode(false);
                setCanSnapshot(true);
                setFrameCount(safeCount);
                setHasTrajectory(safeCount > 1);
                setCurrentFrame(0);
                await viewer.setFrame(0);
                viewer.render();
                setStatus(safeCount > 1
                  ? `Amber rst7 后台转换成功，共 ${safeCount} 帧（PDB 多MODEL）。`
                  : 'Amber rst7 后台转换完成，当前为单帧结构。');
                return;
              }

              convertErrorMsg = '后台转换返回空内容（未生成 PDB）。';
            } else {
              const err = String(payload?.error || '后台转换接口返回失败');
              const details = String(payload?.details || '').trim();
              convertErrorMsg = details ? `${err}：${details}` : err;
            }
          } catch (e: any) {
            convertErrorMsg = e?.message || String(e) || '后台转换请求异常';
          }

          const fileTrajExt = getFileExt(trajectoryFile);
          const coordExtCandidates = Array.from(new Set([
            fileTrajExt,
            'crd',
            'inpcrd',
            'restrt',
            'rst7',
          ].filter(Boolean)));

          let coordLoaded = false;
          for (const ext of coordExtCandidates) {
            try {
              const coordComp = await stage.loadFile(xtcUrlRef.current, { ext });
              coordComp.addRepresentation('ball+stick', { multipleBond: true, aspectRatio: 1.6, radiusScale: 0.35 });
              coordComp.autoView();
              coordLoaded = true;
              break;
            } catch {
              // 尝试下一个扩展名
            }
          }

          setFrameCount(1);
          setHasTrajectory(false);
          setCurrentFrame(0);
          stage.viewer?.requestRender?.();

          if (coordLoaded) {
            const hint = convertErrorMsg ? ` 后台转换失败原因：${convertErrorMsg}` : '';
            setStatus(`Amber 文件已加载（当前重启坐标按单帧结构显示）。若需时间轨迹播放，建议先转为 GRO+XTC 或 DCD。${hint}`);
          } else {
            const detail = convertErrorMsg ? ` 后台转换失败原因：${convertErrorMsg}` : '';
            setStatus(`rst7 后台转换失败，且当前 NGL 也无法直接解析 rst7/inpcrd。请检查文件是否有效，或确认服务器已安装 cpptraj。${detail}`);
          }
          return;
        }

        const trajParams = {
          centerPbc: true,
          removePbc: true,
          superpose: true,
          ext: trajExt,
        };

        const NGLAny = (window as any).NGL;
        const blobDatasource = {
          getUrl: (u: string) => u,
          getCountUrl: (u: string) => u,
        };
        NGLAny?.DatasourceRegistry?.add?.('blob', blobDatasource);
        NGLAny?.DatasourceRegistry?.add?.('blob:', blobDatasource);

        let trajPlayer: any;
        let errA: any = null;
        let errB: any = null;

        try {
          const trajBuffer = await trajectoryFile.arrayBuffer();
          const trajNamedFile = new File([trajBuffer], trajectoryFile.name || `trajectory.${trajExt}`, {
            type: 'application/octet-stream',
          });
          const trajData = await NGLAny.autoLoad(trajNamedFile, { ext: trajExt });
          trajPlayer = await structureComp.addTrajectory(trajData, trajParams);
        } catch (e1: any) {
          errA = e1;
        }

        if (!trajPlayer) {
          try {
            trajPlayer = await structureComp.addTrajectory(xtcUrlRef.current, trajParams);
          } catch (e2: any) {
            errB = e2;
          }
        }

        if (!trajPlayer) {
          const msg1 = errA?.message || String(errA || 'unknown');
          const msg2 = errB?.message || String(errB || 'unknown');
          throw new Error(`${modeLabel} 轨迹加载失败：${msg1}；URL重试后仍失败：${msg2}`);
        }

        const trajObj = trajPlayer?.trajectory ?? structureComp?.trajList?.[0]?.trajectory ?? trajPlayer;
        if (!trajObj) {
          throw new Error('NGL 轨迹对象创建失败（addTrajectory 返回空对象）');
        }
        nglTrajectoryRef.current = trajObj;

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
        setHasTrajectory(safeCount > 0);

        if (safeCount > 0) {
          if (typeof trajObj?.setFrame === 'function') {
            await trajObj.setFrame(0);
          } else if (typeof trajObj?.loadFrame === 'function') {
            await trajObj.loadFrame(0);
          }
        }

        nglStageRef.current?.viewer?.requestRender?.();
        setCurrentFrame(0);
        setStatus(safeCount > 0 ? `${modeLabel} 轨迹加载成功，共 ${safeCount} 帧。` : `${modeLabel} 已加载结构，但未读取到轨迹帧数（0帧）。`);
        return;
      }

      // 其他格式：使用 3Dmol
      resetRenderEngines();
      const viewer = ensureViewer();
      if (!viewer) {
        setStatus('3Dmol 尚未加载完成，请稍后重试。');
        return;
      }

      const topology = await topologyFile.text();
      const trajectory = await trajectoryFile.text();

      const extractMolBlock = (s: string) => {
        const lines = s.split(/\r?\n/);
        const endIdx = lines.findIndex((line) => line.trim() === 'M  END' || line.trim() === 'M END');
        if (endIdx < 0) return s.trim();
        return lines.slice(0, endIdx + 1).join('\n').trim();
      };

      const normalizeSdfFrames = (s: string) => {
        const blocks = s
          .split(/\$\$\$\$/g)
          .map((block) => block.trim())
          .filter(Boolean)
          .map((block) => extractMolBlock(block))
          .filter(Boolean)
          .filter((block) => {
            const lines = block.split(/\r?\n/).filter((l) => l.length > 0);
            if (lines.length < 4) return false;
            const cnt = (lines[3] || '').trim().split(/\s+/);
            const atomCount = Number(cnt[0]);
            const bondCount = Number(cnt[1]);
            if (!Number.isFinite(atomCount) || !Number.isFinite(bondCount)) return false;
            const minLines = 4 + atomCount + bondCount;
            return lines.length >= minLines;
          });

        if (blocks.length === 0) return '';
        return `${blocks.join('\n$$$$\n')}\n$$$$\n`;
      };

      const safeTopology = topologyFormat === 'sdf' ? extractMolBlock(topology) : topology;
      const safeTrajectory = trajFormat === 'sdf' ? normalizeSdfFrames(trajectory) : trajectory;

      viewer.clear();
      if (showReference) {
        viewer.addModel(safeTopology, topologyFormat);
        viewer.setStyle({ model: 0 }, { cartoon: { color: '#6ee7ff', opacity: 0.5 }, stick: { radius: 0.12 } });
      }

      if (trajFormat === 'sdf') {
        const sdfBlocks = safeTrajectory
          .split(/\$\$\$\$/g)
          .map((b) => b.trim())
          .filter(Boolean);

        if (sdfBlocks.length === 0) {
          throw new Error('SDF 轨迹为空或格式不正确（未找到有效帧）');
        }

        // 优先走 3Dmol 官方的多模型帧模式；若失败再逐帧 fallback
        let sdfLoaded = false;
        try {
          viewer.addModel(safeTrajectory, 'sdf', { multimodel: true, frames: true });
          sdfLoaded = true;
        } catch {
          let loadedCount = 0;
          for (let i = 0; i < sdfBlocks.length; i += 1) {
            const block = sdfBlocks[i];
            try {
              viewer.addModel(`${block}\n`, 'sdf');
              loadedCount += 1;
            } catch {
              // 跳过坏帧，继续加载后续帧
            }
          }

          if (loadedCount === 0) {
            throw new Error('SDF 轨迹解析失败：所有帧均无法被 3Dmol 解析');
          }

          sdfLoaded = true;
          setStatus(`SDF 轨迹部分帧已加载（${loadedCount}/${sdfBlocks.length}）。`);
        }

        if (!sdfLoaded) {
          throw new Error('SDF 轨迹加载失败');
        }
      } else {
        viewer.addModelsAsFrames(safeTrajectory, trajFormat);
      }

      viewer.setStyle({ model: -1 }, { stick: { radius: 0.16, colorscheme: 'chainHetatm' } });
      viewer.zoomTo();

      const count = detectFrameCount(safeTrajectory, trajFormat);
      setFrameCount(count);
      setHasTrajectory(count > 0);
      setCanSnapshot(count > 0);
      setCurrentFrame(0);

      try {
        await viewer.setFrame(0);
      } catch (e) {
        // 某些 3Dmol + SDF 组合在 setFrame 时会触发内部 trim 异常，降级为静态展示
        if (trajFormat === 'sdf') {
          setFrameCount(1);
          setHasTrajectory(false);
          setCurrentFrame(0);
          viewer.render();
          setStatus('SDF 已加载为静态结构（3Dmol 当前版本对该多构象轨迹播放兼容性有限）。');
          return;
        }
        throw e;
      }

      viewer.render();
      setStatus(`轨迹加载成功，共 ${count} 帧。`);
    } catch (err: any) {
      const message = err?.message || String(err) || '未知错误';
      setStatus(`加载失败：${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSnapshot = async () => {
    try {
      if (isNglMode && nglStageRef.current) {
        const blob = await nglStageRef.current.makeImage({ factor: 1, antialias: true, trim: false });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `trajectory_frame_${currentFrame + 1}.png`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatus(`已保存当前帧图片：trajectory_frame_${currentFrame + 1}.png`);
        return;
      }

      if (!viewerRef.current) return setStatus('请先加载轨迹后再保存图片。');
      const pngData = viewerRef.current.pngURI();
      const link = document.createElement('a');
      link.href = pngData;
      link.download = `trajectory_frame_${currentFrame + 1}.png`;
      link.click();
      setStatus(`已保存当前帧图片：trajectory_frame_${currentFrame + 1}.png`);
    } catch {
      setStatus('保存图片失败，请重试。');
    }
  };

  const startRecording = () => {
    const canvas = containerRef.current?.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas || typeof canvas.captureStream !== 'function') return setStatus('当前环境不支持视频录制。');

    const stream = canvas.captureStream(Math.max(1, fps));
    const mimeCandidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mimeType = mimeCandidates.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) || '';

    mediaChunksRef.current = [];
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) mediaChunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(mediaChunksRef.current, { type: mimeType || 'video/webm' });
      if (!blob.size) {
        setStatus('录制失败：未捕获到视频帧。请重试。');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `trajectory_demo_${Date.now()}.webm`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('轨迹演示视频已保存到本地（webm）。');
    };
    recorder.start(100);
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
    setStatus('开始录制视频...');
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;
    mediaRecorderRef.current.stop();
    setIsRecording(false);
  };

  useEffect(() => {
    clearTimer();
    if (!isPlaying || frameCount <= 1) return;

    timerRef.current = setInterval(() => {
      const atEnd = currentFrame + 1 >= frameCount;
      if (atEnd && !autoLoop) {
        clearTimer();
        setIsPlaying(false);
        applyFrame(frameCount - 1);
        return;
      }
      const next = atEnd ? 0 : currentFrame + 1;
      applyFrame(next);
    }, Math.max(60, Math.floor(1000 / fps)));

    return clearTimer;
  }, [isPlaying, fps, frameCount, autoLoop, currentFrame]);

  useEffect(() => () => {
    clearTimer();
    nglTrajectoryRef.current = null;
    if (nglStageRef.current) {
      nglStageRef.current.dispose();
      nglStageRef.current = null;
    }
  }, []);

  return (
    <>
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js" strategy="beforeInteractive" />
      <Script
        src="/vendor/3Dmol-min.js"
        strategy="afterInteractive"
        onLoad={() => setIs3DmolReady(true)}
      />
      <Script
        src="/vendor/ngl.js"
        strategy="afterInteractive"
        onLoad={() => setIsNglReady(true)}
      />
      <div className="min-h-screen flex bg-transparent">
        <FeatureSideNav activeId={5} />
        <div className="flex-1 p-8">
          <div className="mx-auto max-w-7xl space-y-6">
            <div className="glass-panel rounded-3xl p-8">
              <h1 className="text-3xl font-bold text-white">分子动力学轨迹演示</h1>
              <p className="mt-3 text-slate-200">支持多种拓扑/轨迹格式导入、播放、截图与录屏导出；推荐 GROMACS（GRO + XTC）或 Amber（PRMTOP + RST7）双文件加载。</p>
            </div>
            <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
              <div className="ui-card space-y-4">
                <select value={topologyFormat} onChange={(e) => setTopologyFormat(e.target.value as TopologyFormat)} className="ui-select w-full">
                  {topologyFormats.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
                <input type="file" accept={currentTopologyAccept} onChange={(e) => setTopologyFile(e.target.files?.[0] ?? null)} className="ui-input w-full" />
                <select value={trajFormat} onChange={(e) => setTrajFormat(e.target.value as TrajFormat)} className="ui-select w-full">
                  {trajectoryFormats.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
                <input type="file" accept={currentTrajAccept} onChange={(e) => setTrajectoryFile(e.target.files?.[0] ?? null)} className="ui-input w-full" />
                <button
                  type="button"
                  onClick={loadTrajectory}
                  className="btn-primary w-full"
                  disabled={isLoading || !isEngineReady}
                >
                  {isLoading ? '加载中...' : (!isEngineReady ? (requiresNgl ? '等待 NGL 加载...' : '等待 3Dmol 加载...') : '加载轨迹')}
                </button>
                <label className="btn-secondary inline-flex items-center gap-2 w-fit">
                  <input type="checkbox" checked={showReference} onChange={(e) => setShowReference(e.target.checked)} />
                  显示静态参考结构
                </label>
                {(topologyFormat === 'gro' || trajFormat === 'xtc') && (
                  <div className="rounded-xl border border-cyan-300/30 bg-cyan-500/10 p-3 text-xs text-cyan-100 space-y-1">
                    <p>GROMACS 加载步骤（对应教程）：</p>
                    <p>1) 先选择拓扑格式为 GRO 并上传 .gro（例如 pull.gro）</p>
                    <p>2) 再选择轨迹格式为 XTC 并上传 .xtc（例如 pull.xtc）</p>
                    <p>3) 点击“加载轨迹”，可播放与逐帧查看</p>
                  </div>
                )}
                {(topologyFormat === 'prmtop' || trajFormat === 'rst7') && (
                  <div className="rounded-xl border border-fuchsia-300/30 bg-fuchsia-500/10 p-3 text-xs text-fuchsia-100 space-y-1">
                    <p>Amber 加载步骤（对应 VMD 教程）：</p>
                    <p>1) 先选择拓扑格式为 PRMTOP 并上传 .prmtop（或 .parm7/.top）</p>
                    <p>2) 再选择轨迹格式为 RST7 并上传 .rst7（或 .inpcrd/.restrt/.crd）</p>
                    <p>3) 点击“加载轨迹”；若当前文件是单帧重启坐标，将作为静态结构显示</p>
                  </div>
                )}
                {(trajFormat === 'pdb' || trajFormat === 'sdf' || trajFormat === 'mol2' || trajFormat === 'xyz') && (
                  <div className="rounded-xl border border-amber-300/30 bg-amber-500/10 p-3 text-xs text-amber-100 space-y-1">
                    <p>提示：PDB 多MODEL / SDF 多构象通常是“构象集合”，不等同于真实时间动力学轨迹。</p>
                    <p>若要展示真实动力学轨迹，建议使用 GRO + XTC（NGL 模式）。</p>
                  </div>
                )}
                <div className="ui-card text-xs text-slate-300 space-y-1">
                  <p>{status}</p>
                  <p className="text-slate-400">调试: mode={isNglMode ? 'NGL' : '3Dmol'} | 3dmolReady={is3DmolReady ? 'yes' : 'no'} | nglReady={isNglReady ? 'yes' : 'no'} | hasTrajectory={hasTrajectory ? 'yes' : 'no'} | frameCount={frameCount}</p>
                </div>
              </div>
              <div className="ui-card">
                <div className="relative h-[620px] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70"><div ref={containerRef} className="h-full w-full" /></div>
                <div className="mt-4 space-y-4">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="mb-2 flex items-center justify-between text-xs text-slate-300">
                      <span>帧进度</span>
                      <span>{hasTrajectory ? `${currentFrame + 1} / ${frameCount}` : '无轨迹帧'}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(frameCount - 1, 0)}
                      step={1}
                      value={Math.min(currentFrame, Math.max(frameCount - 1, 0))}
                      onChange={(e) => applyFrame(Number(e.target.value))}
                      className="w-full"
                      disabled={!hasTrajectory || frameCount <= 1}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button className="btn-secondary" onClick={() => setIsPlaying((p) => !p)} disabled={!hasTrajectory || frameCount <= 1}>{isPlaying ? '暂停' : '播放'}</button>
                    <button className="btn-secondary" onClick={() => applyFrame(0)} disabled={!hasTrajectory || frameCount <= 1}>到首帧</button>
                    <button className="btn-secondary" onClick={() => applyFrame(currentFrame - 10)} disabled={!hasTrajectory || frameCount <= 1}>快退10帧</button>
                    <button className="btn-secondary" onClick={() => applyFrame(currentFrame - 1)} disabled={!hasTrajectory || frameCount <= 1}>上一帧</button>
                    <button className="btn-secondary" onClick={() => applyFrame(currentFrame + 1)} disabled={!hasTrajectory || frameCount <= 1}>下一帧</button>
                    <button className="btn-secondary" onClick={() => applyFrame(currentFrame + 10)} disabled={!hasTrajectory || frameCount <= 1}>快进10帧</button>
                    <button className="btn-secondary" onClick={() => applyFrame(frameCount - 1)} disabled={!hasTrajectory || frameCount <= 1}>到末帧</button>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-300">
                      <span>播放速度（FPS）</span>
                      <span>{fps}</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={60}
                      step={1}
                      value={fps}
                      onChange={(e) => setFps(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button className="btn-secondary" onClick={saveSnapshot} disabled={!canSnapshot}>保存PNG</button>
                    {!isRecording ? <button className="btn-secondary" onClick={startRecording} disabled={!canSnapshot}>开始录制WebM</button> : <button className="btn-danger" onClick={stopRecording}>停止录制并保存</button>}
                  </div>
                  <label className="btn-secondary inline-flex items-center gap-2 w-fit"><input type="checkbox" checked={autoLoop} onChange={(e) => setAutoLoop(e.target.checked)} />自动循环</label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
