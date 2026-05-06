import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let workDir = '';
  try {
    const form = await req.formData();
    const topology = form.get('topology');
    const trajectory = form.get('trajectory');

    if (!(topology instanceof File) || !(trajectory instanceof File)) {
      return NextResponse.json({ error: '请上传 topology 与 trajectory 文件。' }, { status: 400 });
    }

    const topName = (topology.name || '').toLowerCase();
    const trajName = (trajectory.name || '').toLowerCase();
    if (!topName.endsWith('.gro') || !trajName.endsWith('.xtc')) {
      return NextResponse.json({ error: 'GROMACS 计算仅支持 .gro + .xtc 组合。' }, { status: 400 });
    }

    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gmx-metrics-'));
    const topPath = path.join(workDir, 'topology.gro');
    const trajPath = path.join(workDir, 'trajectory.xtc');

    await fs.writeFile(topPath, Buffer.from(await topology.arrayBuffer()));
    await fs.writeFile(trajPath, Buffer.from(await trajectory.arrayBuffer()));

    const pyScript = `
import json
import sys

try:
    import MDAnalysis as mda
    from MDAnalysis.analysis import rms
except Exception as e:
    print(json.dumps({"error": f"Python 依赖缺失：{str(e)}"}))
    sys.exit(2)

try:
    top = sys.argv[1]
    traj = sys.argv[2]

    u = mda.Universe(top, traj)
    n_atoms = int(u.atoms.n_atoms)

    R = rms.RMSD(u, u, select='all', ref_frame=0)
    R.run()

    rg_values = []
    for ts in u.trajectory:
      rg_values.append(float(u.atoms.radius_of_gyration()))

    series = []
    rmsd_rows = R.results.rmsd
    frame_count = int(len(rmsd_rows))

    for i in range(frame_count):
      rmsd_val = float(rmsd_rows[i, 2])
      rg_val = float(rg_values[i]) if i < len(rg_values) else 0.0
      series.append({
        "t": i + 1,
        "rmsd": rmsd_val,
        "rg": rg_val,
      })

    print(json.dumps({
      "ok": True,
      "frameCount": frame_count,
      "atomCount": n_atoms,
      "series": series,
    }))
except Exception as e:
    print(json.dumps({"error": f"GROMACS 指标计算失败：{str(e)}"}))
    sys.exit(1)
`.trim();

    const { stdout, stderr } = await execFileAsync('python', ['-c', pyScript, topPath, trajPath], {
      maxBuffer: 1024 * 1024 * 20,
      windowsHide: true,
    });

    const output = String(stdout || '').trim();
    if (!output) {
      return NextResponse.json({ error: `后端计算无输出${stderr ? `: ${String(stderr).trim()}` : ''}` }, { status: 500 });
    }

    const parsed = JSON.parse(output);
    if (parsed?.error) {
      return NextResponse.json({ error: String(parsed.error) }, { status: 500 });
    }

    return NextResponse.json({
      frameCount: Number(parsed?.frameCount || 0),
      atomCount: Number(parsed?.atomCount || 0),
      series: Array.isArray(parsed?.series) ? parsed.series : [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '后端计算失败。' }, { status: 500 });
  } finally {
    if (workDir) {
      try {
        await fs.rm(workDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    }
  }
}
