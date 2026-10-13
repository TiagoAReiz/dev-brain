#!/usr/bin/env bash
# Entire fixture is disposable: no real gh, HOME, workfolder or origin is touched.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node - "$ROOT" <<'NODE'
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const source = process.argv[2];
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'project-json-'));
const root = path.join(temp, 'brain'), home = path.join(temp, 'home'), work = path.join(temp, 'work');
const remotes = path.join(temp, 'remotes'), tools = path.join(temp, 'tools');
for (const dir of [root, home, work, remotes, tools]) fs.mkdirSync(dir, {recursive:true});
const env = {...process.env, HOME: home, WORKFOLDER: work, PATH: `${tools}:${process.env.PATH}`, TEST_REMOTES:remotes, GIT_CONFIG_GLOBAL:path.join(home, '.gitconfig'), GIT_CONFIG_NOSYSTEM:'1'};
for (const key of Object.keys(env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|CONFIG_COUNT|CONFIG_KEY_|CONFIG_VALUE_)/.test(key)) delete env[key];
function call(cmd,args,cwd=root, extra={}) {
 const r=spawnSync(cmd,args,{cwd,env:{...env,...extra},encoding:'utf8',input:'',timeout:20000});
 assert.equal(r.status,0,`${cmd} ${args.join(' ')}: ${r.stderr || r.error}`); return r.stdout;
}
const git=(cwd,...args)=>call('git',['-C',cwd,...args]);
function cli(args, extra={}) {
 const r=spawnSync(path.join(root,'bin/project'),args,{env:{...env,...extra},encoding:'utf8',input:'',timeout:20000});
 assert.equal(r.status,0,`${args}: ${r.stderr || r.error}`);
 assert.ok(!r.stdout.includes('\x1b')); return JSON.parse(r.stdout);
}
function bad(args,match,extra={}) {
 const r=spawnSync(path.join(root,'bin/project'),args,{env:{...env,...extra},encoding:'utf8',input:'',timeout:20000});
 assert.notEqual(r.status,0,`${args} unexpectedly succeeded`); assert.equal(r.stdout,''); assert.match(r.stderr,match);
}
function write(dir,file,text) {fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),text);}
function commit(dir,file,text) {write(dir,file,text);git(dir,'add','--',file);git(dir,'commit','-qm',file);}
function seed(name) {
 const remote=path.join(remotes,'Tiago',`${name}.git`);fs.mkdirSync(path.dirname(remote),{recursive:true});git(temp,'init','--bare','-q',remote);
 const dir=path.join(temp,`seed-${name}`);fs.mkdirSync(dir);git(dir,'init','-q','-b','main');commit(dir,'README.md',name);git(dir,'remote','add','origin',remote);git(dir,'push','-qu','origin','main');git(remote,'symbolic-ref','HEAD','refs/heads/main');return remote;
}
function clone(name) {seed(name);const dir=path.join(work,name);git(temp,'clone','-q',`https://github.com/Tiago/${name}.git`,dir);return dir;}
try {
 for (const file of ['bin/project','lib/project-json.cjs','new-project.sh']) {fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.copyFileSync(path.join(source,file),path.join(root,file));fs.chmodSync(path.join(root,file),0o755);}
 fs.cpSync(path.join(source,'templates'),path.join(root,'templates'),{recursive:true});write(root,'memory/README.md','# Memory\n');
 call('git',['config','--global','user.email','fixture@example.invalid']);call('git',['config','--global','user.name','Fixture']);
 call('git',['config','--global',`url.file://${remotes}/.insteadOf`,'https://github.com/']);
 git(root,'init','-q','-b','main');git(root,'add','.');git(root,'commit','-qm','fixture');
 const brainRemote=path.join(temp,'brain.git');git(temp,'init','--bare','-q',brainRemote);git(root,'remote','add','origin',brainRemote);git(root,'push','-qu','origin','main');
 const gh=`#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const a=process.argv.slice(2),base=process.env.TEST_REMOTES;
function git(args){const r=cp.spawnSync('git',args,{stdio:'inherit'});if(r.status)process.exit(r.status||1);}
if(a[0]==='auth')process.exit(process.env.AUTH_FAIL?1:0);
if(a[1]==='list'){console.log(JSON.stringify([{nameWithOwner:'Tiago/zeta'},{nameWithOwner:'Tiago/alpha'}]));process.exit(0);}
if(a[1]==='clone'){git(['clone','-q','https://github.com/'+a[2]+'.git',a[3]]);process.exit(0);}
if(a[1]==='create'){
 if(process.env.CREATE_FAIL){console.error('simulated creation failure');process.exit(1);}
 const remote=path.join(base,'Tiago',a[2]+'.git');fs.mkdirSync(path.dirname(remote),{recursive:true});git(['init','--bare','-q',remote]);git(['remote','add','origin','https://github.com/Tiago/'+a[2]+'.git']);git(['push','-qu','origin','main']);process.exit(0);
}
process.exit(1);
`;
 write(tools,'gh',gh);fs.chmodSync(path.join(tools,'gh'),0o755);
 fs.mkdirSync(path.join(root,'memory/zeta'));
 const listing=cli(['repos','--json']);assert.equal(listing[0].nome,'zeta');assert.equal(listing[0].temMemoria,true);assert.equal(listing[1].local,false);
 bad(['preparar','../outside','--json'],/Repo inválido/);
 bad(['preparar','-evil/repo','--json'],/Opção desconhecida/);
 bad(['create','Uppercase','--json','--sem-claude'],/nome/);
 bad(['create','--json','--sem-claude'],/nome/);
 seed('fresh');const fresh=cli(['preparar','Tiago/fresh','--json']);assert.equal(fresh.novaMemoria,true);assert.match(fresh.prompt,/kickoff/);assert.ok(fs.existsSync(path.join(fresh.dir,'CLAUDE.md')));
 assert.equal(cli(['preparar','Tiago/fresh','--json']).prompt,null);
 fs.unlinkSync(path.join(fresh.dir,'CLAUDE.md'));assert.equal(cli(['preparar','Tiago/fresh','--json']).novaMemoria,false);assert.ok(fs.existsSync(path.join(fresh.dir,'CLAUDE.md')));
 const conflicting=clone('conflicting');write(conflicting,'CLAUDE.md','keep me');bad(['preparar','Tiago/conflicting','--json'],/CLAUDE.md já existe/);assert.equal(fs.readFileSync(path.join(conflicting,'CLAUDE.md'),'utf8'),'keep me');
 git(conflicting,'remote','set-url','origin','https://github.com/Other/conflicting.git');bad(['preparar','Tiago/conflicting','--json'],/Origin não corresponde/);
 const created=cli(['create','new-project','--sem-claude','--json']);assert.equal(created.novaMemoria,true);
 bad(['create','failed-project','--sem-claude','--json'],/projeto preservado/,{CREATE_FAIL:'1'});assert.ok(fs.existsSync(path.join(work,'failed-project/README.md')));assert.ok(fs.existsSync(path.join(root,'memory/failed-project')));
 const safe=clone('safe');write(safe,'changed.txt','save');
 const fallback=clone('fallback');write(fallback,'change','wip');
 const fallbackRemote=path.join(remotes,'Tiago/fallback.git');write(fallbackRemote,'hooks/pre-receive','#!/bin/sh\nwhile read old new ref; do [ "$ref" != refs/heads/main ] || exit 1; done\n');fs.chmodSync(path.join(fallbackRemote,'hooks/pre-receive'),0o755);
 const failed=clone('failed');write(failed,'change','local');const failRemote=path.join(remotes,'Tiago/failed.git');write(failRemote,'hooks/pre-receive','#!/bin/sh\nexit 1\n');fs.chmodSync(path.join(failRemote,'hooks/pre-receive'),0o755);
 const stash=clone('stash');write(stash,'README.md','stashed');git(stash,'stash','push','-qm','stash');
 const branch=clone('branch');git(branch,'checkout','-qb','other');commit(branch,'other','unpublished');git(branch,'checkout','-q','main');
 const ignored=clone('ignored');commit(ignored,'.gitignore','cache/\n.env\n');write(ignored,'cache/data','keep');write(ignored,'.env','secret');
 const nested=clone('nested');write(nested,'sub/.git','gitdir: nowhere');
 const detached=clone('detached');git(detached,'checkout','--detach','-q');
 const submodule=clone('submodule');const sha=git(submodule,'rev-parse','HEAD').trim();git(submodule,'update-index','--add','--cacheinfo',`160000,${sha},sub`);
 const hidden=clone('.hidden');write(hidden,'file','save hidden');
 fs.symlinkSync(safe,path.join(work,'linked'));write(work,'loose.txt','keep');fs.mkdirSync(path.join(work,'not-repo'));
 const sum=cli(['resumo','--json']);assert.ok(sum.repos.find(r=>r.nome==='ignored').riscos.includes('.env local fora do Git'));assert.ok(sum.repos.find(r=>r.nome==='nested').riscos.includes('.git aninhado'));assert.ok(sum.repos.find(r=>r.nome==='submodule').riscos.includes('submódulo'));assert.ok(sum.repos.some(r=>r.nome==='.hidden'));assert.ok(sum.avulsos.includes('loose.txt'));
 write(root,'unrelated.txt','staged unrelated');git(root,'add','unrelated.txt');write(root,'memory/README.md','# Changed memory\n');
 const result=cli(['exit','--sem-perguntas','--json']);
 for (const name of ['safe','fallback','.hidden','fresh','new-project']) {assert.ok(result.salvos.includes(name),`${name}: ${JSON.stringify(result)}`);assert.ok(!fs.existsSync(path.join(work,name)));}
 for (const name of ['failed','stash','branch','ignored','nested','detached','submodule','linked','not-repo','loose.txt']) assert.ok(result.mantidos.some(r=>r.nome===name),name);
 assert.equal(result.memoria.salva,true);assert.equal(git(root,'diff','--cached','--name-only').trim(),'unrelated.txt');assert.ok(!git(root,'ls-tree','--name-only','HEAD').split('\n').includes('unrelated.txt'));
 const repeated=cli(['exit','--sem-perguntas','--json']);assert.ok(!repeated.salvos.includes('safe'));assert.ok(fs.existsSync(path.join(ignored,'.env')));
 console.log('ok: project JSON isolated contracts and loss prevention');
} finally {fs.rmSync(temp,{recursive:true,force:true});}
NODE
