'use strict';
// JSON adapter for project. All subprocess arguments are literal, and stdin is closed.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const work = path.resolve(process.env.WORKFOLDER || path.join(process.env.HOME, 'workfolder'));
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const prompt = s => `Use a skill kickoff para preencher a memória do projeto ${s} no dev-brain.`;
const exists = p => { try { return fs.lstatSync(p); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
function run(cmd, args, cwd = root) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1' };
  // Do not let inherited repository selection redirect operations to another checkout.
  for (const key of Object.keys(env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG_COUNT|CONFIG_KEY_|CONFIG_VALUE_)/.test(key)) delete env[key];
  const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw new Error(`${cmd} ${args[0]} falhou: ${(r.error?.message || r.stderr || 'verifique configuração e acesso ao remoto').trim()}`);
  return r.stdout;
}
const git = (dir, ...args) => run('git', ['-C', dir, ...args]);
function deps() { run('gh', ['auth', 'status']); }
function workRoot(create = false) {
  if (create) fs.mkdirSync(work, { recursive: true });
  const stat = exists(work);
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(work) !== work)) throw new Error(`WORKFOLDER deve ser diretório real sem symlinks: ${work}`);
}
function localDir(name) {
  workRoot(true);
  const dir = path.join(work, name);
  if (path.dirname(dir) !== work || dir === root) throw new Error('Caminho de projeto inseguro.');
  const stat = exists(dir);
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(dir) !== dir)) throw new Error(`Pasta local deve ser diretório real: ${dir}`);
  return dir;
}
function repository(value) {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}$/.test(value) || /\/(?:\.|\.\.)$/.test(value)) throw new Error('Repo inválido; use dono/repo do GitHub.');
  return value;
}
function matchingOrigin(dir, repo) {
  const top = git(dir, 'rev-parse', '--show-toplevel').trim();
  if (top !== dir || !exists(path.join(dir, '.git'))?.isDirectory() || exists(path.join(dir, '.git')).isSymbolicLink()) throw new Error(`Pasta não é checkout independente: ${dir}`);
  const url = git(dir, 'config', '--get', 'remote.origin.url').trim();
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+\/[^/]+?)\/?$/.exec(url);
  if (!match || match[1].replace(/\.git$/, '').toLowerCase() !== repo.toLowerCase()) throw new Error(`Origin não corresponde a ${repo}; pasta preservada: ${dir}`);
}
function memoryCommit(name) {
  try {
    git(root, 'commit', '-q', '--only', '-m', `memory(${name}): cria projeto`, '--', `memory/${name}`, 'memory/README.md');
    git(root, 'push', '-q');
  } catch (e) { console.error(`Aviso: memória preservada em ${root}/memory/${name}; ${e.message}`); }
}
function memory(dir, name) {
  const mem = path.join(root, 'memory', name), claude = path.join(dir, 'CLAUDE.md');
  if (!exists(mem)) {
    if (exists(claude)) throw new Error(`Memória ausente e CLAUDE.md já existe; resolva manualmente em ${dir}.`);
    run(path.join(root, 'new-project.sh'), [name, dir]);
    memoryCommit(name);
    return true;
  }
  if (!exists(mem).isDirectory() || exists(mem).isSymbolicLink()) throw new Error(`Memória inválida: ${mem}`);
  if (!exists(claude)) {
    const text = fs.readFileSync(path.join(root, 'templates/CLAUDE.md.tpl'), 'utf8').replaceAll('{{NOME}}', name).replaceAll('{{DATA}}', new Date().toISOString().slice(0, 10));
    fs.writeFileSync(claude, text, { flag: 'wx' });
  }
  return false;
}
function prepare(repo) {
  repository(repo); deps();
  const name = repo.split('/')[1], mem = slug(name);
  if (!mem) throw new Error('Nome do repo não produz nome de memória válido.');
  const dir = localDir(name);
  if (!exists(dir)) run('gh', ['repo', 'clone', repo, dir, '--', '-q']);
  matchingOrigin(dir, repo);
  const fresh = memory(dir, mem);
  return { dir, memoria: mem, novaMemoria: fresh, prompt: fresh ? prompt(mem) : null };
}
function create(args) {
  const names = args.filter(a => !a.startsWith('--'));
  if (!args.includes('--sem-claude')) throw new Error('Use create <nome> --sem-claude --json.');
  if (names.length !== 1 || names[0].length > 100 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(names[0])) throw new Error('Informe nome com minúsculas, números e hífens.');
  const name = names[0], dir = localDir(name);
  if (exists(dir) || exists(path.join(root, 'memory', name))) throw new Error('Projeto ou memória já existe; escolha outro nome.');
  if (args.includes('--public') && args.includes('--private')) throw new Error('Escolha somente uma visibilidade.');
  deps();
  fs.mkdirSync(dir);
  try {
    git(dir, 'init', '-q', '-b', 'main');
    fs.writeFileSync(path.join(dir, 'README.md'), `# ${name}\n`, { flag: 'wx' });
    memory(dir, name);
    git(dir, 'add', '--', 'README.md', 'CLAUDE.md');
    git(dir, 'commit', '-q', '-m', 'Initial commit');
    run('gh', ['repo', 'create', name, args.includes('--public') ? '--public' : '--private', '--source=.', '--remote=origin', '--push'], dir);
    // gh success alone is insufficient: confirm that HEAD actually reached origin.
    confirmed(dir);
    return { dir, memoria: name, novaMemoria: true, prompt: prompt(name) };
  } catch (e) { throw new Error(`${e.message}; projeto preservado em ${dir}; memória em ${root}/memory/${name}.`); }
}
function nested(dir) {
  let found = false;
  function visit(base) {
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (entry.name === '.git') { if (base !== dir) found = true; continue; }
      if (entry.isDirectory() && !entry.isSymbolicLink()) visit(path.join(base, entry.name));
    }
  }
  visit(dir); return found;
}
function inspect(dir) {
  const row = { nome: path.basename(dir), dir, pendente: 0, commits: 0, riscos: [] };
  try {
    const st = fs.lstatSync(dir), dot = exists(path.join(dir, '.git'));
    if (st.isSymbolicLink() || !st.isDirectory()) { row.riscos.push('symlink ou não diretório'); return row; }
    if (fs.realpathSync(root) === fs.realpathSync(dir) || fs.realpathSync(root).startsWith(fs.realpathSync(dir) + path.sep)) { row.riscos.push('próprio dev-brain'); return row; }
    if (!dot) { row.riscos.push('não é repo git'); return row; }
    if (!dot.isDirectory() || dot.isSymbolicLink()) { row.riscos.push('worktree ou .git inválido'); return row; }
    if (git(dir, 'rev-parse', '--show-toplevel').trim() !== dir) throw new Error('checkout não corresponde à pasta');
    if (git(dir, 'worktree', 'list', '--porcelain').split('\n').filter(s => s.startsWith('worktree ')).length > 1) row.riscos.push('worktree compartilhado');
    row.pendente = git(dir, 'status', '--porcelain=v1', '-z').split('\0').filter(Boolean).length;
    row.commits = Number(git(dir, 'rev-list', '--count', '--branches', '--not', '--remotes').trim());
    if (!Number.isFinite(row.commits)) throw new Error('contagem de commits inválida');
    if (nested(dir)) row.riscos.push('.git aninhado');
    if (git(dir, 'ls-files', '--stage', '-z').split('\0').some(s => s.startsWith('160000 '))) row.riscos.push('submódulo');
    if (git(dir, 'stash', 'list').trim()) row.riscos.push('stash local');
    try { git(dir, 'symbolic-ref', '--quiet', 'HEAD'); } catch { row.riscos.push('HEAD destacado'); }
    const ignored = git(dir, 'ls-files', '--others', '--ignored', '--exclude-standard', '-z').split('\0').filter(Boolean);
    if (ignored.length) row.riscos.push('arquivos ignorados que seriam perdidos');
    const untracked = [...ignored, ...git(dir, 'ls-files', '--others', '--exclude-standard', '-z').split('\0')];
    if (untracked.some(p => /(^|\/)\.env(?:\.|$)/.test(p) && path.basename(p) !== '.env.example')) row.riscos.push('.env local fora do Git');
  } catch (e) { row.riscos.push(`falha de inspeção: ${e.message}`); }
  return row;
}
function memorySummary() {
  return { mudancas: git(root, 'status', '--porcelain=v1', '-z', '--', 'memory/').split('\0').filter(Boolean).length, commits: Number(git(root, 'rev-list', '--count', '@{u}..HEAD').trim()) };
}
function summary() {
  workRoot();
  const repos = [], avulsos = [];
  if (exists(work)) for (const name of fs.readdirSync(work).sort()) {
    const dir = path.join(work, name), st = fs.lstatSync(dir);
    if (st.isDirectory() || st.isSymbolicLink()) repos.push(inspect(dir)); else avulsos.push(name);
  }
  return { repos, memoria: memorySummary(), avulsos };
}
// Fetch fresh heads into a private namespace: stale tracking refs/tags must never prove safety.
function confirmed(dir, allBranches = true) {
  const prefix = `refs/devbrain-confirmed/${crypto.randomBytes(8).toString('hex')}/`;
  try {
    git(dir, 'fetch', '--quiet', '--no-tags', '--no-write-fetch-head', 'origin', `+refs/heads/*:${prefix}*`);
    const heads = git(dir, 'for-each-ref', '--format=%(objectname)', prefix).trim().split('\n').filter(Boolean);
    if (!heads.length) throw new Error('origin não tem branches confirmadas');
    if (git(dir, 'rev-list', allBranches ? '--branches' : 'HEAD', '--not', ...heads).trim()) throw new Error('há commits em branches locais ausentes do origin confirmado');
  } finally {
    for (const ref of git(dir, 'for-each-ref', '--format=%(refname)', prefix).trim().split('\n').filter(Boolean)) git(dir, 'update-ref', '-d', ref);
  }
}
function saveRepo(dir) {
  const before = inspect(dir);
  if (before.riscos.length) throw new Error(before.riscos.join('; '));
  git(dir, 'add', '-A');
  if (git(dir, 'diff', '--cached', '--name-only', '-z').length) git(dir, 'commit', '-q', '-m', `work in progress - ${new Date().toISOString().slice(0,10)}`);
  try { git(dir, 'push', '-q'); }
  catch { git(dir, 'push', '-q', 'origin', `HEAD:refs/heads/wip/${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`); }
  confirmed(dir);
  const after = inspect(dir);
  if (after.riscos.length || after.pendente) throw new Error(after.riscos.join('; ') || 'ainda há mudanças locais');
}
function saveMemory() {
  try {
    if (git(root, 'status', '--porcelain=v1', '-z', '--', 'memory/').length) {
      git(root, 'add', '--', 'memory/');
      // --only leaves staged changes outside memory untouched.
      git(root, 'commit', '-q', '--only', '-m', `memory: sessão de ${new Date().toISOString().slice(0,10)}`, '--', 'memory/');
    }
    // Push even when memory itself is unchanged: previous local commits may be pending.
    git(root, 'push', '-q');
    confirmed(root, false);
    if (git(root, 'status', '--porcelain=v1', '--', 'memory/').trim()) throw new Error('memória ainda tem mudanças');
    return { salva: true, motivo: null };
  } catch (e) { return { salva: false, motivo: e.message }; }
}
function finish() {
  deps(); workRoot();
  const result = { salvos: [], mantidos: [], memoria: null }, candidates = [];
  if (exists(work)) for (const name of fs.readdirSync(work).sort()) {
    const dir = path.join(work, name), st = fs.lstatSync(dir);
    if (!st.isDirectory() && !st.isSymbolicLink()) { result.mantidos.push({ nome: name, motivo: 'arquivo avulso' }); continue; }
    try { saveRepo(dir); candidates.push({ dir, name, dev: st.dev, ino: st.ino }); }
    catch (e) { result.mantidos.push({ nome: name, motivo: e.message }); }
  }
  result.memoria = saveMemory();
  // Memory is saved before cleanup. Recheck identity and content after commit hooks/network waits.
  for (const {dir, name, dev, ino} of candidates) {
    try {
      workRoot();
      const st = fs.lstatSync(dir), row = inspect(dir);
      if (st.dev !== dev || st.ino !== ino || row.riscos.length || row.pendente) throw new Error(row.riscos.join('; ') || 'pasta mudou durante a finalização');
      confirmed(dir);
      fs.rmSync(dir, { recursive: true }); result.salvos.push(name);
    } catch (e) { result.mantidos.push({ nome: name, motivo: e.message }); }
  }
  return result;
}

function main(args) {
  const [command, ...options] = args;
  const allowed = { repos: [], preparar: [], create: ['--public', '--private', '--sem-claude'], resumo: [], exit: ['--sem-perguntas'] };
  if (!Object.hasOwn(allowed, command)) throw new Error('Comando JSON desconhecido.');
  for (const a of options) if (a.startsWith('-') && a !== '--json' && !allowed[command].includes(a)) throw new Error(`Opção desconhecida: ${a}`);
  const rest = options.filter(a => a !== '--json');
  if (command === 'preparar') { if (rest.length !== 1) throw new Error('Uso: project preparar dono/repo --json'); return prepare(rest[0]); }
  if (command === 'create') return create(rest);
  if (command === 'exit') { if (rest.length !== 1 || rest[0] !== '--sem-perguntas') throw new Error('Use exit --sem-perguntas --json'); return finish(); }
  if (rest.length) throw new Error('Argumentos inesperados.');
  if (command === 'resumo') return summary();
  deps(); workRoot();
  const repos = JSON.parse(run('gh', ['repo', 'list', '--limit', '200', '--json', 'nameWithOwner']));
  if (!Array.isArray(repos)) throw new Error('Resposta inválida do gh repo list.');
  return repos.map(r => { const repo = repository(r.nameWithOwner), nome = repo.split('/')[1]; return { repo, nome, temMemoria: !!exists(path.join(root, 'memory', slug(nome))), local: !!exists(path.join(work, nome)) }; }).sort((a,b) => Number(b.temMemoria) - Number(a.temMemoria) || a.nome.localeCompare(b.nome));
}
if (require.main === module) {
  try { process.stdout.write(`${JSON.stringify(main(process.argv.slice(2)))}\n`); }
  catch (e) { console.error(`Erro: ${e.message}`); process.exitCode = 1; }
}
module.exports = { inspect, saveRepo, confirmed };
