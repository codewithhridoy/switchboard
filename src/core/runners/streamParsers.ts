import { RunUsage } from './types';

export interface ParsedStreamDelta {
  textDelta?: string;
  statusText?: string;
  finalText?: string;
  usage?: RunUsage;
  errorText?: string;
  permissionDenied?: boolean;
}

/**
 * Parses a single NDJSON line emitted by `claude -p --output-format stream-json --verbose --include-partial-messages`.
 */
export function parseClaudeStreamLine(line: string): ParsedStreamDelta | null {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith('{')) return null;

  let obj: any;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return null;
  }

  // Real-time partial token & thinking deltas
  if (obj.type === 'stream_event' && obj.event) {
    const ev = obj.event;
    if (ev.type === 'content_block_start') {
      if (ev.content_block?.type === 'thinking') {
        return { statusText: 'Thinking...' };
      }
      if (ev.content_block?.type === 'tool_use') {
        return { statusText: `Running tool: ${ev.content_block.name || 'tool'}...` };
      }
      if (ev.content_block?.type === 'text') {
        return { statusText: 'Streaming response...' };
      }
    }
    if (ev.type === 'content_block_delta' && ev.delta) {
      if (ev.delta.type === 'text_delta' && typeof ev.delta.text === 'string') {
        return { textDelta: ev.delta.text };
      }
      if (ev.delta.type === 'thinking_delta') {
        const est = ev.delta.estimated_tokens;
        return {
          statusText: est ? `Thinking (${est} tokens)...` : 'Thinking...',
        };
      }
    }
    return null;
  }

  if (obj.type === 'system') {
    if (obj.subtype === 'status' && obj.status === 'requesting') {
      return { statusText: 'Connecting to Claude...' };
    }
    if (obj.subtype === 'thinking_tokens' && obj.estimated_tokens) {
      return { statusText: `Thinking (${obj.estimated_tokens} tokens)...` };
    }
    return null;
  }

  if (obj.type === 'result') {
    const usageObj = obj.usage;
    const usage: RunUsage | undefined = usageObj
      ? {
          inputTokens: Number(usageObj.input_tokens ?? 0),
          outputTokens: Number(usageObj.output_tokens ?? 0),
          cacheTokens:
            Number(usageObj.cache_read_input_tokens ?? 0) +
            Number(usageObj.cache_creation_input_tokens ?? 0),
        }
      : undefined;

    if (obj.is_error) {
      return {
        errorText: typeof obj.result === 'string' ? obj.result : 'Claude CLI returned an error',
        usage,
      };
    }

    const finalText = typeof obj.result === 'string' ? obj.result : undefined;
    if (
      Array.isArray(obj.permission_denials) &&
      obj.permission_denials.length > 0 &&
      (!finalText || !finalText.trim())
    ) {
      const deniedTools = Array.from(
        new Set(
          obj.permission_denials
            .map((d: any) => d?.tool_name || d?.tool || d?.action || 'tool')
            .filter(Boolean)
        )
      ).join(', ');
      return {
        errorText: `Permission denied in headless mode for: ${deniedTools || 'tool approval'}. Switch Permissions to "Full Auto (Edits + Shell)" and click Retry.`,
        permissionDenied: true,
        usage,
      };
    }

    return {
      finalText,
      usage,
    };
  }

  return null;
}

/**
 * Parses a single NDJSON line emitted by `agy -p --output-format stream-json`.
 */
export function parseAgyStreamLine(line: string): ParsedStreamDelta | null {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith('{')) return null;

  let obj: any;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (obj.event === 'init') {
    const model = obj.init?.model ? ` (${obj.init.model})` : '';
    return { statusText: `Connected${model} · Thinking...` };
  }

  if (obj.event === 'step_update' && obj.step_update) {
    const su = obj.step_update;
    if (typeof su.text_delta === 'string' && su.text_delta.length > 0) {
      return {
        textDelta: su.text_delta,
        statusText: su.state === 'ACTIVE' ? 'Streaming response...' : undefined,
      };
    }
    if (su.step_type === 'tool') {
      const toolName = su.tool_name || su.tool_info?.name || 'tool';
      if (su.state === 'ACTIVE') {
        const cmd = su.tool_info?.parameters?.CommandLine;
        if (typeof cmd === 'string' && cmd.trim()) {
          const compact = cmd.trim().replace(/\s+/g, ' ').slice(0, 64);
          return { statusText: `Running: ${compact}${cmd.trim().length > 64 ? '…' : ''}` };
        }
        return { statusText: `Running tool: ${toolName}...` };
      }
      if (su.state === 'ERROR') {
        const errMsg = su.tool_info?.error?.message;
        if (typeof errMsg === 'string' && /permission/i.test(errMsg)) {
          return { statusText: `Tool permission blocked (${toolName})...` };
        }
      }
      return null;
    }
    if (su.step_type && su.step_type !== 'user_input' && su.state === 'ACTIVE') {
      const niceType = String(su.step_type).replace(/_/g, ' ');
      return {
        statusText:
          su.step_type === 'agent_response'
            ? 'Thinking...'
            : `Working: ${niceType}...`,
      };
    }
    return null;
  }

  if (obj.event === 'result' && obj.result) {
    const r = obj.result;
    const usageObj = r.usage;
    const usage: RunUsage | undefined = usageObj
      ? {
          inputTokens: Number(usageObj.input_tokens ?? 0),
          outputTokens: Number(usageObj.output_tokens ?? 0),
          cacheTokens: Number(usageObj.cache_read_tokens ?? 0),
        }
      : undefined;

    if (r.status && String(r.status).toUpperCase() !== 'SUCCESS') {
      return {
        errorText: r.error || r.response || `Antigravity CLI failed (${r.status})`,
        usage,
      };
    }

    const responseText = typeof r.response === 'string' ? r.response : undefined;
    if (
      Array.isArray(r.denied_actions) &&
      r.denied_actions.length > 0 &&
      (!responseText || !responseText.trim())
    ) {
      const deniedLabels = Array.from(
        new Set(
          r.denied_actions
            .map((d: any) => {
              const label = d?.display_name || d?.action;
              if (d?.display_name && d?.action && d.display_name.toLowerCase() !== d.action.toLowerCase()) {
                return `${d.display_name} (${d.action})`;
              }
              return label || 'tool';
            })
            .filter(Boolean)
        )
      ).join(', ');
      return {
        errorText: `Permission denied in headless mode for: ${deniedLabels}. Switch Permissions to "Full Auto (Edits + Shell)" and click Retry so the agent can run shell commands.`,
        permissionDenied: true,
        usage,
      };
    }

    return {
      finalText: responseText,
      usage,
    };
  }

  return null;
}
