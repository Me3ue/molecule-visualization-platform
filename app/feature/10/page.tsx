'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Script from 'next/script';
import FeatureSideNav from '@/components/FeatureSideNav';

type Atom = {
  index: number;
  name: string;
  resname: string;
  resid: number;
  chain: string;
  elem: string;
  x: number;
  y: number;
  z: number;
};

type Molecule = {
  id: number;
  name: string;
  content: string;
  atoms: Atom[];
};

type Selection = {
  name: string;
  molId: number;
  query: string;
  atoms: Atom[];
};

const massTable: Record<string, number> = {
  H: 1.008,
  C: 12.011,
  N: 14.007,
  O: 15.999,
  P: 30.974,
  S: 32.06,
  F: 18.998,
  CL: 35.45,
  BR: 79.904,
  I: 126.9,
};

function parsePdbAtoms(content: string): Atom[] {
  const lines = content.split(/\r?\n/);
  const atoms: Atom[] = [];

  for (const line of lines) {
    if (!(line.startsWith('ATOM') || line.startsWith('HETATM'))) continue;

    const index = Number(line.slice(6, 11).trim()) || atoms.length + 1;
    const name = line.slice(12, 16).trim();
    const resname = line.slice(17, 20).trim();
    const chain = line.slice(21, 22).trim();
    const resid = Number(line.slice(22, 26).trim()) || 0;
    const x = Number(line.slice(30, 38).trim());
    const y = Number(line.slice(38, 46).trim());
    const z = Number(line.slice(46, 54).trim());
    const rawElem = line.slice(76, 78).trim() || name.replace(/[^A-Za-z]/g, '').slice(0, 2);
    const elem = rawElem.toUpperCase();

    if ([x, y, z].every(Number.isFinite)) {
      atoms.push({ index, name, resname, resid, chain, elem, x, y, z });
    }
  }

  return atoms;
}

function atomSelect(atoms: Atom[], query: string): Atom[] {
  const q = query.trim().toLowerCase();

  if (q === 'all') return atoms;
  if (q === 'protein') return atoms.filter((a) => a.resname !== 'HOH' && a.resname !== 'WAT');

  const parts = q.split(/\s+and\s+/i).map((p) => p.trim());
  return atoms.filter((a) => {
    return parts.every((part) => {
      if (part.startsWith('resname ')) {
        const v = part.replace('resname ', '').toUpperCase();
        return a.resname.toUpperCase() === v;
      }
      if (part.startsWith('resid ')) {
        const v = Number(part.replace('resid ', '').trim());
        return a.resid === v;
      }
      if (part.startsWith('name ')) {
        const v = part.replace('name ', '').toUpperCase();
        return a.name.toUpperCase() === v;
      }
      if (part.startsWith('chain ')) {
        const v = part.replace('chain ', '').toUpperCase();
        return a.chain.toUpperCase() === v;
      }
      return false;
    });
  });
}

function centerOfAtoms(atoms: Atom[], weightedMass: boolean): [number, number, number] {
  if (atoms.length === 0) return [0, 0, 0];

  let sx = 0;
  let sy = 0;
  let sz = 0;
  let sw = 0;

  for (const a of atoms) {
    const w = weightedMass ? (massTable[a.elem] ?? 12) : 1;
    sx += a.x * w;
    sy += a.y * w;
    sz += a.z * w;
    sw += w;
  }

  return [sx / sw, sy / sw, sz / sw];
}

function distance(a: Atom, b: Atom) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function angle(a: Atom, b: Atom, c: Atom) {
  const v1 = [a.x - b.x, a.y - b.y, a.z - b.z];
  const v2 = [c.x - b.x, c.y - b.y, c.z - b.z];
  const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  const n1 = Math.sqrt(v1[0] ** 2 + v1[1] ** 2 + v1[2] ** 2);
  const n2 = Math.sqrt(v2[0] ** 2 + v2[1] ** 2 + v2[2] ** 2);
  const cosv = Math.max(-1, Math.min(1, dot / (n1 * n2 || 1)));
  return (Math.acos(cosv) * 180) / Math.PI;
}

function dihedral(a: Atom, b: Atom, c: Atom, d: Atom) {
  const b1 = [b.x - a.x, b.y - a.y, b.z - a.z];
  const b2 = [c.x - b.x, c.y - b.y, c.z - b.z];
  const b3 = [d.x - c.x, d.y - c.y, d.z - c.z];

  const cross = (u: number[], v: number[]) => [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
  const dot = (u: number[], v: number[]) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const norm = (u: number[]) => Math.sqrt(dot(u, u)) || 1;

  const n1 = cross(b1, b2);
  const n2 = cross(b2, b3);
  const m1 = cross(n1, b2);

  const x = dot(n1, n2) / (norm(n1) * norm(n2));
  const y = dot(m1, n2) / (norm(m1) * norm(n2));
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export default function VmdCommandLabPage() {
  const viewerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [files, setFiles] = useState<{ name: string; content: string }[]>([]);
  const [cwd, setCwd] = useState('D:/workspace');
  const [command, setCommand] = useState('');
  const [scriptText, setScriptText] = useState('');
  const [logs, setLogs] = useState<string[]>([
    'VMD Web Console 已启动。输入 help 查看可用命令。',
    '示例：mol new 1OWY.pdb | rotate y by 180 | set sel [atomselect top "protein"] | measure center $sel',
  ]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [molecules, setMolecules] = useState<Molecule[]>([]);
  const [currentMolId, setCurrentMolId] = useState<number | null>(null);
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [showCommandHelp, setShowCommandHelp] = useState(false);
  const [showAxes, setShowAxes] = useState(true);
  const [renderMode, setRenderMode] = useState<'normal' | 'glsl'>('normal');
  const [background, setBackground] = useState<'dark' | 'white'>('dark');

  const selectionCounter = useRef(1);

  const currentMol = useMemo(
    () => molecules.find((m) => m.id === currentMolId) ?? null,
    [molecules, currentMolId]
  );

  const log = (line: string) => setLogs((prev) => [...prev, line]);

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

  const renderMolecule = (mol: Molecule | null) => {
    const viewer = ensureViewer();
    if (!viewer) return;

    viewer.clear();
    if (!mol) {
      viewer.render();
      return;
    }

    viewer.addModel(mol.content, 'pdb');
    viewer.setStyle({}, { cartoon: { color: 'spectrum' }, stick: { radius: 0.16 } });

    if (showAxes) {
      viewer.addLine({ start: { x: 0, y: 0, z: 0 }, end: { x: 20, y: 0, z: 0 }, color: 'red', dashed: false });
      viewer.addLine({ start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 20, z: 0 }, color: 'green', dashed: false });
      viewer.addLine({ start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: 20 }, color: 'blue', dashed: false });
    }

    viewer.zoomTo();
    viewer.render();
  };

  const execute = (raw: string) => {
    const cmd = raw.trim();
    if (!cmd) return;

    log(`> ${cmd}`);

    if (cmd === 'help') {
      log('可用命令: help, pwd, cd <path>, mol new <file>, mol delete all|<id>, rotate <x|y|z> by <deg>, set var [atomselect top "query"], measure center $var [weight mass], measure bond <i> <j>, measure angle <i> <j> <k>, measure dihedral <i> <j> <k> <l>, $var get index|resname, list mols, display resetview, display axes on|off, color display background white|dark, render mode normal|glsl, save state, save coords <query>, clear');
      return;
    }

    if (cmd === 'clear') {
      setLogs([]);
      return;
    }

    if (cmd === 'pwd') {
      log(cwd);
      return;
    }

    if (cmd.startsWith('cd ')) {
      const target = cmd.slice(3).trim();
      setCwd(target);
      log(`工作路径已切换到: ${target}`);
      return;
    }

    if (cmd === 'list mols') {
      if (molecules.length === 0) {
        log('当前无分子。');
      } else {
        molecules.forEach((m) => log(`mol ${m.id}: ${m.name}${m.id === currentMolId ? ' (top)' : ''}`));
      }
      return;
    }

    if (cmd.startsWith('mol new ')) {
      const fileName = cmd.slice('mol new '.length).trim().replace(/^['"]|['"]$/g, '');
      const found = files.find((f) => f.name.toLowerCase() === fileName.toLowerCase());
      if (!found) {
        log(`未找到文件: ${fileName}。请先在页面上传该 PDB 文件。`);
        return;
      }

      const atoms = parsePdbAtoms(found.content);
      const nextId = molecules.length > 0 ? Math.max(...molecules.map((m) => m.id)) + 1 : 0;
      const mol: Molecule = { id: nextId, name: found.name, content: found.content, atoms };
      setMolecules((prev) => [...prev, mol]);
      setCurrentMolId(nextId);
      renderMolecule(mol);
      log(String(nextId));
      return;
    }

    if (cmd === 'mol delete all') {
      setMolecules([]);
      setCurrentMolId(null);
      setSelections({});
      renderMolecule(null);
      log('已删除所有分子。');
      return;
    }

    if (cmd.startsWith('mol delete ')) {
      const id = Number(cmd.slice('mol delete '.length).trim());
      if (!Number.isFinite(id)) {
        log('用法: mol delete <id>');
        return;
      }
      const next = molecules.filter((m) => m.id !== id);
      setMolecules(next);
      if (currentMolId === id) {
        const top = next.length > 0 ? next[next.length - 1] : null;
        setCurrentMolId(top ? top.id : null);
        renderMolecule(top);
      }
      log(`已删除分子 ${id}`);
      return;
    }

    const rotMatch = cmd.match(/^rotate\s+([xyz])\s+by\s+(-?\d+(?:\.\d+)?)$/i);
    if (rotMatch) {
      const axis = rotMatch[1].toLowerCase();
      const deg = Number(rotMatch[2]);
      const viewer = ensureViewer();
      if (!viewer) {
        log('3D 视图尚未初始化。');
        return;
      }
      viewer.rotate(deg, axis);
      viewer.render();
      log(`已绕 ${axis} 轴旋转 ${deg} 度。`);
      return;
    }

    const setSelMatch = cmd.match(/^set\s+(\w+)\s+\[\s*atomselect\s+top\s+"(.+)"\s*\]$/i);
    if (setSelMatch) {
      if (!currentMol) {
        log('当前没有 top 分子，请先 mol new。');
        return;
      }
      const varName = setSelMatch[1];
      const query = setSelMatch[2];
      const atoms = atomSelect(currentMol.atoms, query);
      const selName = `atomselect${selectionCounter.current++}`;
      setSelections((prev) => ({
        ...prev,
        [varName]: { name: selName, molId: currentMol.id, query, atoms },
      }));
      log(selName);
      return;
    }

    const measureMatch = cmd.match(/^measure\s+center\s+\$(\w+)(?:\s+weight\s+mass)?$/i);
    if (measureMatch) {
      const varName = measureMatch[1];
      const weighted = /weight\s+mass/i.test(cmd);
      const sel = selections[varName];
      if (!sel) {
        log(`未找到选择变量 $${varName}`);
        return;
      }
      const c = centerOfAtoms(sel.atoms, weighted);
      log(`${c[0]} ${c[1]} ${c[2]}`);
      return;
    }

    const bondMatch = cmd.match(/^measure\s+bond\s+(\d+)\s+(\d+)$/i);
    if (bondMatch && currentMol) {
      const i = Number(bondMatch[1]);
      const j = Number(bondMatch[2]);
      const a = currentMol.atoms.find((x) => x.index === i);
      const b = currentMol.atoms.find((x) => x.index === j);
      if (!a || !b) {
        log('未找到指定原子 index。');
        return;
      }
      log(`${distance(a, b).toFixed(3)} Å`);
      return;
    }

    const angleMatch = cmd.match(/^measure\s+angle\s+(\d+)\s+(\d+)\s+(\d+)$/i);
    if (angleMatch && currentMol) {
      const a = currentMol.atoms.find((x) => x.index === Number(angleMatch[1]));
      const b = currentMol.atoms.find((x) => x.index === Number(angleMatch[2]));
      const c = currentMol.atoms.find((x) => x.index === Number(angleMatch[3]));
      if (!a || !b || !c) {
        log('未找到指定原子 index。');
        return;
      }
      log(`${angle(a, b, c).toFixed(3)} deg`);
      return;
    }

    const dihedralMatch = cmd.match(/^measure\s+dihedral\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/i);
    if (dihedralMatch && currentMol) {
      const a = currentMol.atoms.find((x) => x.index === Number(dihedralMatch[1]));
      const b = currentMol.atoms.find((x) => x.index === Number(dihedralMatch[2]));
      const c = currentMol.atoms.find((x) => x.index === Number(dihedralMatch[3]));
      const d = currentMol.atoms.find((x) => x.index === Number(dihedralMatch[4]));
      if (!a || !b || !c || !d) {
        log('未找到指定原子 index。');
        return;
      }
      log(`${dihedral(a, b, c, d).toFixed(3)} deg`);
      return;
    }

    if (cmd === 'display resetview') {
      const viewer = ensureViewer();
      if (!viewer) return;
      viewer.zoomTo();
      viewer.render();
      log('视图已重置。');
      return;
    }

    const axesMatch = cmd.match(/^display\s+axes\s+(on|off)$/i);
    if (axesMatch) {
      setShowAxes(axesMatch[1].toLowerCase() === 'on');
      if (currentMol) renderMolecule(currentMol);
      log(`坐标轴已${axesMatch[1] === 'on' ? '开启' : '关闭'}。`);
      return;
    }

    const bgMatch = cmd.match(/^color\s+display\s+background\s+(white|dark)$/i);
    if (bgMatch) {
      const mode = bgMatch[1].toLowerCase() as 'white' | 'dark';
      setBackground(mode);
      const viewer = ensureViewer();
      if (viewer) {
        viewer.setBackgroundColor(mode === 'white' ? '#ffffff' : '#090f1f');
        viewer.render();
      }
      log(`背景已切换为 ${mode}.`);
      return;
    }

    const renderMatch = cmd.match(/^render\s+mode\s+(normal|glsl)$/i);
    if (renderMatch) {
      setRenderMode(renderMatch[1].toLowerCase() as 'normal' | 'glsl');
      log(`渲染模式已切换为 ${renderMatch[1]}.`);
      return;
    }

    if (cmd === 'save state') {
      const payload = {
        cwd,
        currentMolId,
        molecules: molecules.map((m) => ({ id: m.id, name: m.name })),
        selections: Object.fromEntries(Object.entries(selections).map(([k, v]) => [k, { molId: v.molId, query: v.query, count: v.atoms.length }])),
        background,
        renderMode,
        showAxes,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vmd-web-state.json';
      a.click();
      URL.revokeObjectURL(url);
      log('状态已导出为 vmd-web-state.json');
      return;
    }

    const saveCoordsMatch = cmd.match(/^save\s+coords\s+"(.+)"$/i) || cmd.match(/^save\s+coords\s+(.+)$/i);
    if (saveCoordsMatch && currentMol) {
      const query = saveCoordsMatch[1];
      const atoms = atomSelect(currentMol.atoms, query);
      if (atoms.length === 0) {
        log('没有匹配到原子。');
        return;
      }
      const pdb = atoms.map((a, idx) => `ATOM  ${String(idx + 1).padStart(5)} ${a.name.padEnd(4)} ${a.resname.padEnd(3)} ${a.chain || 'A'}${String(a.resid).padStart(4)}    ${a.x.toFixed(3).padStart(8)}${a.y.toFixed(3).padStart(8)}${a.z.toFixed(3).padStart(8)}  1.00  0.00          ${a.elem.padStart(2)}`).join('\n') + '\nEND\n';
      const blob = new Blob([pdb], { type: 'chemical/x-pdb' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `selection_${Date.now()}.pdb`;
      a.click();
      URL.revokeObjectURL(url);
      log(`已导出 ${atoms.length} 个原子坐标。`);
      return;
    }

    const getMatch = cmd.match(/^\$(\w+)\s+get\s+(index|resname)$/i);
    if (getMatch) {
      const varName = getMatch[1];
      const field = getMatch[2].toLowerCase();
      const sel = selections[varName];
      if (!sel) {
        log(`未找到选择变量 $${varName}`);
        return;
      }

      if (field === 'index') {
        log(sel.atoms.slice(0, 80).map((a) => a.index).join(' '));
      } else {
        log(Array.from(new Set(sel.atoms.map((a) => a.resname))).join(' '));
      }
      return;
    }

    log('未知命令。输入 help 查看支持的命令。');
  };

  const runCommand = (raw: string) => {
    const cmd = raw.trim();
    if (!cmd) return;
    execute(cmd);
    setHistory((prev) => {
      if (prev[prev.length - 1] === cmd) return prev;
      return [...prev, cmd];
    });
    setHistoryIndex(-1);
    setCommand('');
  };

  const runScript = () => {
    const lines = scriptText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));

    if (lines.length === 0) {
      log('脚本为空。');
      return;
    }

    lines.forEach((line) => runCommand(line));
    log(`脚本执行完成，共 ${lines.length} 条命令。`);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length === 0) return;

    const loaded = await Promise.all(
      selected.map(async (f) => ({ name: f.name, content: await f.text() }))
    );

    setFiles((prev) => {
      const map = new Map<string, { name: string; content: string }>();
      [...prev, ...loaded].forEach((f) => map.set(f.name.toLowerCase(), f));
      return Array.from(map.values());
    });

    log(`已上传 ${selected.length} 个文件。可执行 mol new <文件名> 加载。`);
  };

  useEffect(() => {
    if (currentMol) renderMolecule(currentMol);
  }, [currentMolId]);

  return (
    <>
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js" strategy="beforeInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/3dmol@2.5.2/build/3Dmol-min.js" strategy="afterInteractive" />

      <div className="min-h-screen flex bg-transparent">
        <FeatureSideNav activeId={10} />

        {showCommandHelp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="glass-panel w-full max-w-3xl rounded-3xl p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">命令清单与用法</h2>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => setShowCommandHelp(false)}
                >
                  关闭
                </button>
              </div>

              <div className="max-h-[70vh] overflow-auto rounded-2xl border border-white/10 bg-black/40 p-4 font-mono text-xs text-slate-200">
                <div className="space-y-2">
                  <p><span className="text-cyan-300">help</span> - 显示简要帮助</p>
                  <p><span className="text-cyan-300">pwd</span> - 显示当前工作路径</p>
                  <p><span className="text-cyan-300">cd &lt;path&gt;</span> - 切换工作路径</p>
                  <p><span className="text-cyan-300">list mols</span> - 列出已加载分子</p>
                  <p><span className="text-cyan-300">mol new &lt;filename.pdb&gt;</span> - 从已上传文件加载分子</p>
                  <p><span className="text-cyan-300">mol delete all</span> - 删除全部分子</p>
                  <p><span className="text-cyan-300">mol delete &lt;id&gt;</span> - 删除指定分子</p>
                  <p><span className="text-cyan-300">rotate x|y|z by &lt;deg&gt;</span> - 旋转视图</p>
                  <p><span className="text-cyan-300">set sel [atomselect top "query"]</span> - 创建原子选择变量</p>
                  <p className="pl-4 text-slate-300">query 支持：all / protein / resname XXX / resid N / chain A / name CA，可用 and 组合</p>
                  <p><span className="text-cyan-300">measure center $sel</span> - 计算选择中心</p>
                  <p><span className="text-cyan-300">measure center $sel weight mass</span> - 计算质量加权中心</p>
                  <p><span className="text-cyan-300">measure bond &lt;i&gt; &lt;j&gt;</span> - 测量两原子距离</p>
                  <p><span className="text-cyan-300">measure angle &lt;i&gt; &lt;j&gt; &lt;k&gt;</span> - 测量三原子角度</p>
                  <p><span className="text-cyan-300">measure dihedral &lt;i&gt; &lt;j&gt; &lt;k&gt; &lt;l&gt;</span> - 测量四原子二面角</p>
                  <p><span className="text-cyan-300">display resetview</span> - 恢复视图</p>
                  <p><span className="text-cyan-300">display axes on|off</span> - 开关坐标轴</p>
                  <p><span className="text-cyan-300">color display background white|dark</span> - 切换背景颜色</p>
                  <p><span className="text-cyan-300">render mode normal|glsl</span> - 切换渲染模式（标记）</p>
                  <p><span className="text-cyan-300">save state</span> - 导出可视化状态 JSON</p>
                  <p><span className="text-cyan-300">save coords "query"</span> - 导出选择原子坐标 PDB</p>
                  <p><span className="text-cyan-300">$sel get index</span> - 输出选择中的原子 index</p>
                  <p><span className="text-cyan-300">$sel get resname</span> - 输出选择中的残基名</p>
                  <p><span className="text-cyan-300">clear</span> - 清空终端输出</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 p-8">
          <div className="mx-auto max-w-7xl space-y-6">
            <div className="glass-panel rounded-3xl p-8">
              <h1 className="text-3xl font-bold text-white">VMD 命令行</h1>
              <p className="mt-3 text-slate-200">
                参考 VMD/Tk Console 常用命令：pwd、cd、mol new、rotate、atomselect、measure center、mol delete。
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
              <div className="ui-card space-y-4">
                <div>
                  <label className="mb-2 block text-sm text-slate-200">上传 PDB 文件（可多选）</label>
                  <input type="file" accept=".pdb" multiple onChange={handleUpload} className="ui-input w-full" />
                </div>

                <button
                  type="button"
                  className="btn-secondary w-full"
                  onClick={() => setShowCommandHelp(true)}
                >
                  查看全部命令与用法
                </button>

                <div className="ui-card text-xs text-slate-300">
                  <p>当前工作路径：{cwd}</p>
                  <p className="mt-2">已上传文件：</p>
                  <div className="mt-1 max-h-24 overflow-auto text-slate-200">
                    {files.length === 0 ? '（无）' : files.map((f) => <div key={f.name}>{f.name}</div>)}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/40 p-3">
                  <div className="mb-2 text-xs text-slate-400">命令终端</div>
                  <div className="h-64 overflow-auto rounded-lg border border-white/10 bg-black/50 p-3 font-mono text-xs text-green-200">
                    {logs.map((l, i) => (
                      <div key={`${l}-${i}`} className="whitespace-pre-wrap">{l}</div>
                    ))}
                  </div>

                  <div className="mt-2 flex gap-2">
                    <input
                      className="ui-input flex-1 font-mono text-xs"
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          runCommand(command);
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          if (history.length === 0) return;
                          const next = historyIndex < 0 ? history.length - 1 : Math.max(0, historyIndex - 1);
                          setHistoryIndex(next);
                          setCommand(history[next]);
                        } else if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          if (history.length === 0) return;
                          if (historyIndex < 0) return;
                          const next = historyIndex + 1;
                          if (next >= history.length) {
                            setHistoryIndex(-1);
                            setCommand('');
                          } else {
                            setHistoryIndex(next);
                            setCommand(history[next]);
                          }
                        }
                      }}
                      placeholder='例如: set sel [atomselect top "protein"]'
                    />
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => runCommand(command)}
                    >
                      执行
                    </button>
                  </div>
                </div>

                <div className="ui-card text-xs text-slate-300">
                  <p className="font-semibold text-slate-100">脚本批量执行（多行）</p>
                  <textarea
                    className="ui-input mt-2 h-28 w-full resize-y font-mono text-xs"
                    value={scriptText}
                    onChange={(e) => setScriptText(e.target.value)}
                    placeholder={'# 每行一条命令\nmol new 1OWY.pdb\nrotate y by 180\nset sel [atomselect top "protein"]\nmeasure center $sel weight mass'}
                  />
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="btn-secondary" onClick={runScript}>执行脚本</button>
                    <button type="button" className="btn-secondary" onClick={() => setScriptText('')}>清空脚本</button>
                  </div>
                </div>

                <div className="ui-card text-xs text-slate-300">
                  <p className="font-semibold text-slate-100">快速示例（新增 VMD 入门功能）</p>
                  <p className="mt-1">mol new 1OWY.pdb</p>
                  <p>display axes off</p>
                  <p>color display background white</p>
                  <p>measure bond 1 2</p>
                  <p>measure angle 1 2 3</p>
                  <p>measure dihedral 1 2 3 4</p>
                  <p>save coords "resname HEM"</p>
                  <p>save state</p>
                  <p className="mt-2 text-slate-400">提示：终端支持 ↑ / ↓ 浏览历史命令。</p>
                </div>
              </div>

              <div className="ui-card">
                <div className="relative h-[700px] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70">
                  <div ref={containerRef} className="h-full w-full" />
                </div>
                <div className="mt-3 text-sm text-slate-300 space-y-1">
                  <div>Top 分子：{currentMol ? `${currentMol.name} (id=${currentMol.id})` : '无'}</div>
                  <div>背景：{background} | 渲染模式：{renderMode} | 坐标轴：{showAxes ? 'on' : 'off'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
