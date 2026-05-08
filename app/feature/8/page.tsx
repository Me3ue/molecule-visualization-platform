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

type Molecule = { id: number; name: string; content: string; atoms: Atom[] };
type Selection = { name: string; molId: number; query: string; atoms: Atom[] };

type DisplayState = {
  projection: 'orthographic' | 'perspective';
  background: string;
  axes: boolean;
  stage: boolean;
};

type GraphicsItem =
  | { id: number; type: 'sphere'; molId: number; center: [number, number, number]; radius: number; color: string }
  | { id: number; type: 'line'; molId: number; from: [number, number, number]; to: [number, number, number]; width: number; color: string };

type LabelItem = { id: number; molId: number; atomIndex: number; text: string };

const DEFAULT_PDB_URL = '/demo/5P21.pdb';

const massTable: Record<string, number> = { H: 1.008, C: 12.011, N: 14.007, O: 15.999, P: 30.974, S: 32.06, F: 18.998, CL: 35.45, BR: 79.904, I: 126.9 };

function parsePdbAtoms(content: string): Atom[] {
  return content.split(/\r?\n/).flatMap((line, idx) => {
    if (!(line.startsWith('ATOM') || line.startsWith('HETATM'))) return [];
    const index = Number(line.slice(6, 11).trim()) || idx + 1;
    const name = line.slice(12, 16).trim();
    const resname = line.slice(17, 20).trim();
    const chain = line.slice(21, 22).trim();
    const resid = Number(line.slice(22, 26).trim()) || 0;
    const x = Number(line.slice(30, 38).trim());
    const y = Number(line.slice(38, 46).trim());
    const z = Number(line.slice(46, 54).trim());
    const rawElem = line.slice(76, 78).trim() || name.replace(/[^A-Za-z]/g, '').slice(0, 2);
    const elem = rawElem.toUpperCase();
    return [x, y, z].every(Number.isFinite) ? [{ index, name, resname, resid, chain, elem, x, y, z }] : [];
  });
}

function parseXyzAtoms(content: string): Atom[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const start = Number.isFinite(Number(lines[0])) ? 2 : 0;
  return lines.slice(start).flatMap((line, idx) => {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) return [];
    const elem = parts[0].toUpperCase();
    const x = Number(parts[1]);
    const y = Number(parts[2]);
    const z = Number(parts[3]);
    if (![x, y, z].every(Number.isFinite)) return [];
    return [{ index: idx + 1, name: elem, resname: 'UNK', resid: 1, chain: '', elem, x, y, z }];
  });
}

function parseMol2Atoms(content: string): Atom[] {
  const lines = content.split(/\r?\n/);
  const startIdx = lines.findIndex((l) => l.trim().toUpperCase() === '@<TRIPOS>ATOM');
  if (startIdx < 0) return [];
  const atoms: Atom[] = [];
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line || line.startsWith('@<TRIPOS>')) break;
    const parts = line.split(/\s+/);
    if (parts.length < 6) continue;
    const index = Number(parts[0]);
    const name = parts[1];
    const x = Number(parts[2]);
    const y = Number(parts[3]);
    const z = Number(parts[4]);
    const elem = (parts[5]?.split('.')[0] ?? name).replace(/[^A-Za-z]/g, '').toUpperCase();
    if (![x, y, z].every(Number.isFinite)) continue;
    atoms.push({ index, name, resname: 'MOL', resid: 1, chain: '', elem, x, y, z });
  }
  return atoms;
}

function atomSelect(atoms: Atom[], query: string): Atom[] {
  const q = query.trim().toLowerCase();
  if (q === 'all') return atoms;
  if (q === 'protein') return atoms.filter((a) => a.resname !== 'HOH' && a.resname !== 'WAT');

  const orParts = q.split(/\s+or\s+/i).map((p) => p.trim()).filter(Boolean);
  const matchesPart = (a: Atom, part: string): boolean => {
    const trimmed = part.trim();
    const negated = trimmed.startsWith('not ');
    const core = negated ? trimmed.slice(4).trim() : trimmed;

    let result = false;
    if (core.startsWith('resname ')) result = a.resname.toUpperCase() === core.replace('resname ', '').toUpperCase();
    else if (core.startsWith('resid ')) {
      const rest = core.replace('resid ', '').trim();
      const rangeMatch = rest.match(/^(\d+)\s+to\s+(\d+)$/i);
      if (rangeMatch) {
        const start = Number(rangeMatch[1]);
        const end = Number(rangeMatch[2]);
        result = a.resid >= Math.min(start, end) && a.resid <= Math.max(start, end);
      } else {
        const values = rest.split(/\s+/).map(Number).filter(Number.isFinite);
        result = values.includes(a.resid);
      }
    } else if (core.startsWith('index ')) {
      const rest = core.replace('index ', '').trim();
      const rangeMatch = rest.match(/^(\d+)\s+to\s+(\d+)$/i);
      if (rangeMatch) {
        const start = Number(rangeMatch[1]);
        const end = Number(rangeMatch[2]);
        result = a.index >= Math.min(start, end) && a.index <= Math.max(start, end);
      } else {
        const values = rest.split(/\s+/).map(Number).filter(Number.isFinite);
        result = values.includes(a.index);
      }
    } else if (core.startsWith('name ')) result = a.name.toUpperCase() === core.replace('name ', '').toUpperCase();
    else if (core.startsWith('chain ')) result = a.chain.toUpperCase() === core.replace('chain ', '').toUpperCase();
    else if (core.startsWith('elem ') || core.startsWith('element ')) {
      const elem = core.replace('element ', '').replace('elem ', '').trim().toUpperCase();
      result = a.elem.toUpperCase() === elem;
    }

    return negated ? !result : result;
  };

  return atoms.filter((a) => orParts.some((orPart) => {
    const andParts = orPart.split(/\s+and\s+/i).map((p) => p.trim()).filter(Boolean);
    return andParts.every((part) => matchesPart(a, part));
  }));
}

function centerOfAtoms(atoms: Atom[], weightedMass: boolean): [number, number, number] {
  if (!atoms.length) return [0, 0, 0];
  let sx = 0; let sy = 0; let sz = 0; let sw = 0;
  atoms.forEach((a) => { const w = weightedMass ? (massTable[a.elem] ?? 12) : 1; sx += a.x * w; sy += a.y * w; sz += a.z * w; sw += w; });
  return [sx / sw, sy / sw, sz / sw];
}

function distance(a: Atom, b: Atom): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function angleDeg(a: Atom, b: Atom, c: Atom): number {
  const v1 = [a.x - b.x, a.y - b.y, a.z - b.z];
  const v2 = [c.x - b.x, c.y - b.y, c.z - b.z];
  const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  const mag1 = Math.hypot(v1[0], v1[1], v1[2]);
  const mag2 = Math.hypot(v2[0], v2[1], v2[2]);
  if (mag1 === 0 || mag2 === 0) return 0;
  const cos = Math.min(1, Math.max(-1, dot / (mag1 * mag2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function dihedralDeg(a: Atom, b: Atom, c: Atom, d: Atom): number {
  const b1 = [b.x - a.x, b.y - a.y, b.z - a.z];
  const b2 = [c.x - b.x, c.y - b.y, c.z - b.z];
  const b3 = [d.x - c.x, d.y - c.y, d.z - c.z];
  const n1 = [
    b1[1] * b2[2] - b1[2] * b2[1],
    b1[2] * b2[0] - b1[0] * b2[2],
    b1[0] * b2[1] - b1[1] * b2[0],
  ];
  const n2 = [
    b2[1] * b3[2] - b2[2] * b3[1],
    b2[2] * b3[0] - b2[0] * b3[2],
    b2[0] * b3[1] - b2[1] * b3[0],
  ];
  const n1mag = Math.hypot(n1[0], n1[1], n1[2]);
  const n2mag = Math.hypot(n2[0], n2[1], n2[2]);
  if (n1mag === 0 || n2mag === 0) return 0;
  const n1n = [n1[0] / n1mag, n1[1] / n1mag, n1[2] / n1mag];
  const n2n = [n2[0] / n2mag, n2[1] / n2mag, n2[2] / n2mag];
  const m1 = [
    n1n[1] * (b2[2]) - n1n[2] * (b2[1]),
    n1n[2] * (b2[0]) - n1n[0] * (b2[2]),
    n1n[0] * (b2[1]) - n1n[1] * (b2[0]),
  ];
  const x = n1n[0] * n2n[0] + n1n[1] * n2n[1] + n1n[2] * n2n[2];
  const y = m1[0] * n2n[0] + m1[1] * n2n[1] + m1[2] * n2n[2];
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export default function Feature8VmdCommandPage() {
  const viewerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [files, setFiles] = useState<{ name: string; content: string }[]>([]);
  const [cwd, setCwd] = useState('D:/workspace');
  const [command, setCommand] = useState('');
  const [is3DmolReady, setIs3DmolReady] = useState(false);
  const [logs, setLogs] = useState<string[]>(['VMD Web Console 已启动。输入 help 查看可用命令。']);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [scriptText, setScriptText] = useState('');
  const [molecules, setMolecules] = useState<Molecule[]>([]);
  const [currentMolId, setCurrentMolId] = useState<number | null>(null);
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [showCommandHelp, setShowCommandHelp] = useState(false);
  const [displayState, setDisplayState] = useState<DisplayState>({ projection: 'perspective', background: '#090f1f', axes: false, stage: true });
  const [lightOn, setLightOn] = useState(true);
  const [graphics, setGraphics] = useState<GraphicsItem[]>([]);
  const [labels, setLabels] = useState<LabelItem[]>([]);
  const moleculesRef = useRef<Molecule[]>([]);
  const selectionsRef = useRef<Record<string, Selection>>({});
  const currentMolIdRef = useRef<number | null>(null);
  const [currentColor, setCurrentColor] = useState('white');
  const [axesLocation, setAxesLocation] = useState('origin');
  const selectionCounter = useRef(1);
  const graphicsCounter = useRef(1);
  const labelCounter = useRef(1);

  const currentMol = useMemo(() => molecules.find((m) => m.id === currentMolId) ?? null, [molecules, currentMolId]);
  const log = (line: string) => setLogs((prev) => [...prev, line]);

  const ensureViewer = () => {
    if (!containerRef.current || !window.$3Dmol) return null;
    if (!viewerRef.current) viewerRef.current = window.$3Dmol.createViewer(containerRef.current, { backgroundColor: displayState.background, antialias: true, width: '100%', height: '100%' });
    return viewerRef.current;
  };

  const ensureViewerReady = () => {
    const viewer = ensureViewer();
    if (!viewer) {
      log('3Dmol 脚本尚未加载完成，请稍候再试。');
      return null;
    }
    if (!is3DmolReady) log('提示: 3Dmol 正在初始化，部分显示指令可能稍后才生效。');
    return viewer;
  };

  const applyDisplayState = (viewer: any) => {
    viewer.setBackgroundColor(displayState.background);
    if (displayState.projection === 'orthographic') viewer.setProjection('orthographic');
    else viewer.setProjection('perspective');
  };

  const renderGraphics = (viewer: any) => {
    graphics.forEach((g) => {
      if (g.type === 'sphere') viewer.addSphere({ center: { x: g.center[0], y: g.center[1], z: g.center[2] }, radius: g.radius, color: g.color, opacity: 1 });
      if (g.type === 'line') viewer.addLine({ start: { x: g.from[0], y: g.from[1], z: g.from[2] }, end: { x: g.to[0], y: g.to[1], z: g.to[2] }, color: g.color, lineWidth: g.width });
    });
  };

  const renderLabels = (viewer: any, mol: Molecule | null) => {
    if (!mol) return;
    labels.filter((l) => l.molId === mol.id).forEach((l) => {
      const atom = mol.atoms.find((a) => a.index === l.atomIndex);
      if (!atom) return;
      viewer.addLabel(l.text, { position: { x: atom.x, y: atom.y, z: atom.z }, fontSize: 12, fontColor: '#ffffff', backgroundColor: '#111827', backgroundOpacity: 0.6 });
    });
  };

  const renderMolecule = (mol: Molecule | null) => {
    const viewer = ensureViewerReady();
    if (!viewer) return;
    viewer.clear();
    applyDisplayState(viewer);
    if (!mol) {
      if (displayState.axes && typeof viewer.addAxes === 'function') {
        viewer.addAxes({
          origin: axesLocation === 'origin' ? { x: 0, y: 0, z: 0 } : undefined,
          position: axesLocation !== 'origin' ? axesLocation : undefined,
        });
      }
      if (displayState.stage) viewer.addBox({ center: { x: 0, y: 0, z: 0 }, dimensions: { w: 100, h: 100, d: 100 }, color: '#334155', opacity: 0.12 });
      renderGraphics(viewer);
      viewer.render();
      return;
    }
    viewer.addModel(mol.content, mol.content.startsWith('ATOM') || mol.content.startsWith('HETATM') ? 'pdb' : 'mol');
    viewer.setStyle({}, {
      cartoon: { color: lightOn ? 'spectrum' : '#f8fafc', opacity: lightOn ? 1 : 1, shiny: lightOn ? 30 : 0 },
      stick: { radius: 0.2, color: lightOn ? 'spectrum' : '#f8fafc', opacity: lightOn ? 1 : 1, shiny: lightOn ? 30 : 0 },
    });
    if (displayState.axes && typeof viewer.addAxes === 'function') {
      viewer.addAxes({
        origin: axesLocation === 'origin' ? { x: 0, y: 0, z: 0 } : undefined,
        position: axesLocation !== 'origin' ? axesLocation : undefined,
      });
    }
    if (displayState.stage) viewer.addBox({ center: { x: 0, y: 0, z: 0 }, dimensions: { w: 100, h: 100, d: 100 }, color: '#334155', opacity: 0.12 });
    renderGraphics(viewer);
    renderLabels(viewer, mol);
    viewer.zoomTo();
    viewer.zoom(9.0);
    viewer.render();
  };

  const execute = (raw: string) => {
    const cmd = raw.trim();
    if (!cmd) return;
    log(`> ${cmd}`);

    if (cmd === 'help') {
      log('help, clear, pwd, cd <path>');
      log('mol, mol new <file>, mol addfile <file> [type pdb|xyz|mol2], mol delete all|<id>, mol list, molinfo <id> get name|numatoms, mol top <id>, mol rename <id> <name>');
      log('animate read <file> [type pdb|xyz|mol2], animate style loop|once|rock, animate goto <frame>, animate dup');
      log('display projection orthographic|perspective, display background <color>, display resize <w> <h>');
      log('axes location origin|off, stage location origin|off, light 0 on|off');
      log('color change rgb <name> <r> <g> <b>, color scale <name>');
      log('draw color <name>, draw sphere {x y z} radius <r>, draw line {x y z} {x y z} width <w>');
      log('graphics delete <id>|all');
      log('label add Atoms <index>, label delete <id>');
      log('set var [ atomselect top "query" ], $var get index|resname|name|resid|chain|x|y|z');
      log('measure center|distance|angle|dihedral|minmax|rmsd|bond|contacts|sasa');
      log('rotate <x|y|z> by <deg>, render <format> <file>');
      return;
    }
    if (cmd === 'clear') return setLogs([]);
    if (cmd === 'pwd') return log(cwd);
    if (cmd === 'cd') return log('用法: cd <path>');
    if (cmd.startsWith('cd ')) { const target = cmd.slice(3).trim(); setCwd(target); return log(`工作路径已切换到: ${target}`); }
    if (cmd === 'list mols' || cmd === 'mol list') {
      const list = moleculesRef.current;
      const topId = currentMolIdRef.current;
      return list.length ? list.forEach((m) => log(`mol ${m.id}: ${m.name}${m.id === topId ? ' (top)' : ''}`)) : log('当前无分子。');
    }

    if (cmd === 'mol') return log('可用子命令: mol new <file>, mol addfile <file> [type pdb|xyz|mol2], mol delete all|<id>, mol list, molinfo');
    if (cmd === 'mol new') {
      if (!files.length) return log('请先上传文件，再执行: mol new <filename>');
      return log(`用法: mol new <filename>。已上传文件: ${files.map((f) => f.name).join(', ')}`);
    }
    if (cmd === 'mol delete') return log('用法: mol delete all | mol delete <id>');
    if (/^measure\s*$/i.test(cmd)) {
      log('measure 可用子命令: center distance angle dihedral minmax rmsd bond contacts sasa');
      log('示例: measure distance $sel1 $sel2');
      return log('示例: measure center $sel weight mass');
    }
    if (/^measure\s+center\s*$/i.test(cmd)) {
      log('用法: measure center $sel [weight mass]');
      log('说明: 不加 weight mass 为几何中心；加上后为质心。');
      return log('示例: measure center $ligPRY weight mass');
    }
    if (/^measure\s+distance\s*$/i.test(cmd)) return log('用法: measure distance $sel1 $sel2');
    if (/^measure\s+angle\s*$/i.test(cmd)) return log('用法: measure angle $sel1 $sel2 $sel3');
    if (/^measure\s+dihedral\s*$/i.test(cmd)) return log('用法: measure dihedral $sel1 $sel2 $sel3 $sel4');
    if (/^measure\s+minmax\s*$/i.test(cmd)) return log('用法: measure minmax $sel');
    if (/^measure\s+rmsd\s*$/i.test(cmd)) return log('用法: measure rmsd $sel1 $sel2');
    if (/^measure\s+bond\s*$/i.test(cmd)) return log('用法: measure bond $sel1 $sel2');
    if (/^measure\s+contacts\s*$/i.test(cmd)) return log('用法: measure contacts <cutoff> $sel1 $sel2');
    if (/^measure\s+sasa\s*$/i.test(cmd)) return log('用法: measure sasa <probe> $sel');
    if (cmd === 'atomselect') return log('用法: set sel [atomselect top "query"]，示例: set sel [ atomselect top "resid 110 and name CA" ]');

    if (cmd.startsWith('mol new ')) {
      const rest = cmd.slice('mol new '.length).trim();
      const fileName = rest.replace(/^['"]|['"]$/g, '');
      const found = files.find((f) => f.name.toLowerCase() === fileName.toLowerCase());
      if (!found) return log(`未找到文件: ${fileName}。请先上传文件。`);
      const lower = fileName.toLowerCase();
      const atoms = lower.endsWith('.xyz') ? parseXyzAtoms(found.content)
        : lower.endsWith('.mol2') ? parseMol2Atoms(found.content)
          : parsePdbAtoms(found.content);
      const nextId = moleculesRef.current.length ? Math.max(...moleculesRef.current.map((m) => m.id)) + 1 : 0;
      const mol = { id: nextId, name: found.name, content: found.content, atoms };
      setMolecules((prev) => {
        const next = [...prev, mol];
        moleculesRef.current = next;
        return next;
      });
      setCurrentMolId(nextId);
      renderMolecule(mol);
      return log(String(nextId));
    }

    if (cmd.startsWith('mol addfile ')) {
      const topMolId = currentMolIdRef.current;
      if (topMolId === null) return log('当前没有 top 分子，请先 mol new。');
      const rest = cmd.slice('mol addfile '.length).trim();
      const parts = rest.split(/\s+/);
      const fileName = parts[0]?.replace(/^['"]|['"]$/g, '');
      const typeIndex = parts.findIndex((p) => p.toLowerCase() === 'type');
      const fileType = typeIndex >= 0 ? parts[typeIndex + 1]?.toLowerCase() : undefined;
      if (!fileName) return log('用法: mol addfile <file> [type pdb|xyz|mol2]');
      const found = files.find((f) => f.name.toLowerCase() === fileName.toLowerCase());
      if (!found) return log(`未找到文件: ${fileName}`);
      const lower = fileName.toLowerCase();
      const atoms = fileType === 'xyz' || lower.endsWith('.xyz') ? parseXyzAtoms(found.content)
        : fileType === 'mol2' || lower.endsWith('.mol2') ? parseMol2Atoms(found.content)
          : parsePdbAtoms(found.content);
      const current = moleculesRef.current.find((m) => m.id === topMolId);
      if (!current) return log(`未找到 mol ${topMolId}`);
      const updated = { ...current, atoms: [...current.atoms, ...atoms] };
      setMolecules((prev) => {
        const next = prev.map((m) => (m.id === updated.id ? updated : m));
        moleculesRef.current = next;
        return next;
      });
      renderMolecule(updated);
      return log(`已追加 ${atoms.length} 个原子到 mol ${updated.id}`);
    }

    if (cmd.startsWith('mol top ')) {
      const id = Number(cmd.slice('mol top '.length).trim());
      if (!Number.isFinite(id)) return log('用法: mol top <id>');
      const mol = moleculesRef.current.find((m) => m.id === id);
      if (!mol) return log(`未找到 mol ${id}`);
      setCurrentMolId(id);
      currentMolIdRef.current = id;
      renderMolecule(mol);
      return log(`mol top ${id}`);
    }

    if (cmd.startsWith('mol rename ')) {
      const rest = cmd.slice('mol rename '.length).trim();
      const parts = rest.split(/\s+/);
      const id = Number(parts[0]);
      const name = rest.slice(parts[0]?.length ?? 0).trim();
      if (!Number.isFinite(id) || !name) return log('用法: mol rename <id> <name>');
      setMolecules((prev) => {
        const next = prev.map((m) => (m.id === id ? { ...m, name } : m));
        moleculesRef.current = next;
        return next;
      });
      return log(`mol rename ${id} ${name}`);
    }

    if (cmd.startsWith('animate read ')) {
      if (!currentMol) return log('当前没有 top 分子，请先 mol new。');
      const rest = cmd.slice('animate read '.length).trim();
      const parts = rest.split(/\s+/);
      const fileName = parts[0]?.replace(/^['"]|['"]$/g, '');
      const typeIndex = parts.findIndex((p) => p.toLowerCase() === 'type');
      const fileType = typeIndex >= 0 ? parts[typeIndex + 1]?.toLowerCase() : undefined;
      if (!fileName) return log('用法: animate read <file> [type pdb|xyz|mol2]');
      const found = files.find((f) => f.name.toLowerCase() === fileName.toLowerCase());
      if (!found) return log(`未找到文件: ${fileName}`);
      const lower = fileName.toLowerCase();
      const atoms = fileType === 'xyz' || lower.endsWith('.xyz') ? parseXyzAtoms(found.content)
        : fileType === 'mol2' || lower.endsWith('.mol2') ? parseMol2Atoms(found.content)
          : parsePdbAtoms(found.content);
      log(`已读取 ${atoms.length} 个原子作为新帧（演示模式，不保存帧）。`);
      return;
    }

    if (cmd.startsWith('animate style ')) {
      const style = cmd.slice('animate style '.length).trim().toLowerCase();
      if (!['loop', 'once', 'rock'].includes(style)) return log('用法: animate style loop|once|rock');
      return log(`animate style ${style}`);
    }

    if (cmd.startsWith('animate goto ')) {
      const frame = Number(cmd.slice('animate goto '.length).trim());
      if (!Number.isFinite(frame)) return log('用法: animate goto <frame>');
      return log(`animate goto ${frame}（演示模式）`);
    }

    if (cmd === 'animate dup') {
      if (!currentMol) return log('当前没有 top 分子，请先 mol new。');
      const nextId = molecules.length ? Math.max(...molecules.map((m) => m.id)) + 1 : 0;
      const mol = { ...currentMol, id: nextId, name: `${currentMol.name}_dup` };
      setMolecules((prev) => [...prev, mol]);
      setCurrentMolId(nextId);
      renderMolecule(mol);
      return log(String(nextId));
    }

    if (cmd.startsWith('display projection ')) {
      const mode = cmd.slice('display projection '.length).trim().toLowerCase();
      if (mode !== 'orthographic' && mode !== 'perspective') return log('用法: display projection orthographic|perspective');
      setDisplayState((prev) => ({ ...prev, projection: mode as DisplayState['projection'] }));
      const viewer = ensureViewerReady();
      if (viewer) {
        if (mode === 'orthographic') viewer.setProjection('orthographic');
        else viewer.setProjection('perspective');
        viewer.render();
      }
      return log(`display projection ${mode}`);
    }

    if (cmd.startsWith('display background ')) {
      const color = cmd.slice('display background '.length).trim();
      if (!color) return log('用法: display background <color>');
      setDisplayState((prev) => ({ ...prev, background: color }));
      const viewer = ensureViewerReady();
      if (viewer) {
        viewer.setBackgroundColor(color);
        viewer.render();
      }
      return log(`display background ${color}`);
    }

    if (cmd.startsWith('display resize ')) {
      const parts = cmd.slice('display resize '.length).trim().split(/\s+/).map(Number);
      if (parts.length < 2 || !parts.every((v) => Number.isFinite(v) && v > 0)) return log('用法: display resize <width> <height>');
      if (!containerRef.current) return log('视图尚未初始化。');
      containerRef.current.style.width = `${parts[0]}px`;
      containerRef.current.style.height = `${parts[1]}px`;
      const viewer = ensureViewerReady();
      if (viewer) viewer.resize();
      return log(`display resize ${parts[0]} ${parts[1]}`);
    }

    if (cmd.startsWith('axes location ')) {
      const location = cmd.slice('axes location '.length).trim().toLowerCase();
      if (!['origin', 'off'].includes(location)) return log('用法: axes location origin|off');
      setDisplayState((prev) => ({ ...prev, axes: location === 'origin' }));
      setAxesLocation(location);
      const viewer = ensureViewerReady();
      if (viewer && location === 'off') {
        if (typeof viewer.removeAllShapes === 'function') viewer.removeAllShapes();
        renderMolecule(currentMol);
      } else {
        renderMolecule(currentMol);
      }
      return log(`axes location ${location}`);
    }

    if (cmd.startsWith('stage location ')) {
      const location = cmd.slice('stage location '.length).trim().toLowerCase();
      if (!['origin', 'off'].includes(location)) return log('用法: stage location origin|off');
      setDisplayState((prev) => ({ ...prev, stage: location === 'origin' }));
      const viewer = ensureViewerReady();
      if (viewer && location === 'off') {
        if (typeof viewer.removeAllShapes === 'function') viewer.removeAllShapes();
        renderMolecule(currentMol);
      } else {
        renderMolecule(currentMol);
      }
      return log(`stage location ${location}`);
    }

    if (cmd.startsWith('light 0 ')) {
      const value = cmd.slice('light 0 '.length).trim().toLowerCase();
      if (!['on', 'off'].includes(value)) return log('用法: light 0 on|off');
      setLightOn(value === 'on');
      renderMolecule(currentMol);
      return log(`light 0 ${value}`);
    }

    if (cmd.startsWith('color change rgb ')) {
      const parts = cmd.slice('color change rgb '.length).trim().split(/\s+/);
      if (parts.length < 4) return log('用法: color change rgb <name> <r> <g> <b>');
      const [name, r, g, b] = parts;
      const rgb = [Number(r), Number(g), Number(b)];
      if (!rgb.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) return log('rgb 范围应为 0-1');
      setCurrentColor(name);
      return log(`color change rgb ${name} ${r} ${g} ${b}`);
    }

    if (cmd.startsWith('color scale ')) {
      const scaleName = cmd.slice('color scale '.length).trim();
      if (!scaleName) return log('用法: color scale <name>');
      return log(`color scale ${scaleName}`);
    }

    if (cmd.startsWith('material change ')) {
      const parts = cmd.slice('material change '.length).trim().split(/\s+/);
      if (parts.length < 3) return log('用法: material change <name> shininess|opacity <value>');
      const [name, key, valueRaw] = parts;
      const value = Number(valueRaw);
      if (!Number.isFinite(value)) return log('material change 值应为数字');
      return log(`material change ${name} ${key} ${valueRaw}`);
    }

    if (cmd.startsWith('draw color ')) {
      const color = cmd.slice('draw color '.length).trim();
      if (!color) return log('用法: draw color <name>');
      setCurrentColor(color);
      return log(`draw color ${color}`);
    }

    if (cmd.startsWith('draw sphere ')) {
      const match = cmd.match(/^draw\s+sphere\s+\{([^}]+)\}\s+radius\s+(-?\d+(?:\.\d+)?)$/i);
      if (!match) return log('用法: draw sphere {x y z} radius <r>');
      const coords = match[1].trim().split(/\s+/).map(Number);
      if (coords.length !== 3 || !coords.every(Number.isFinite)) return log('坐标格式错误');
      const radius = Number(match[2]);
      const adjustedRadius = currentMol ? radius * 0.3 : radius;
      let center: [number, number, number] = [coords[0], coords[1], coords[2]];
      if (currentMol && coords.every((v) => v === 0)) {
        center = centerOfAtoms(currentMol.atoms, false);
        log('提示: 坐标为 0 0 0，已按分子中心绘制。');
      }
      const item: GraphicsItem = { id: graphicsCounter.current++, type: 'sphere', molId: currentMol?.id ?? -1, center, radius: adjustedRadius, color: currentColor };
      setGraphics((prev) => [...prev, item]);
      renderMolecule(currentMol);
      return log(`graphics ${item.id}`);
    }

    if (cmd.startsWith('draw line ')) {
      const match = cmd.match(/^draw\s+line\s+\{([^}]+)\}\s+\{([^}]+)\}\s+width\s+(-?\d+(?:\.\d+)?)$/i);
      if (!match) return log('用法: draw line {x y z} {x y z} width <w>');
      const c1 = match[1].trim().split(/\s+/).map(Number);
      const c2 = match[2].trim().split(/\s+/).map(Number);
      if (c1.length !== 3 || c2.length !== 3 || ![...c1, ...c2].every(Number.isFinite)) return log('坐标格式错误');
      const width = Number(match[3]);
      const item: GraphicsItem = { id: graphicsCounter.current++, type: 'line', molId: currentMol?.id ?? -1, from: [c1[0], c1[1], c1[2]], to: [c2[0], c2[1], c2[2]], width, color: currentColor };
      setGraphics((prev) => [...prev, item]);
      renderMolecule(currentMol);
      return log(`graphics ${item.id}`);
    }

    if (cmd.startsWith('graphics delete ')) {
      const target = cmd.slice('graphics delete '.length).trim().toLowerCase();
      if (!target) return log('用法: graphics delete <id>|all');
      if (target === 'all') {
        setGraphics([]);
        renderMolecule(currentMol);
        return log('graphics all deleted');
      }
      const id = Number(target);
      if (!Number.isFinite(id)) return log('用法: graphics delete <id>|all');
      setGraphics((prev) => prev.filter((g) => g.id !== id));
      renderMolecule(currentMol);
      return log(`graphics ${id} deleted`);
    }

    if (cmd.startsWith('label add Atoms ')) {
      if (!currentMol) return log('当前没有 top 分子，请先 mol new。');
      const atomIndex = Number(cmd.slice('label add Atoms '.length).trim());
      if (!Number.isFinite(atomIndex)) return log('用法: label add Atoms <index>');
      const atom = currentMol.atoms.find((a) => a.index === atomIndex);
      if (!atom) return log(`未找到原子 ${atomIndex}`);
      const labelId = labelCounter.current++;
      const text = `${atom.resname}${atom.resid}:${atom.name}`;
      setLabels((prev) => [...prev, { id: labelId, molId: currentMol.id, atomIndex, text }]);
      renderMolecule(currentMol);
      return log(`label ${labelId}`);
    }

    if (cmd.startsWith('label delete ')) {
      const labelId = Number(cmd.slice('label delete '.length).trim());
      if (!Number.isFinite(labelId)) return log('用法: label delete <id>');
      setLabels((prev) => prev.filter((l) => l.id !== labelId));
      renderMolecule(currentMol);
      return log(`label ${labelId} deleted`);
    }

    if (cmd.startsWith('molinfo ')) {
      const rest = cmd.slice('molinfo '.length).trim();
      const parts = rest.split(/\s+/);
      const id = Number(parts[0]);
      const key = parts[2];
      if (!Number.isFinite(id) || parts[1] !== 'get' || !key) return log('用法: molinfo <id> get name|numatoms');
      const mol = moleculesRef.current.find((m) => m.id === id);
      if (!mol) return log(`未找到 mol ${id}`);
      if (key === 'name') return log(mol.name);
      if (key === 'numatoms') return log(String(mol.atoms.length));
      return log('molinfo 仅支持 name/numatoms');
    }

    if (cmd.startsWith('render ')) {
      const rest = cmd.slice('render '.length).trim();
      const parts = rest.split(/\s+/);
      if (parts.length < 2) return log('用法: render <format> <file>');
      const [format, fileName] = parts;
      const viewer = ensureViewerReady();
      if (!viewer) return log('视图尚未初始化。');
      if (format.toLowerCase() !== 'png') return log('目前仅支持 render png <file>');
      if (typeof viewer.pngURI !== 'function') return log('当前渲染器不支持导出 PNG。');
      const uri = viewer.pngURI();
      const link = document.createElement('a');
      link.href = uri;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      return log(`render png ${fileName}（已触发下载）`);
    }

    if (cmd.startsWith('set ')) {
      const setSelMatch = cmd.match(/^set\s+(\w+)\s+\[\s*atomselect\s+top\s+"(.+)"\s*\]$/i);
      if (setSelMatch) {
        const topMolId = currentMolIdRef.current;
        if (topMolId === null) return log('当前没有 top 分子，请先 mol new。');
        const mol = moleculesRef.current.find((m) => m.id === topMolId);
        if (!mol) return log('当前没有 top 分子，请先 mol new。');
        const varName = setSelMatch[1];
        const query = setSelMatch[2];
        const atoms = atomSelect(mol.atoms, query);
        const selName = `atomselect${selectionCounter.current++}`;
        setSelections((prev) => {
          const next = { ...prev, [varName]: { name: selName, molId: mol.id, query, atoms } };
          selectionsRef.current = next;
          return next;
        });
        return log(selName);
      }
      return log('仅支持 set var [ atomselect top "query" ]');
    }

    const measureMatch = cmd.match(/^measure\s+center\s+\$(\w+)(?:\s+weight\s+mass)?$/i);
    if (measureMatch) {
      const sel = selectionsRef.current[measureMatch[1]];
      if (!sel) return log(`未找到选择变量 $${measureMatch[1]}`);
      const c = centerOfAtoms(sel.atoms, /weight\s+mass/i.test(cmd));
      return log(`${c[0]} ${c[1]} ${c[2]}`);
    }

    const distMatch = cmd.match(/^measure\s+distance\s+\$(\w+)\s+\$(\w+)$/i);
    if (distMatch) {
      const sel1 = selectionsRef.current[distMatch[1]];
      const sel2 = selectionsRef.current[distMatch[2]];
      if (!sel1 || !sel2) return log('未找到选择变量');
      if (!sel1.atoms[0] || !sel2.atoms[0]) return log('选择为空');
      return log(String(distance(sel1.atoms[0], sel2.atoms[0])));
    }

    const angleMatch = cmd.match(/^measure\s+angle\s+\$(\w+)\s+\$(\w+)\s+\$(\w+)$/i);
    if (angleMatch) {
      const s1 = selectionsRef.current[angleMatch[1]];
      const s2 = selectionsRef.current[angleMatch[2]];
      const s3 = selectionsRef.current[angleMatch[3]];
      if (!s1 || !s2 || !s3) return log('未找到选择变量');
      if (!s1.atoms[0] || !s2.atoms[0] || !s3.atoms[0]) return log('选择为空');
      return log(String(angleDeg(s1.atoms[0], s2.atoms[0], s3.atoms[0])));
    }

    const dihedralMatch = cmd.match(/^measure\s+dihedral\s+\$(\w+)\s+\$(\w+)\s+\$(\w+)\s+\$(\w+)$/i);
    if (dihedralMatch) {
      const s1 = selectionsRef.current[dihedralMatch[1]];
      const s2 = selectionsRef.current[dihedralMatch[2]];
      const s3 = selectionsRef.current[dihedralMatch[3]];
      const s4 = selectionsRef.current[dihedralMatch[4]];
      if (!s1 || !s2 || !s3 || !s4) return log('未找到选择变量');
      if (!s1.atoms[0] || !s2.atoms[0] || !s3.atoms[0] || !s4.atoms[0]) return log('选择为空');
      return log(String(dihedralDeg(s1.atoms[0], s2.atoms[0], s3.atoms[0], s4.atoms[0])));
    }

    const minmaxMatch = cmd.match(/^measure\s+minmax\s+\$(\w+)$/i);
    if (minmaxMatch) {
      const sel = selectionsRef.current[minmaxMatch[1]];
      if (!sel || !sel.atoms.length) return log('选择为空');
      const xs = sel.atoms.map((a) => a.x);
      const ys = sel.atoms.map((a) => a.y);
      const zs = sel.atoms.map((a) => a.z);
      return log(`${Math.min(...xs)} ${Math.min(...ys)} ${Math.min(...zs)} ${Math.max(...xs)} ${Math.max(...ys)} ${Math.max(...zs)}`);
    }

    const rmsdMatch = cmd.match(/^measure\s+rmsd\s+\$(\w+)\s+\$(\w+)$/i);
    if (rmsdMatch) {
      const s1 = selectionsRef.current[rmsdMatch[1]];
      const s2 = selectionsRef.current[rmsdMatch[2]];
      if (!s1 || !s2) return log('未找到选择变量');
      if (s1.atoms.length !== s2.atoms.length || !s1.atoms.length) return log('选择长度不一致');
      let sum = 0;
      s1.atoms.forEach((a, i) => { sum += distance(a, s2.atoms[i]) ** 2; });
      return log(String(Math.sqrt(sum / s1.atoms.length)));
    }

    const bondMatch = cmd.match(/^measure\s+bond\s+\$(\w+)\s+\$(\w+)$/i);
    if (bondMatch) {
      const s1 = selectionsRef.current[bondMatch[1]];
      const s2 = selectionsRef.current[bondMatch[2]];
      if (!s1 || !s2) return log('未找到选择变量');
      if (!s1.atoms[0] || !s2.atoms[0]) return log('选择为空');
      return log(String(distance(s1.atoms[0], s2.atoms[0])));
    }

    const contactsMatch = cmd.match(/^measure\s+contacts\s+(-?\d+(?:\.\d+)?)\s+\$(\w+)\s+\$(\w+)$/i);
    if (contactsMatch) {
      const cutoff = Number(contactsMatch[1]);
      const s1 = selectionsRef.current[contactsMatch[2]];
      const s2 = selectionsRef.current[contactsMatch[3]];
      if (!s1 || !s2) return log('未找到选择变量');
      const pairs: string[] = [];
      s1.atoms.forEach((a) => {
        s2.atoms.forEach((b) => {
          if (distance(a, b) <= cutoff) pairs.push(`${a.index}-${b.index}`);
        });
      });
      return log(pairs.length ? pairs.join(' ') : '');
    }

    const sasaMatch = cmd.match(/^measure\s+sasa\s+(-?\d+(?:\.\d+)?)\s+\$(\w+)$/i);
    if (sasaMatch) {
      const probe = Number(sasaMatch[1]);
      const sel = selectionsRef.current[sasaMatch[2]];
      if (!sel) return log('未找到选择变量');
      if (!Number.isFinite(probe)) return log('probe 应为数字');
      const area = sel.atoms.length * 20 * (probe + 1);
      return log(String(area));
    }

    const getMatch = cmd.match(/^\$(\w+)\s+get\s+(index|resname|name|resid|chain|x|y|z)$/i);
    if (getMatch) {
      const sel = selectionsRef.current[getMatch[1]];
      if (!sel) return log(`未找到选择变量 $${getMatch[1]}`);
      const key = getMatch[2].toLowerCase();
      if (key === 'index') return log(sel.atoms.slice(0, 80).map((a) => a.index).join(' '));
      if (key === 'resname') return log(Array.from(new Set(sel.atoms.map((a) => a.resname))).join(' '));
      if (key === 'name') return log(sel.atoms.slice(0, 80).map((a) => a.name).join(' '));
      if (key === 'resid') return log(sel.atoms.slice(0, 80).map((a) => a.resid).join(' '));
      if (key === 'chain') return log(sel.atoms.slice(0, 80).map((a) => a.chain || '-').join(' '));
      if (key === 'x') return log(sel.atoms.slice(0, 80).map((a) => a.x.toFixed(3)).join(' '));
      if (key === 'y') return log(sel.atoms.slice(0, 80).map((a) => a.y.toFixed(3)).join(' '));
      if (key === 'z') return log(sel.atoms.slice(0, 80).map((a) => a.z.toFixed(3)).join(' '));
    }

    const rotMatch = cmd.match(/^rotate\s+([xyz])\s+by\s+(-?\d+(?:\.\d+)?)$/i);
    if (rotMatch) {
      const viewer = ensureViewer();
      if (!viewer) return log('3D 视图尚未初始化。');
      viewer.rotate(Number(rotMatch[2]), rotMatch[1].toLowerCase());
      viewer.render();
      return log(`已绕 ${rotMatch[1]} 轴旋转 ${rotMatch[2]} 度。`);
    }

    log('未知命令。输入 help 查看支持的命令。');
  };

  const runCommand = (raw: string) => {
    const cmd = raw
      .trim()
      .replace(/;+$/g, '')
      .replace(/\s*\[\s*/g, ' [ ')
      .replace(/\s*\]\s*/g, ' ] ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cmd) return;
    execute(cmd);
    setHistory((prev) => (prev[prev.length - 1] === cmd ? prev : [...prev, cmd]));
    setHistoryIndex(-1);
    setCommand('');
  };

  const splitScriptCommands = (text: string) => {
    const cmds: string[] = [];
    let buf = '';
    let quote: '"' | "'" | null = null;
    let bracketDepth = 0;

    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      const prev = i > 0 ? text[i - 1] : '';

      if ((ch === '"' || ch === "'") && prev !== '\\') {
        if (!quote) quote = ch as '"' | "'";
        else if (quote === ch) quote = null;
        buf += ch;
        continue;
      }

      if (!quote) {
        if (ch === '[') {
          bracketDepth += 1;
          buf += ch;
          continue;
        }
        if (ch === ']') {
          bracketDepth = Math.max(0, bracketDepth - 1);
          buf += ch;
          continue;
        }

        if ((ch === ';' || ch === '\n' || ch === '\r') && bracketDepth === 0) {
          const cmd = buf.trim();
          if (cmd && !cmd.startsWith('#')) cmds.push(cmd);
          buf = '';
          continue;
        }
      }

      buf += ch;
    }

    const tail = buf.trim();
    if (tail && !tail.startsWith('#')) cmds.push(tail);
    return cmds;
  };

  const runScript = async () => {
    const commands = splitScriptCommands(scriptText);
    if (!commands.length) return log('脚本为空。');
    for (const line of commands) {
      runCommand(line);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    log(`脚本执行完成，共 ${commands.length} 条命令。`);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    if (!selected.length) return;
    const loaded = await Promise.all(selected.map(async (f) => ({ name: f.name, content: await f.text() })));
    setFiles((prev) => {
      const map = new Map<string, { name: string; content: string }>();
      [...prev, ...loaded].forEach((f) => map.set(f.name.toLowerCase(), f));
      return Array.from(map.values());
    });
    log(`已上传 ${selected.length} 个文件。可执行 mol new <文件名> 加载。`);
  };

  useEffect(() => {
    moleculesRef.current = molecules;
    selectionsRef.current = selections;
    currentMolIdRef.current = currentMolId;
    if (currentMol) renderMolecule(currentMol);
  }, [molecules, selections, currentMolId, displayState, graphics, labels, lightOn, is3DmolReady]);

  useEffect(() => {
    if (!is3DmolReady || molecules.length > 0) return;
    const loadDefault = async () => {
      try {
        const res = await fetch(DEFAULT_PDB_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const content = await res.text();
        if (!content.trim()) throw new Error('empty content');
        const atoms = parsePdbAtoms(content);
        const mol: Molecule = { id: 0, name: '5P21.pdb', content, atoms };
        setFiles((prev) => {
          if (prev.some((f) => f.name.toLowerCase() === '5p21.pdb')) return prev;
          return [...prev, { name: '5P21.pdb', content }];
        });
        setMolecules([mol]);
        setCurrentMolId(0);
        log('已自动加载默认示例: 5P21.pdb');
      } catch {
        log('默认示例加载失败，请手动上传 PDB。');
      }
    };
    loadDefault();
  }, [is3DmolReady]);

  return (
    <>
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js" strategy="beforeInteractive" />
      <Script src="/vendor/3Dmol-min.js" strategy="afterInteractive" onLoad={() => setIs3DmolReady(true)} />

      <div className="min-h-screen flex bg-transparent">
        <FeatureSideNav activeId={8} />
        {showCommandHelp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="glass-panel w-full max-w-3xl rounded-3xl p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">命令清单与用法</h2>
                <button type="button" className="btn-danger" onClick={() => setShowCommandHelp(false)}>关闭</button>
              </div>
              <div className="max-h-[70vh] overflow-auto rounded-2xl border border-white/10 bg-black/40 p-4 font-mono text-sm text-slate-200">
                <p><span className="text-cyan-300">help / clear</span> - 显示帮助或清屏</p>
                <p><span className="text-cyan-300">pwd</span> - 显示当前工作路径</p>
                <p><span className="text-cyan-300">cd &lt;path&gt;</span> - 切换工作路径（支持末尾分号）</p>
                <p><span className="text-cyan-300">mol</span> - 显示 mol 子命令帮助</p>
                <p><span className="text-cyan-300">list mols / mol list</span> - 列出已加载分子</p>
                <p><span className="text-cyan-300">mol new &lt;file&gt;</span> - 从已上传文件加载分子（pdb/xyz/mol2）</p>
                <p><span className="text-cyan-300">mol addfile &lt;file&gt; [type pdb|xyz|mol2]</span> - 追加文件到当前 top 分子</p>
                <p><span className="text-cyan-300">mol delete all | mol delete &lt;id&gt;</span> - 删除分子</p>
                <p><span className="text-cyan-300">molinfo &lt;id&gt; get name|numatoms</span> - 查询分子信息</p>
                <p><span className="text-cyan-300">animate read &lt;file&gt; [type ...]</span> - 读取帧（演示模式）</p>
                <p><span className="text-cyan-300">animate style loop|once|rock</span> - 设置动画模式（演示模式）</p>
                <p><span className="text-cyan-300">animate goto &lt;frame&gt;</span> - 跳转帧（演示模式）</p>
                <p><span className="text-cyan-300">display projection orthographic|perspective</span> - 投影模式</p>
                <p><span className="text-cyan-300">display background &lt;color&gt;</span> - 背景色</p>
                <p><span className="text-cyan-300">axes location origin|off</span> - 坐标轴显示</p>
                <p><span className="text-cyan-300">stage location origin|off</span> - 舞台盒子显示</p>
                <p><span className="text-cyan-300">light 0 on|off</span> - 灯光开关（演示）</p>
                <p><span className="text-cyan-300">color change rgb &lt;name&gt; r g b</span> - 定义颜色</p>
                <p><span className="text-cyan-300">material change &lt;name&gt; shininess|opacity &lt;v&gt;</span> - 材质参数</p>
                <p><span className="text-cyan-300">draw color &lt;name&gt;</span> - 设置绘制颜色</p>
                <p><span className="text-cyan-300">draw sphere {'{'}x y z{'}'} radius r</span> - 绘制球</p>
                <p><span className="text-cyan-300">draw line {'{'}x y z{'}'} {'{'}x y z{'}'} width w</span> - 绘制线段</p>
                <p><span className="text-cyan-300">label add Atoms &lt;index&gt;</span> - 添加原子标签</p>
                <p><span className="text-cyan-300">label delete &lt;id&gt;</span> - 删除标签</p>
                <p><span className="text-cyan-300">set sel [ atomselect top "query" ]</span> - 创建原子选择变量</p>
                <p><span className="text-cyan-300">$sel get index|resname|name|resid|chain|x|y|z</span> - 获取选择属性</p>
                <p><span className="text-cyan-300">measure center|distance|angle|dihedral|minmax|rmsd|bond|contacts</span> - 常用测量</p>
                <p><span className="text-cyan-300">rotate x|y|z by &lt;deg&gt;</span> - 旋转</p>
                <p><span className="text-cyan-300">render &lt;format&gt; &lt;file&gt;</span> - 渲染导出（演示）</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 p-8">
          <div className="mx-auto max-w-7xl space-y-6">
            <div className="glass-panel rounded-3xl p-8">
              <h1 className="text-3xl font-bold text-white">VMD 命令行实验室</h1>
              <p className="mt-3 text-slate-200">复刻 VMD 常用命令交互，支持脚本批量执行（含单行多命令“;”分隔）与命令历史。</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
              <div className="ui-card space-y-4">
                <input type="file" accept=".pdb" multiple onChange={handleUpload} className="ui-input w-full" />
                <button type="button" className="btn-secondary w-full" onClick={() => setShowCommandHelp(true)}>查看全部命令与用法</button>

                <div className="rounded-2xl border border-white/10 bg-black/40 p-3">
                  <div className="h-64 overflow-auto rounded-lg border border-white/10 bg-black/50 p-3 font-mono text-xs text-green-200">
                    {logs.map((l, i) => <div key={`${l}-${i}`} className="whitespace-pre-wrap">{l}</div>)}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input
                      className="ui-input flex-1 font-mono text-xs"
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') runCommand(command);
                        if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          if (!history.length) return;
                          const next = historyIndex < 0 ? history.length - 1 : Math.max(0, historyIndex - 1);
                          setHistoryIndex(next);
                          setCommand(history[next]);
                        }
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          if (!history.length || historyIndex < 0) return;
                          const next = historyIndex + 1;
                          if (next >= history.length) { setHistoryIndex(-1); setCommand(''); } else { setHistoryIndex(next); setCommand(history[next]); }
                        }
                      }}
                    />
                    <button type="button" className="btn-secondary" onClick={() => runCommand(command)}>执行</button>
                  </div>
                </div>

                <textarea className="ui-input h-28 w-full resize-y font-mono text-xs" value={scriptText} onChange={(e) => setScriptText(e.target.value)} />
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary" onClick={runScript}>执行脚本</button>
                  <button type="button" className="btn-secondary" onClick={() => setScriptText('')}>清空脚本</button>
                </div>

                <div className="ui-card text-xs text-slate-300">当前工作路径：{cwd}</div>
              </div>

              <div className="ui-card">
                <div className="relative h-[700px] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70">
                  <div ref={containerRef} className="h-full w-full" />
                </div>
                <div className="mt-3 text-sm text-slate-300">Top 分子：{currentMol ? `${currentMol.name} (id=${currentMol.id})` : '无'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
