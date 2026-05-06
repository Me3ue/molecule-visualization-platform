import { NextResponse } from 'next/server';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const exec = (cmd: string, args: string[], cwd: string) => new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
  const child = spawn(cmd, args, { cwd, shell: false });
  let stdout = '';
  let stderr = '';
  let spawnErr: any = null;

  child.stdout.on('data', (d) => {
    stdout += d.toString();
  });
  child.stderr.on('data', (d) => {
    stderr += d.toString();
  });
  child.on('error', (e: any) => {
    spawnErr = e;
  });
  child.on('close', (code) => {
    if (spawnErr) {
      const isEnoent = spawnErr?.code === 'ENOENT';
      const msg = isEnoent
        ? `命令未找到：${cmd}。请安装 AmberTools，并将 cpptraj 加入 PATH，或设置环境变量 CPPTRAJ_PATH。`
        : (spawnErr?.message || String(spawnErr));
      resolve({ code: 127, stdout, stderr: msg });
      return;
    }
    resolve({ code: Number(code ?? 1), stdout, stderr });
  });
});

const countModels = (pdbText: string) => {
  const n = (pdbText.match(/^MODEL\s+/gm) || []).length;
  return Math.max(n, 1);
};

export async function POST(req: Request) {
  const workDir = await mkdtemp(path.join(tmpdir(), 'rst7-convert-'));

  try {
    const form = await req.formData();
    const topology = form.get('topology');
    const trajectory = form.get('trajectory');

    if (!(topology instanceof File) || !(trajectory instanceof File)) {
      return NextResponse.json({ error: '缺少 topology 或 trajectory 文件。' }, { status: 400 });
    }

    const topName = topology.name || `topology-${randomUUID()}.prmtop`;
    const trajName = trajectory.name || `trajectory-${randomUUID()}.rst7`;

    const topPath = path.join(workDir, topName);
    const trajPath = path.join(workDir, trajName);
    const outPath = path.join(workDir, 'converted.pdb');
    const scriptPath = path.join(workDir, 'convert.in');

    await writeFile(topPath, Buffer.from(await topology.arrayBuffer()));
    await writeFile(trajPath, Buffer.from(await trajectory.arrayBuffer()));

    const cpptrajInput = [
      `parm "${topPath}"`,
      `trajin "${trajPath}"`,
      `trajout "${outPath}" pdb multi`,
      'run',
      'quit',
      '',
    ].join('\n');

    await writeFile(scriptPath, cpptrajInput, 'utf8');

    const cpptrajCmd = process.env.CPPTRAJ_PATH || 'cpptraj';
    const run = await exec(cpptrajCmd, ['-i', scriptPath], workDir);

    if (run.code !== 0) {
      return NextResponse.json({
        error: 'cpptraj 执行失败。请确认服务器已安装 AmberTools/cpptraj，且命令在 PATH 中可用。',
        details: run.stderr || run.stdout,
      }, { status: 500 });
    }

    const pdbText = await readFile(outPath, 'utf8');
    const frameCount = countModels(pdbText);

    return NextResponse.json({
      ok: true,
      format: 'pdb',
      frameCount,
      pdb: pdbText,
    });
  } catch (err: any) {
    return NextResponse.json({
      error: 'rst7 后台转换失败。',
      details: err?.message || String(err),
    }, { status: 500 });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
