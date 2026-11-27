import fs from 'node:fs';
import { TaskAttachment } from '../../shared/types';
import { detectRateLimit } from '../rateLimit';
import { ProviderRunner, RunRequest, RunResult } from './types';

function readAttachmentBase64(att: TaskAttachment): string | null {
  try {
    if (!fs.existsSync(att.path)) return null;
    // Cap inline API attachment reads at 15MB
    const stat = fs.statSync(att.path);
    if (stat.size > 15 * 1024 * 1024) return null;
    return fs.readFileSync(att.path).toString('base64');
  } catch {
    return null;
  }
}

function readTextAttachment(att: TaskAttachment): string | null {
  try {
    if (!fs.existsSync(att.path)) return null;
    const stat = fs.statSync(att.path);
    if (stat.size > 256 * 1024) return null;
    return fs.readFileSync(att.path, 'utf8');
  } catch {
    return null;
  }
}

export class ApiRunner implements ProviderRunner {
  async run(req: RunRequest): Promise<RunResult> {
    const { provider } = req.account;
    req.onStatus?.(`Connecting to ${req.account.name} (${req.account.model})...`);
    if (provider === 'anthropic-api') {
      return this.runAnthropic(req);
    }
    if (provider === 'gemini-api') {
      return this.runGemini(req);
    }
    return this.runOpenAICompatible(req);
  }

  private async runAnthropic(req: RunRequest): Promise<RunResult> {
    if (!req.account.apiKey) {
      return { ok: false, output: '', error: 'Missing Anthropic API key.' };
    }
    const base = (req.account.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
    const url = `${base}/v1/messages`;

    const contentBlocks: unknown[] = [];
    for (const att of req.attachments ?? []) {
      if (att.isImage) {
        const b64 = readAttachmentBase64(att);
        if (b64) {
          contentBlocks.push({
            type: 'image',
            source: { type: 'base64', media_type: att.mimeType, data: b64 },
          });
        }
      } else {
        const text = readTextAttachment(att);
        if (text) {
          contentBlocks.push({
            type: 'text',
            text: `Attached file (${att.name}):\n\`\`\`\n${text}\n\`\`\``,
          });
        }
      }
    }
    contentBlocks.push({ type: 'text', text: req.prompt });

    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: req.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': req.account.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: req.account.model,
          max_tokens: 4096,
          stream: true,
          messages: [{ role: 'user', content: contentBlocks }],
        }),
      });

      if (!res.ok) {
        return handleHttpError(res);
      }

      return await consumeSseStream(res, req.onChunk, (data) => {
        if (data?.type === 'content_block_delta' && data?.delta?.type === 'text_delta') {
          return String(data.delta.text ?? '');
        }
        return '';
      });
    } catch (err) {
      return handleFetchException(err);
    }
  }

  private async runGemini(req: RunRequest): Promise<RunResult> {
    if (!req.account.apiKey) {
      return { ok: false, output: '', error: 'Missing Google Gemini API key.' };
    }
    const base = (
      req.account.baseUrl || 'https://generativelanguage.googleapis.com'
    ).replace(/\/+$/, '');
    const url = `${base}/v1beta/models/${encodeURIComponent(req.account.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(req.account.apiKey)}`;

    const parts: unknown[] = [];
    for (const att of req.attachments ?? []) {
      if (att.isImage || att.mimeType === 'application/pdf') {
        const b64 = readAttachmentBase64(att);
        if (b64) {
          parts.push({ inlineData: { mimeType: att.mimeType, data: b64 } });
        }
      } else {
        const text = readTextAttachment(att);
        if (text) {
          parts.push({ text: `Attached file (${att.name}):\n\`\`\`\n${text}\n\`\`\`` });
        }
      }
    }
    parts.push({ text: req.prompt });

    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: req.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
        }),
      });

      if (!res.ok) {
        return handleHttpError(res);
      }

      return await consumeSseStream(res, req.onChunk, (data) => {
        const respParts = data?.candidates?.[0]?.content?.parts;
        if (!Array.isArray(respParts)) return '';
        return respParts.map((p: { text?: string }) => p.text ?? '').join('');
      });
    } catch (err) {
      return handleFetchException(err);
    }
  }

  private async runOpenAICompatible(req: RunRequest): Promise<RunResult> {
    const base = (req.account.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
    const url = `${base}/chat/completions`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (req.account.apiKey) {
      headers.authorization = `Bearer ${req.account.apiKey}`;
    }

    const hasAttachments = Boolean(req.attachments && req.attachments.length > 0);
    let content: unknown = req.prompt;
    if (hasAttachments) {
      const blocks: unknown[] = [];
      for (const att of req.attachments ?? []) {
        if (att.isImage) {
          const b64 = readAttachmentBase64(att);
          if (b64) {
            blocks.push({
              type: 'image_url',
              image_url: { url: `data:${att.mimeType};base64,${b64}` },
            });
          }
        } else {
          const text = readTextAttachment(att);
          if (text) {
            blocks.push({
              type: 'text',
              text: `Attached file (${att.name}):\n\`\`\`\n${text}\n\`\`\``,
            });
          }
        }
      }
      blocks.push({ type: 'text', text: req.prompt });
      content = blocks;
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: req.signal,
        headers,
        body: JSON.stringify({
          model: req.account.model,
          stream: true,
          messages: [{ role: 'user', content }],
        }),
      });

      if (!res.ok) {
        return handleHttpError(res);
      }

      return await consumeSseStream(res, req.onChunk, (data) => {
        return String(data?.choices?.[0]?.delta?.content ?? '');
      });
    } catch (err) {
      return handleFetchException(err);
    }
  }
}

async function handleHttpError(res: Response): Promise<RunResult> {
  const body = await res.text().catch(() => '');
  const limit = detectRateLimit(body, res.status, res.headers.get('retry-after'));
  if (limit.isRateLimited) {
    return {
      ok: false,
      output: '',
      rateLimited: true,
      rateLimitReason: limit.reason,
      retryAfterMs: limit.retryAfterMs,
      error: body || `HTTP ${res.status}`,
    };
  }
  return {
    ok: false,
    output: '',
    error: `HTTP ${res.status}: ${body.slice(0, 400) || res.statusText}`,
  };
}

function handleFetchException(err: unknown): RunResult {
  if (err instanceof Error && err.name === 'AbortError') {
    return { ok: false, output: '', cancelled: true, error: 'Cancelled by user' };
  }
  const msg = err instanceof Error ? err.message : String(err);
  return { ok: false, output: '', error: msg };
}

async function consumeSseStream(
  res: Response,
  onChunk: RunRequest['onChunk'],
  extractText: (parsed: any) => string
): Promise<RunResult> {
  if (!res.body) {
    return { ok: false, output: '', error: 'Empty response stream from provider.' };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullOutput = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const parsed = JSON.parse(payload);
        const text = extractText(parsed);
        if (text) {
          fullOutput += text;
          onChunk(text, 'stdout');
        }
      } catch {
        // Ignore partial or non-JSON keepalive frames
      }
    }
  }

  return { ok: true, output: fullOutput.trim() };
}
