// 一键启动：opencode(4096) + 网关(8787) + 前端(5180)
import { spawn } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const procs = [];
function run(name, color, cmd, args, cwd = ROOT) {
  const p = spawn(cmd, args, { cwd, shell: true, env: { ...process.env, FORCE_COLOR: '1' } });
  procs.push(p);
  const prefix = `\x1b[${color}m[${name}]\x1b[0m`;
  p.stdout.on('data', d => d.toString().split('\n').filter(Boolean).forEach(l => console.log(prefix, l)));
  p.stderr.on('data', d => d.toString().split('\n').filter(Boolean).forEach(l => console.log(prefix, l)));
  p.on('exit', code => console.log(prefix, `退出 (${code})`));
  return p;
}

console.log('启动 AI协同工作台 ...');
run('opencode', '36', 'npx opencode serve --port 4096 --hostname 127.0.0.1 --cors http://localhost:5180');
setTimeout(() => run('gateway', '33', 'node apps/gateway/server.mjs'), 6000);
setTimeout(() => run('web', '35', 'npm run dev', [''], path.join(ROOT, 'apps/web')), 9000);
setTimeout(() => console.log('\n✓ 全部服务已启动：前端 http://localhost:5180\n'), 13000);

function shutdown() {
  console.log('\n正在停止全部服务...');
  for (const p of procs) { try { p.kill(); } catch {} }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
