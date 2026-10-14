import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BROWSE_LIMIT, BrowseError, browseFolder } from './browse';

describe('navegador de pastas (browseFolder)', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'browse-'));
    await mkdir(join(root, 'beta'));
    await mkdir(join(root, 'Alpha'));
    await mkdir(join(root, '.oculta'));
    await writeFile(join(root, 'arquivo.txt'), 'x');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('lista só pastas, ordenadas sem diferenciar maiúsculas', async () => {
    const r = await browseFolder(root, { home: root });
    expect(r.path).toBe(root);
    expect(r.home).toBe(root);
    expect(r.entries.map((e) => e.name)).toEqual(['Alpha', 'beta']);
    expect(r.entries[0]).toEqual({ name: 'Alpha', path: join(root, 'Alpha') });
    expect(r.truncated).toBe(false);
  });

  it('esconde pastas ocultas por padrão e mostra com hidden', async () => {
    const padrao = await browseFolder(root, { home: root });
    expect(padrao.entries.map((e) => e.name)).not.toContain('.oculta');
    const todas = await browseFolder(root, { home: root, hidden: true });
    expect(todas.entries.map((e) => e.name)).toEqual(['.oculta', 'Alpha', 'beta']);
  });

  it('inclui symlink para pasta e ignora link quebrado', async () => {
    await symlink(join(root, 'beta'), join(root, 'atalho'));
    await symlink(join(root, 'nao-existe'), join(root, 'quebrado'));
    const r = await browseFolder(root, { home: root });
    expect(r.entries.map((e) => e.name)).toEqual(['Alpha', 'atalho', 'beta']);
  });

  it('na raiz o parent é null', async () => {
    const r = await browseFolder(parse(root).root, { home: root });
    expect(r.path).toBe(parse(root).root);
    expect(r.parent).toBeNull();
  });

  it('subpasta tem parent apontando para a pasta de cima', async () => {
    const r = await browseFolder(join(root, 'beta'), { home: root });
    expect(r.parent).toBe(root);
  });

  it('caminho inexistente responde 404', async () => {
    const err = await browseFolder(join(root, 'nao-existe'), { home: root }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BrowseError);
    expect((err as BrowseError).status).toBe(404);
  });

  it('arquivo responde 400', async () => {
    const err = await browseFolder(join(root, 'arquivo.txt'), { home: root }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BrowseError);
    expect((err as BrowseError).status).toBe(400);
  });

  it('caminho relativo responde 400', async () => {
    const err = await browseFolder('relativo/pasta', { home: root }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BrowseError);
    expect((err as BrowseError).status).toBe(400);
  });

  it('vazio usa a home e ~ expande para a home', async () => {
    const vazio = await browseFolder(undefined, { home: root });
    expect(vazio.path).toBe(root);
    const til = await browseFolder('~', { home: root });
    expect(til.path).toBe(root);
    const sub = await browseFolder('~/beta', { home: root });
    expect(sub.path).toBe(join(root, 'beta'));
  });

  it('passa de BROWSE_LIMIT e marca truncated', async () => {
    const dir = join(root, 'muitas');
    await mkdir(dir);
    for (let i = 0; i < BROWSE_LIMIT + 1; i++) await mkdir(join(dir, `p${String(i).padStart(4, '0')}`));
    const r = await browseFolder(dir, { home: root });
    expect(r.truncated).toBe(true);
    expect(r.entries).toHaveLength(BROWSE_LIMIT);
  });
});
