// Modelo puro do campo "Assinatura" do Novo agente: opções a partir das contas do snapshot, escolha inicial e dicas.
import type { AccountInfo } from '../../../../shared/types';

export interface OpcaoAssinatura {
  id: string;
  provider: 'claude' | 'codex';
  short: string;
  nome: string;
  cor: string;
  /** 'Claude' | 'Codex' */
  fonte: string;
  /** Plano e/ou e-mail ('Max · fulano@x.com'); '' se nada. */
  detalhe: string;
  disponivel: boolean;
  motivo?: string;
}

/** Uma opção por conta, na ordem de entrada. Codex só roda no terminal interativo. */
export function opcoesAssinatura(contas: readonly AccountInfo[] | undefined, ptyAtivo: boolean): OpcaoAssinatura[] {
  if (!contas) return [];
  return contas.map((c) => {
    const provider = c.provider ?? 'claude';
    const semPty = provider === 'codex' && !ptyAtivo;
    const op: OpcaoAssinatura = {
      id: c.id,
      provider,
      short: c.short,
      nome: c.name,
      cor: c.color,
      fonte: provider === 'codex' ? 'Codex' : 'Claude',
      detalhe: [c.plan, c.email].filter(Boolean).join(' · '),
      disponivel: !semPty,
    };
    if (semPty) op.motivo = 'terminal interativo desligado';
    return op;
  });
}

/** A lembrada, se existir e estiver disponível; senão a primeira disponível; senão null. */
export function assinaturaInicial(opcoes: readonly OpcaoAssinatura[], lembrada: string | null): string | null {
  const lembrou = lembrada ? opcoes.find((o) => o.id === lembrada && o.disponivel) : undefined;
  return (lembrou ?? opcoes.find((o) => o.disponivel))?.id ?? null;
}

/** Dica do painel conforme a conta escolhida. */
export function dicaAssinatura(op: OpcaoAssinatura | undefined): string {
  if (op?.provider === 'codex') {
    return 'Abre o Codex num terminal aqui no Habblaud, na pasta escolhida e com este pedido como primeiro prompt. Sem anexos nem ditado.';
  }
  return 'Começa na hora uma sessão do Claude Code em segundo plano nesta conta; as permissões chegam aqui. Se a pasta não for conhecida pelo Claude Code, o pedido cai no app, que não leva a conta.';
}
