import { SubtaskActivityStep } from '../../shared/types';
import { RunUsage } from './types';

export type ParsedActivityStep = Omit<SubtaskActivityStep, 'startedAt'>;

export interface ParsedStreamDelta {
  textDelta?: string;
  thinkingDelta?: string;
  statusText?: string;
  activityStep?: ParsedActivityStep;
  finalText?: string;
  usage?: RunUsage;
  errorText?: string;
  permissionDenied?: boolean;
}

function compactPath(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  const parts = raw.trim().replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.length <= 3 ? parts.join('/') : parts.slice(-3).join('/');
}

function summarizeToolAction(toolName: string, params: Record<string, any> | undefined): {
  label: string;
  detail?: string;
} {
  const lower = toolName.toLowerCase();
  const cmd = params?.CommandLine ?? params?.command;
  if (typeof cmd === 'string' && cmd.trim()) {
    const clean = cmd.trim().replace(/\s+/g, ' ');
    return {
      label: `Run: ${clean.slice(0, 80)}${clean.length > 80 ? '…' : ''}`,
    };
  }

  const filePath =
    params?.TargetFile ??
    params?.AbsolutePath ??
    params?.Path ??
    params?.file_path ??
    params?.path ??
    params?.DirectoryPath ??
    params?.SearchPath;
  const shortPath = compactPath(filePath);

  if (lower.includes('read') || lower.includes('view_file')) {
    return { label: shortPath ? `Read ${shortPath}` : `Read file` };
  }
  if (lower.includes('write')) {
    return { label: shortPath ? `Write ${shortPath}` : `Write file` };
  }
  if (lower.includes('edit') || lower.includes('replace')) {
    return { label: shortPath ? `Edit ${shortPath}` : `Edit file` };
  }
  if (lower.includes('list_dir') || lower.includes('find') || lower.includes('glob')) {
    const pattern = params?.Pattern ?? params?.pattern;
    return {
      label: shortPath
        ? `Explore ${shortPath}`
        : typeof pattern === 'string'
          ? `Find ${pattern}`
          : `List files`,
    };
  }
  if (lower.includes('grep') || lower.includes('search')) {
    const query = params?.Query ?? params?.pattern ?? params?.query;
    return {
      label:
        typeof query === 'string' && query.trim()
          ? `Search "${query.trim().slice(0, 48)}"${shortPath ? ` in ${shortPath}` : ''}`
          : `Search codebase`,
    };
  }

  return {
    label: shortPath ? `${toolName}: ${shortPath}` : `Tool: ${toolName}`,
  };
}

function summarizeToolOutput(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(
      (l) =>
        l &&
        !/^(?:Created At|Completed At|Command output):/i.test(l)
    );
  if (lines.length === 0) return undefined;
  const first = lines[0];
  return first.length > 110 ? `${first.slice(0, 107)}…` : first;
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
        const name = ev.content_block.name || 'tool';
        const stepId = `claude-tool-${ev.content_block.id || ev.index || Date.now()}`;
        return {
          statusText: `Running tool: ${name}...`,
          activityStep: {
            id: stepId,
            kind: 'tool',
            label: `Running ${name}...`,
            status: 'running',
          },
        };
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
        const thought = typeof ev.delta.thinking === 'string' ? ev.delta.thinking : undefined;
        const est = ev.delta.estimated_tokens;
        return {
          thinkingDelta: thought,
          statusText: est ? `Thinking (${est} tokens)...` : 'Thinking...',
        };
      }
    }
    return null;
  }

  // Complete assistant tool_use blocks carry the exact file paths / commands
  if (obj.type === 'assistant' && Array.isArray(obj.message?.content)) {
    const toolBlocks = obj.message.content.filter((b: any) => b?.type === 'tool_use');
    if (toolBlocks.length > 0) {
      const lastTool = toolBlocks[toolBlocks.length - 1];
      const summary = summarizeToolAction(lastTool.name || 'tool', lastTool.input);
      return {
        statusText: summary.label,
        activityStep: {
          id: `claude-tool-${lastTool.id || 'active'}`,
          kind: 'tool',
          label: summary.label,
          detail: summary.detail,
          status: 'running',
        },
      };
    }
  }

  // Tool results mark tool steps as done or error
  if (obj.type === 'user' && Array.isArray(obj.message?.content)) {
    const results = obj.message.content.filter((b: any) => b?.type === 'tool_result');
    if (results.length > 0) {
      const lastRes = results[results.length - 1];
      const textContent =
        typeof lastRes.content === 'string'
          ? lastRes.content
          : Array.isArray(lastRes.content)
            ? lastRes.content.map((c: any) => c?.text || '').join('\n')
            : '';
      return {
        activityStep: {
          id: `claude-tool-${lastRes.tool_use_id || 'active'}`,
          kind: 'tool',
          label: '',
          detail: summarizeToolOutput(textContent),
          status: lastRes.is_error ? 'error' : 'done',
        },
      };
    }
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

    return { finalText, usage };
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
    return {
      statusText: `Connected${model} · Thinking...`,
      activityStep: {
        id: 'agy-init',
        kind: 'info',
        label: `Connected${model}`,
        status: 'done',
      },
    };
  }

  if (obj.event === 'step_update' && obj.step_update) {
    const su = obj.step_update;
    const stepId = `agy-step-${su.step_index ?? 'x'}`;

    if (typeof su.thinking_delta === 'string' && su.thinking_delta.length > 0) {
      return {
        thinkingDelta: su.thinking_delta,
        statusText: 'Thinking...',
      };
    }

    if (typeof su.text_delta === 'string' && su.text_delta.length > 0) {
      return {
        textDelta: su.text_delta,
        statusText: su.state === 'ACTIVE' ? 'Streaming response...' : undefined,
      };
    }

    if (su.step_type === 'tool') {
      const toolName = su.tool_name || su.tool_info?.name || 'tool';
      const summary = summarizeToolAction(toolName, su.tool_info?.parameters);
      const durationSec =
        typeof su.duration_seconds === 'number'
          ? Number(su.duration_seconds.toFixed(1))
          : undefined;

      if (su.state === 'ACTIVE') {
        return {
          statusText: summary.label,
          activityStep: {
            id: stepId,
            kind: 'tool',
            label: summary.label,
            detail: summary.detail,
            status: 'running',
          },
        };
      }
      if (su.state === 'DONE') {
        return {
          activityStep: {
            id: stepId,
            kind: 'tool',
            label: summary.label,
            detail: summarizeToolOutput(su.tool_info?.output) ?? summary.detail,
            status: 'done',
            durationSec,
          },
        };
      }
      if (su.state === 'ERROR') {
        const errMsg = su.tool_info?.error?.message;
        return {
          statusText:
            typeof errMsg === 'string' && /permission/i.test(errMsg)
              ? `Tool permission blocked (${toolName})...`
              : `Tool error (${toolName})`,
          activityStep: {
            id: stepId,
            kind: 'tool',
            label: summary.label,
            detail: typeof errMsg === 'string' ? errMsg.slice(0, 120) : 'Tool failed',
            status: 'error',
            durationSec,
          },
        };
      }
      return null;
    }

    if (su.step_type === 'agent_response' && su.state === 'ACTIVE') {
      return { statusText: 'Thinking...' };
    }
    if (su.step_type && su.step_type !== 'user_input' && su.state === 'ACTIVE') {
      const niceType = String(su.step_type).replace(/_/g, ' ');
      return { statusText: `Working: ${niceType}...` };
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
              if (
                d?.display_name &&
                d?.action &&
                d.display_name.toLowerCase() !== d.action.toLowerCase()
              ) {
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

    return { finalText: responseText, usage };
  }

  return null;
}
