import type { SupportPrincipal } from './access-auth.js';

export async function auditSupportTool<T>(
  env: Pick<Env, 'DB'>,
  principal: SupportPrincipal,
  toolName: string,
  execute: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  try {
    const result = await execute();
    await record(env, principal, toolName, 'completed', null, Date.now() - started);
    return result;
  } catch (error) {
    const errorCode = error instanceof Error ? error.name : 'UnknownError';
    try {
      await record(env, principal, toolName, 'failed', errorCode, Date.now() - started);
    } catch (auditError) {
      console.error(JSON.stringify({
        message: 'support_mcp_failure_audit_failed',
        toolName,
        errorName: auditError instanceof Error ? auditError.name : 'UnknownError',
      }));
    }
    throw error;
  }
}

async function record(
  env: Pick<Env, 'DB'>,
  principal: SupportPrincipal,
  toolName: string,
  outcome: 'completed' | 'failed',
  errorCode: string | null,
  durationMs: number,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO operational_events (
       id, occurred_at, category, severity, actor_type, actor_identifier,
       action, method, route, outcome, resource_type, resource_id,
       error_code, duration_ms, details_json
     ) VALUES (?1, ?2, 'api', ?3, 'operator', ?4, ?5, 'POST', '/mcp',
       ?6, 'mcp-tool', ?7, ?8, ?9, ?10)`,
  ).bind(
    crypto.randomUUID(),
    new Date().toISOString(),
    outcome === 'failed' ? 'warning' : 'info',
    principal.identifier,
    `mcp.support.${toolName}`,
    outcome,
    toolName,
    errorCode,
    Math.max(0, durationMs),
    JSON.stringify({ principalEmail: principal.email }),
  ).run();
}
