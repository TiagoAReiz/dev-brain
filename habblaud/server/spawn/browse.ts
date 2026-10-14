// Navegador de pastas do "Novo agente": lista as subpastas de um caminho deste computador, para o usuário escolher uma.
// Só pastas (sem arquivos). Node puro: o navegador não entrega caminho absoluto, por isso quem lista é o servidor.

import { homedir } from 'node:os';
import { isAbsolute, join, dirname, resolve } from 'node:path';
import { promises as fs } from 'node:fs';
import { tr } from '../../shared/i18n';

export interface BrowseEntry {
  name: string;
  path: string;
}

export interface BrowseResult {
  /** Pasta listada, absoluta e normalizada. */
  path: string;
  /** Pasta acima; null na raiz. */
  parent: string | null;
  /** os.homedir(). */
  home: string;
  /** Só subpastas (symlink para pasta conta), por nome sem diferenciar maiúsculas. */
  entries: BrowseEntry[];
  /** true se passou de BROWSE_LIMIT. */
  truncated: boolean;
}

export const BROWSE_LIMIT = 500;

export class BrowseError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'BrowseError';
  }
}

/** Lista as subpastas de `raw` (vazio = home). `~` e `~/x` expandem para a home. */
export async function browseFolder(
  raw: string | undefined,
  opts: { home?: string; hidden?: boolean } = {},
): Promise<BrowseResult> {
  const home = opts.home ?? homedir();
  const hidden = opts.hidden ?? false;
  const p = raw?.trim() ?? '';
  let target: string;
  if (!p) target = home;
  else if (p === '~') target = home;
  else if (p.startsWith('~/') || p.startsWith('~\\')) target = join(home, p.slice(2));
  else if (isAbsolute(p)) target = p;
  else throw new BrowseError(400, tr('caminho precisa ser absoluto'));
  const path = resolve(target);

  let stat;
  try {
    stat = await fs.stat(path);
  } catch (err) {
    throw toBrowseError(err);
  }
  if (!stat.isDirectory()) throw new BrowseError(400, tr('o caminho não é uma pasta'));

  let dirents;
  try {
    dirents = await fs.readdir(path, { withFileTypes: true });
  } catch (err) {
    throw toBrowseError(err);
  }

  const entries: BrowseEntry[] = [];
  for (const d of dirents) {
    if (!hidden && d.name.startsWith('.')) continue;
    const full = join(path, d.name);
    if (d.isDirectory()) {
      entries.push({ name: d.name, path: full });
    } else if (d.isSymbolicLink() && (await isDirectoryOrNull(full))) {
      entries.push({ name: d.name, path: full });
    }
  }
  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const truncated = entries.length > BROWSE_LIMIT;
  const parent = dirname(path);
  return {
    path,
    parent: parent === path ? null : parent,
    home,
    entries: truncated ? entries.slice(0, BROWSE_LIMIT) : entries,
    truncated,
  };
}

/** true se o caminho aponta para pasta; false se não; ignora erros (link quebrado, sem permissão). */
async function isDirectoryOrNull(full: string): Promise<boolean> {
  try {
    return (await fs.stat(full)).isDirectory();
  } catch {
    return false;
  }
}

function toBrowseError(err: unknown): BrowseError {
  const code = (err as NodeJS.ErrnoException)?.code;
  if (code === 'ENOENT' || code === 'ENOTDIR') return new BrowseError(404, tr('pasta não existe'));
  if (code === 'EACCES' || code === 'EPERM') return new BrowseError(403, tr('sem permissão para ler esta pasta'));
  throw err;
}
