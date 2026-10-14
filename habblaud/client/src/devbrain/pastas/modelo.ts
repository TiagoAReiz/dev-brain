// Modelo puro do navegador de pastas: migalhas do caminho, atalhos e URL da listagem.

export interface Migalha {
  nome: string;
  caminho: string;
}

/** Migalhas clicáveis do caminho (POSIX ou Windows). Barra final é ignorada. */
export function migalhas(caminho: string): Migalha[] {
  const win = /^[A-Za-z]:/.test(caminho);
  const sep = win ? '\\' : '/';
  const resto = win ? caminho.slice(2) : caminho;
  const partes = resto.split(/[\\/]+/).filter(Boolean);

  // raiz: 'C:\' no Windows, '/' no POSIX
  let atual = win ? `${caminho.slice(0, 2)}${sep}` : '/';
  const saida: Migalha[] = [{ nome: win ? caminho.slice(0, 2) : '/', caminho: atual }];
  for (const parte of partes) {
    atual = atual.endsWith(sep) ? `${atual}${parte}` : `${atual}${sep}${parte}`;
    saida.push({ nome: parte, caminho: atual });
  }
  return saida;
}

/** Atalhos fixos: a própria home e a pasta workfolder dentro dela. */
export function atalhos(home: string): { nome: string; caminho: string }[] {
  const sep = home.includes('\\') && !home.includes('/') ? '\\' : '/';
  const base = home.endsWith(sep) ? home : `${home}${sep}`;
  return [
    { nome: 'Home', caminho: home },
    { nome: 'workfolder', caminho: `${base}workfolder` },
  ];
}

/** URL do GET /api/spawn/browse. Sem caminho não envia `path`; `hidden=1` só se ocultas. */
export function urlNavegar(caminho: string | undefined, ocultas: boolean): string {
  const params: string[] = [];
  if (caminho) params.push(`path=${encodeURIComponent(caminho)}`);
  if (ocultas) params.push('hidden=1');
  return params.length ? `/api/spawn/browse?${params.join('&')}` : '/api/spawn/browse';
}
