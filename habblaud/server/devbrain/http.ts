import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError, readJson, sendJson } from '../http/app';
import { ptyRequestProblem } from '../http/pty';
import { PtyError } from '../pty/manager';
import { DiaService } from './dia';
import { DiaError } from './project';

export function createDevbrainRoutes(service: DiaService, options: { isRemote?: (req: IncomingMessage) => boolean } = {}): (req: IncomingMessage, res: ServerResponse, path: string) => void {
  const handle = async (req: IncomingMessage, res: ServerResponse, path: string) => {
    if (options.isRemote?.(req)) throw new DiaError(403, 'o ciclo do dia só funciona no próprio computador');
    const problem = ptyRequestProblem(req);
    if (problem) throw new DiaError(403, problem);
    service.available();
    const route = path.slice('/api/devbrain/'.length);
    if (!['repos', 'iniciar', 'resumo', 'finalizar'].includes(route)) throw new DiaError(404, 'rota desconhecida');
    const expected = route === 'repos' || route === 'resumo' ? 'GET' : 'POST';
    if (req.method !== expected) {
      res.setHeader('Allow', expected);
      throw new DiaError(405, 'método não permitido');
    }
    if (route === 'repos') return sendJson(res, 200, await service.repos());
    if (route === 'resumo') return sendJson(res, 200, await service.resumo());
    const body = await readJson(req, 16 * 1024);
    if (route === 'iniciar') return sendJson(res, 201, await service.iniciar(body));
    if (body === null || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) throw new DiaError(400, 'finalizar espera um objeto vazio {}');
    const report = await service.finalizar();
    // finish já pode ter ocorrido quando um pedido repetido recebe relatório guardado.
    if (res.destroyed) { service.scheduleShutdown(); return; }
    res.once('finish', () => service.scheduleShutdown());
    res.once('close', () => service.scheduleShutdown());
    sendJson(res, 200, report);
  };
  return (req, res, path) => {
    handle(req, res, path).catch((err: unknown) => {
      if (res.headersSent) { res.destroy(); return; }
      const known = err instanceof DiaError || err instanceof PtyError || err instanceof HttpError;
      sendJson(res, known ? err.status : 500, { error: known ? err.message : 'não consegui concluir a operação; confira o dev-brain e tente novamente' });
    });
  };
}
