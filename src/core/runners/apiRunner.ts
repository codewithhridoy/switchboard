import { detectRateLimit } from '../rateLimit';
import { ProviderRunner, RunRequest, RunResult } from './types';

export class ApiRunner implements ProviderRunner {
  async run(req: RunRequest): Promise<RunResult> {
    const { provider } = req.account;
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
          messages: [{ role: 'user', content: req.prompt }],
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

    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: req.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
        }),
      });

      if (!res.ok) {
        return handleHttpError(res);
      }

      return await consumeSseStream(res, req.onChunk, (data) => {
        const parts = data?.candidates?.[0]?.content?.parts;
        if (!Array.isArray(parts)) return '';
        return parts.map((p: { text?: string }) => p.text ?? '').join('');
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

    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: req.signal,
        headers,
        body: JSON.stringify({
          model: req.account.model,
          stream: true,
          messages: [{ role: 'user', content: req.prompt }],
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
