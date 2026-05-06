'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Script from 'next/script';
import FeatureSideNav from '@/components/FeatureSideNav';

declare global {
  interface Window {
    NGL: any;
  }
}

type TrajFormat = 'pdb' | 'xyz' | 'sdf' | 'mol2' | 'xtc' | 'gro';
type Point3D = { x: number; y: number; z: number };
type SeriesPoint = { t: number; rmsd: number; rg: number };

const formats: { value: TrajFormat; label: string; accept: string }[] = [
  { value: 'pdb', label: 'PDB（多 MODEL）', accept: '.pdb' },
  { value: 'xyz', label: 'XYZ（多帧）', accept: '.xyz' },
  { value: 'sdf', label: 'SDF（多构象）', accept: '.sdf' },
  { value: 'mol2', label: 'MOL2（多构象）', accept: '.mol2' },
  { value: 'xtc', label: 'GROMACS XTC（需配合 GRO）', accept: '.xtc' },
  { value: 'gro', label: 'GROMACS GRO', accept: '.gro' },
];

function parseTrajectoryStats(content: string, format: TrajFormat) {
  if (format === 'pdb') {
    const frameCount = (content.match(/^MODEL\s+/gm) || []).length || 1;
    const atomCount = ((content.match(/^ATOM\s+/gm) || []).length + (content.match(/^HETATM\s+/gm) || []).length) / frameCount;
    return { frameCount, atomCount: Math.max(0, Math.round(atomCount)), chainCount: 0, residueCount: 0 };
  }
  if (format === 'xyz') {
    const lines = content.split(/\r?\n/);
    let i = 0;
    let frameCount = 0;
    let atomCount = 0;
    while (i < lines.length) {
      const n = Number(lines[i]?.trim());
      if (!Number.isFinite(n) || n <= 0) break;
      frameCount += 1;
      atomCount = n;
      i += n + 2;
    }
    return { frameCount: Math.max(frameCount, 1), atomCount, chainCount: 0, residueCount: 0 };
  }
  if (format === 'sdf') {
    const blocks = content.split(/\$\$\$\$/g).filter((b) => b.trim().length > 0);
    return { frameCount: Math.max(blocks.length, 1), atomCount: 0, chainCount: 0, residueCount: 0 };
  }
  if (format === 'gro') {
    const lines = content.split(/\r?\n/);
    const atomCount = Number(lines[1]?.trim());
    return { frameCount: 1, atomCount: Number.isFinite(atomCount) ? atomCount : 0, chainCount: 0, residueCount: 0 };
  }
  if (format === 'xtc') {
    return { frameCount: 0, atomCount: 0, chainCount: 0, residueCount: 0 };
  }
  const molecules = content.match(/@<TRIPOS>MOLECULE/g) || [];
  return { frameCount: Math.max(molecules.length, 1), atomCount: 0, chainCount: 0, residueCount: 0 };
}

function parsePdbFrames(content: string): Point3D[][] {
  const lines = content.split(/\r?\n/);
  const frames: Point3D[][] = [];
  let current: Point3D[] = [];
  for (const line of lines) {
    if (line.startsWith('MODEL')) { if (current.length) { frames.push(current); current = []; } continue; }
    if (line.startsWith('ENDMDL')) { if (current.length) { frames.push(current); current = []; } continue; }
    if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
      const x = Number(line.slice(30, 38).trim());
      const y = Number(line.slice(38, 46).trim());
      const z = Number(line.slice(46, 54).trim());
      if ([x, y, z].every(Number.isFinite)) current.push({ x, y, z });
    }
  }
  if (current.length) frames.push(current);
  return frames;
}

function parseXyzFrames(content: string): Point3D[][] {
  const lines = content.split(/\r?\n/);
  const frames: Point3D[][] = [];
  let i = 0;
  while (i < lines.length) {
    const atomNum = Number(lines[i]?.trim());
    if (!Number.isFinite(atomNum) || atomNum <= 0) break;
    const frame: Point3D[] = [];
    for (let j = i + 2; j < i + 2 + atomNum && j < lines.length; j += 1) {
      const p = lines[j].trim().split(/\s+/);
      if (p.length >= 4) {
        const x = Number(p[1]); const y = Number(p[2]); const z = Number(p[3]);
        if ([x, y, z].every(Number.isFinite)) frame.push({ x, y, z });
      }
    }
    if (frame.length) frames.push(frame);
    i += atomNum + 2;
  }
  return frames;
}

function centroid(points: Point3D[]) {
  const c = points.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y, z: s.z + p.z }), { x: 0, y: 0, z: 0 });
  const n = Math.max(points.length, 1);
  return { x: c.x / n, y: c.y / n, z: c.z / n };
}

function normalizeQuat(q: [number, number, number, number]): [number, number, number, number] {
  const norm = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / norm, q[1] / norm, q[2] / norm, q[3] / norm];
}

function dominantQuaternion(k: number[][], iters = 40): [number, number, number, number] {
  let q: [number, number, number, number] = [1, 0, 0, 0];
  for (let i = 0; i < iters; i += 1) {
    const nq: [number, number, number, number] = [
      k[0][0] * q[0] + k[0][1] * q[1] + k[0][2] * q[2] + k[0][3] * q[3],
      k[1][0] * q[0] + k[1][1] * q[1] + k[1][2] * q[2] + k[1][3] * q[3],
      k[2][0] * q[0] + k[2][1] * q[1] + k[2][2] * q[2] + k[2][3] * q[3],
      k[3][0] * q[0] + k[3][1] * q[1] + k[3][2] * q[2] + k[3][3] * q[3],
    ];
    q = normalizeQuat(nq);
  }
  return q;
}

function quatToRotation(q: [number, number, number, number]) {
  const [w, x, y, z] = normalizeQuat(q);
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
}

function calculateRmsdKabsch(cur: Point3D[], ref: Point3D[]) {
  const n = Math.min(cur.length, ref.length);
  if (!n) return 0;

  const curPts = cur.slice(0, n);
  const refPts = ref.slice(0, n);
  const cc = centroid(curPts);
  const rc = centroid(refPts);

  let sxx = 0; let sxy = 0; let sxz = 0;
  let syx = 0; let syy = 0; let syz = 0;
  let szx = 0; let szy = 0; let szz = 0;

  for (let i = 0; i < n; i += 1) {
    const px = curPts[i].x - cc.x;
    const py = curPts[i].y - cc.y;
    const pz = curPts[i].z - cc.z;
    const qx = refPts[i].x - rc.x;
    const qy = refPts[i].y - rc.y;
    const qz = refPts[i].z - rc.z;

    sxx += px * qx; sxy += px * qy; sxz += px * qz;
    syx += py * qx; syy += py * qy; syz += py * qz;
    szx += pz * qx; szy += pz * qy; szz += pz * qz;
  }

  const k = [
    [sxx + syy + szz, syz - szy, szx - sxz, sxy - syx],
    [syz - szy, sxx - syy - szz, sxy + syx, szx + sxz],
    [szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy],
    [sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz],
  ];

  const q = dominantQuaternion(k);
  const r = quatToRotation(q);

  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const px = curPts[i].x - cc.x;
    const py = curPts[i].y - cc.y;
    const pz = curPts[i].z - cc.z;

    const rx = r[0][0] * px + r[0][1] * py + r[0][2] * pz + rc.x;
    const ry = r[1][0] * px + r[1][1] * py + r[1][2] * pz + rc.y;
    const rz = r[2][0] * px + r[2][1] * py + r[2][2] * pz + rc.z;

    const dx = rx - refPts[i].x;
    const dy = ry - refPts[i].y;
    const dz = rz - refPts[i].z;
    sum += dx * dx + dy * dy + dz * dz;
  }

  return Math.sqrt(sum / n);
}

function calculateRg(frame: Point3D[]) {
  if (!frame.length) return 0;
  const c = frame.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y, z: s.z + p.z }), { x: 0, y: 0, z: 0 });
  c.x /= frame.length; c.y /= frame.length; c.z /= frame.length;
  const sum = frame.reduce((acc, p) => acc + (p.x - c.x) ** 2 + (p.y - c.y) ** 2 + (p.z - c.z) ** 2, 0);
  return Math.sqrt(sum / frame.length);
}

function calculateRealSeries(content: string, format: TrajFormat): SeriesPoint[] {
  const frames = format === 'pdb' ? parsePdbFrames(content) : format === 'xyz' ? parseXyzFrames(content) : [];
  if (!frames.length) return [];
  const ref = frames[0];
  return frames.map((f, i) => ({ t: i + 1, rmsd: Number(calculateRmsdKabsch(f, ref).toFixed(4)), rg: Number(calculateRg(f).toFixed(4)) }));
}

function extractCoordsFromStructure(structureComp: any): Point3D[] {
  const points: Point3D[] = [];
  structureComp?.structure?.eachAtom?.((atom: any) => {
    const x = Number(atom?.x);
    const y = Number(atom?.y);
    const z = Number(atom?.z);
    if ([x, y, z].every(Number.isFinite)) points.push({ x, y, z });
  });
  return points;
}

export default function Feature6TrajectoryAnalysisPage() {
  const stageHostRef = useRef<HTMLDivElement>(null);
  const nglStageRef = useRef<any>(null);

  const [topologyFile, setTopologyFile] = useState<File | null>(null);
  const [trajectoryFile, setTrajectoryFile] = useState<File | null>(null);
  const [topologyFormat, setTopologyFormat] = useState<TrajFormat>('gro');
  const [trajectoryFormat, setTrajectoryFormat] = useState<TrajFormat>('xtc');
  const [status, setStatus] = useState('请上传拓扑文件和轨迹文件，然后开始分析。');
  const [isLoading, setIsLoading] = useState(false);
  const [isNglReady, setIsNglReady] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [atomCount, setAtomCount] = useState(0);
  const [series, setSeries] = useState<SeriesPoint[]>([]);

  const topologyAccept = useMemo(() => formats.find((f) => f.value === topologyFormat)?.accept ?? '.pdb', [topologyFormat]);
  const trajectoryAccept = useMemo(() => formats.find((f) => f.value === trajectoryFormat)?.accept ?? '.pdb', [trajectoryFormat]);

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
      if (nglStageRef.current) {
        nglStageRef.current.dispose();
        nglStageRef.current = null;
      }
    };
  }, []);

  const analyze = async () => {
    if (!topologyFile || !trajectoryFile) return setStatus('请先同时上传拓扑文件和轨迹文件。');
    setIsLoading(true);
    try {
      // 纯前端 GROMACS：NGL 读取 GRO+XTC，再在前端逐帧计算 RMSD/Rg
      if (topologyFormat === 'gro' && trajectoryFormat === 'xtc') {
        if (!isNglReady || !(window as any).NGL || !stageHostRef.current) {
          setStatus('NGL 尚未加载完成，请稍后重试。');
          return;
        }

        const stage = nglStageRef.current ?? new window.NGL.Stage(stageHostRef.current, {
          backgroundColor: '#000000',
          tooltip: false,
        });
        nglStageRef.current = stage;
        stage.removeAllComponents();

        const groUrl = URL.createObjectURL(topologyFile);
        const xtcUrl = URL.createObjectURL(trajectoryFile);

        try {
          const structureComp = await stage.loadFile(groUrl, { ext: 'gro' });

          const trajParams = {
            centerPbc: true,
            removePbc: true,
            superpose: true,
            ext: 'xtc',
          };

          let trajPlayer: any = null;
          try {
            const NGLAny = (window as any).NGL;
            const trajBuffer = await trajectoryFile.arrayBuffer();
            const trajNamedFile = new File([trajBuffer], trajectoryFile.name || 'trajectory.xtc', { type: 'application/octet-stream' });
            const trajData = await NGLAny.autoLoad(trajNamedFile, { ext: 'xtc' });
            trajPlayer = await structureComp.addTrajectory(trajData, trajParams);
          } catch {
            trajPlayer = await structureComp.addTrajectory(xtcUrl, trajParams);
          }

          const trajObj = trajPlayer?.trajectory ?? structureComp?.trajList?.[0]?.trajectory ?? trajPlayer;
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
            await new Promise((r) => setTimeout(r, 50));
            count = getCount();
          }

          const safeCount = Math.max(0, count || 0);
          if (safeCount <= 0) {
            throw new Error('未读取到 XTC 轨迹帧数');
          }

          const maxPoints = 400;
          const stride = safeCount > maxPoints ? Math.ceil(safeCount / maxPoints) : 1;
          const sampledFrameIndexes: number[] = [];
          for (let i = 0; i < safeCount; i += stride) sampledFrameIndexes.push(i);
          if (sampledFrameIndexes[sampledFrameIndexes.length - 1] !== safeCount - 1) {
            sampledFrameIndexes.push(safeCount - 1);
          }

          if (sampledFrameIndexes.length === 0) {
            throw new Error('未生成可用采样帧');
          }

          if (typeof trajObj?.setFrame === 'function') {
            await trajObj.setFrame(sampledFrameIndexes[0]);
          } else if (typeof trajObj?.loadFrame === 'function') {
            await trajObj.loadFrame(sampledFrameIndexes[0]);
          }
          const ref = extractCoordsFromStructure(structureComp);
          if (!ref.length) {
            throw new Error('无法读取参考帧坐标');
          }

          const computed: SeriesPoint[] = [];
          const chunkSize = 20;
          for (let k = 0; k < sampledFrameIndexes.length; k += 1) {
            const frameIdx = sampledFrameIndexes[k];
            if (typeof trajObj?.setFrame === 'function') {
              await trajObj.setFrame(frameIdx);
            } else if (typeof trajObj?.loadFrame === 'function') {
              await trajObj.loadFrame(frameIdx);
            }

            const pts = extractCoordsFromStructure(structureComp);
            if (pts.length) {
              computed.push({
                t: frameIdx + 1,
                rmsd: Number(calculateRmsdKabsch(pts, ref).toFixed(4)),
                rg: Number(calculateRg(pts).toFixed(4)),
              });
            }

            if ((k + 1) % chunkSize === 0) {
              const pct = Math.round(((k + 1) / sampledFrameIndexes.length) * 100);
              setStatus(`分析中：已处理 ${k + 1}/${sampledFrameIndexes.length} 个采样帧（${pct}%）...`);
              await new Promise((r) => setTimeout(r, 0));
            }
          }

          if (!computed.length) {
            throw new Error('轨迹已加载但无法读取采样坐标帧');
          }

          setFrameCount(safeCount);
          setAtomCount(ref.length);
          setSeries(computed);
          setStatus(
            stride > 1
              ? `分析完成：共 ${safeCount} 帧，按每 ${stride} 帧抽样（${computed.length} 点）并使用 Kabsch 对齐计算 RMSD / Rg。`
              : `分析完成：共 ${safeCount} 帧，使用 Kabsch 对齐计算 RMSD / Rg。`
          );
        } finally {
          URL.revokeObjectURL(groUrl);
          URL.revokeObjectURL(xtcUrl);
        }

        return;
      }

      // 其他格式：现有前端解析逻辑
      const [topText, trajText] = await Promise.all([topologyFile.text(), trajectoryFile.text()]);
      const topStats = parseTrajectoryStats(topText, topologyFormat);
      const trajStats = parseTrajectoryStats(trajText, trajectoryFormat);
      setFrameCount(trajStats.frameCount);
      setAtomCount(Math.max(topStats.atomCount, trajStats.atomCount));
      const s = calculateRealSeries(trajText, trajectoryFormat);
      setSeries(s);
      setStatus(s.length ? `分析完成：真实计算得到 ${s.length} 帧的 RMSD / Rg（已进行 Kabsch 对齐）。` : '当前格式暂不支持真实几何计算（支持 PDB/XYZ；GRO+XTC 已支持前端真实计算+抽样）。');
    } catch (e: any) {
      const msg = e?.message || '分析失败，请确认文件内容和格式匹配。';
      setStatus(`分析失败：${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const maxRmsd = Math.max(...series.map((s) => s.rmsd), 1);
  const maxRg = Math.max(...series.map((s) => s.rg), 1);

  return (
    <>
      <Script
        src="/vendor/ngl.js"
        strategy="afterInteractive"
        onLoad={() => setIsNglReady(true)}
      />
      <div className="min-h-screen flex bg-transparent">
        <FeatureSideNav activeId={6} />
        <div className="flex-1 p-8">
          <div className="mx-auto max-w-7xl space-y-6">
            <div className="glass-panel rounded-3xl p-8">
              <h1 className="text-3xl font-bold text-white">轨迹分析总览</h1>
              <p className="mt-3 text-slate-200">上传文件并分析，支持RMSD / 回转半径（Rg）计算。</p>
            </div>
            <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
              <div className="ui-card space-y-4">
                <select className="ui-select w-full" value={topologyFormat} onChange={(e) => setTopologyFormat(e.target.value as TrajFormat)}>{formats.map((f) => <option key={`t-${f.value}`} value={f.value}>{f.label}</option>)}</select>
                <input className="ui-input w-full" type="file" accept={topologyAccept} onChange={(e) => setTopologyFile(e.target.files?.[0] ?? null)} />
                <select className="ui-select w-full" value={trajectoryFormat} onChange={(e) => setTrajectoryFormat(e.target.value as TrajFormat)}>{formats.map((f) => <option key={`x-${f.value}`} value={f.value}>{f.label}</option>)}</select>
                <input className="ui-input w-full" type="file" accept={trajectoryAccept} onChange={(e) => setTrajectoryFile(e.target.files?.[0] ?? null)} />
                <button className="btn-primary w-full" onClick={analyze} disabled={isLoading || (topologyFormat === 'gro' && trajectoryFormat === 'xtc' && !isNglReady)}>{isLoading ? '分析中...' : '开始分析'}</button>
                <div className="ui-card text-xs text-slate-300"><p>{status}</p><p className="mt-1">帧数: {frameCount} | 原子数: {atomCount}</p></div>
              </div>
              <div className="space-y-6">
                <div className="ui-card">
                  <h3 className="text-lg font-semibold text-white">RMSD 计算结果</h3>
                  <div className="mt-4 h-40 rounded-xl border border-white/10 bg-slate-950/70 p-3"><div className="flex h-full items-end gap-1">{series.slice(0, 120).map((p) => <div key={`r${p.t}`} className="flex-1 rounded-t bg-gradient-to-t from-cyan-500/70 to-fuchsia-500/70" style={{ height: `${Math.max(5, (p.rmsd / maxRmsd) * 100)}%` }} />)}</div></div>
                </div>
                <div className="ui-card">
                  <h3 className="text-lg font-semibold text-white">回转半径 Rg 计算结果</h3>
                  <div className="mt-4 h-40 rounded-xl border border-white/10 bg-slate-950/70 p-3"><div className="flex h-full items-end gap-1">{series.slice(0, 120).map((p) => <div key={`g${p.t}`} className="flex-1 rounded-t bg-gradient-to-t from-emerald-500/70 to-cyan-400/70" style={{ height: `${Math.max(5, (p.rg / maxRg) * 100)}%` }} />)}</div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div ref={stageHostRef} className="fixed -left-[99999px] top-0 h-[4px] w-[4px] overflow-hidden opacity-0 pointer-events-none" />
    </>
  );
}
