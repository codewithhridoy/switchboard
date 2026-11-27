import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { detectRateLimit } from '../rateLimit';
import { buildEnrichedPath, resolveExecutable } from './cliEnv';
import { ParsedStreamDelta, parseClaudeStreamLine } from './streamParsers';
import { ProviderRunner, RunRequest, RunResult, RunUsage } from './types';

export class ClaudeCliRunner implements ProviderRunner {
  async run(req: RunRequest): Promise<RunResult> {
    const exe = resolveExecutable('claude', req.account.cliPath);
    if (!exe) {
      return {
        ok: false,
        output: '',
        error:
          'Claude Code CLI (`claude`) is not installed or not on PATH. Install it with: npm install -g @anthropic-ai/claude-code',
      };
    }

    const hasAttachments = Boolean(req.attachments && req.attachments.length > 0);
    const args = [
      '-p',
      req.prompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
    ];
    if (req.account.model) {
      args.push('--model', req.account.model);
    }
    const effectiveEffort = req.fastMode ? 'low' : req.account.effort;
    if (effectiveEffort) {
      args.push('--effort', effectiveEffort);
    }

    // Fast-path flags: skip slow MCP server cold boot & skill scans on General/Fast chats
    if (req.fastMode || req.mode === 'general') {
      args.push('--strict-mcp-config', '--disable-slash-commands');
      if (req.mode === 'general' && !hasAttachments) {
        args.push('--tools', '');
      }
    }

    // Grant read access to attachment directories so Claude can inspect pasted images/files immediately
    if (hasAttachments && req.attachments) {
      const dirs = Array.from(new Set(req.attachments.map((a) => path.dirname(a.path))));
      for (const d of dirs) {
        args.push('--add-dir', d);
      }
    }

    if (req.account.extraArgs?.length) {
      args.push(...req.account.extraArgs);
    }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: buildEnrichedPath(),
      NO_COLOR: '1',
    };

    if (!req.account.useDefaultProfile && req.account.profileDir) {
      fs.mkdirSync(req.account.profileDir, { recursive: true });
      env.CLAUDE_CONFIG_DIR = req.account.profileDir;
    }

    req.onStatus?.(`Starting Claude (${req.account.model})...`);

    return spawnNdjsonCliProcess({
      exe,
      args,
      cwd: req.mode === 'coding' && req.workspaceDir ? req.workspaceDir : process.cwd(),
      env,
      signal: req.signal,
      onChunk: req.onChunk,
      onStatus: req.onStatus,
      parseLine: parseClaudeStreamLine,
      providerLabel: 'Claude Code CLI',
    });
  }
}

export function spawnNdjsonCliProcess(opts: {
  exe: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal: AbortSignal;
  onChunk: (chunk: string, stream: 'stdout' | 'stderr' | 'system') => void;
  onStatus?: (statusText: string) => void;
  parseLine: (line: string) => ParsedStreamDelta | null;
  providerLabel: string;
}): Promise<RunResult> {
  return new Promise((resolve) => {
    let rawStdout = '';
    let stderr = '';
    let streamedText = '';
    let finalText = '';
    let errorText = '';
    let usage: RunUsage | undefined;
    let lineBuffer = '';
    let settled = false;

    const child = spawn(opts.exe, opts.args, {
      cwd: fs.existsSync(opts.cwd) ? opts.cwd : process.cwd(),
      env: opts.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(opts.exe),
    });

    const onAbort = () => {
      if (!child.killed) {
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
        }, 1500);
      }
      if (!settled) {
        settled = true;
        resolve({
          ok: false,
          output: streamedText || finalText,
          cancelled: true,
          error: 'Cancelled by user',
        });
      }
    };

    if (opts.signal.aborted) {
      onAbort();
      return;
    }
    opts.signal.addEventListener('abort', onAbort, { once: true });

    const handleLine = (line: string) => {
      const parsed = opts.parseLine(line);
      if (!parsed) return;
      if (parsed.statusText) {
        opts.onStatus?.(parsed.statusText);
      }
      if (parsed.textDelta) {
        streamedText += parsed.textDelta;
        opts.onChunk(parsed.textDelta, 'stdout');
      }
      if (parsed.finalText) {
        finalText = parsed.finalText;
      }
      if (parsed.usage) {
        usage = parsed.usage;
      }
      if (parsed.errorText) {
        errorText = parsed.errorText;
      }
    };

    child.stdout.on('data', (buf: Buffer) => {
      const text = buf.toString('utf8');
      rawStdout += text;
      lineBuffer += text;
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop() ?? '';
      for (const l of lines) {
        handleLine(l);
      }
    });

    child.stderr.on('data', (buf: Buffer) => {
      const text = buf.toString('utf8');
      stderr += text;
    });

    child.on('error', (err) => {
      opts.signal.removeEventListener('abort', onAbort);
      if (settled) return;
      settled = true;
      resolve({
        ok: false,
        output: streamedText,
        error: `Failed to launch ${opts.providerLabel}: ${err.message}`,
      });
    });

    child.on('close', (code) => {
      opts.signal.removeEventListener('abort', onAbort);
      if (lineBuffer.trim()) {
        handleLine(lineBuffer);
      }
      if (settled) return;
      settled = true;

      // If CLI produced finalText without partial deltas, emit it now
      if (!streamedText && finalText) {
        streamedText = finalText;
        opts.onChunk(finalText, 'stdout');
      }

      const output = (streamedText || finalText).trim();
      const diagnosticText = `${errorText}\n${stderr}\n${rawStdout}`;
      const limitCheck = detectRateLimit(diagnosticText);

      if (code === 0 && !errorText && !limitCheck.isRateLimited) {
        resolve({ ok: true, output, usage });
        return;
      }

      if (limitCheck.isRateLimited) {
        resolve({
          ok: false,
          output,
          usage,
          rateLimited: true,
          rateLimitReason: limitCheck.reason,
          retryAfterMs: limitCheck.retryAfterMs,
          error: errorText || stderr.trim() || limitCheck.reason || 'Rate limit reached',
        });
        return;
      }

      const cleanFallback = (errorText || stderr.trim() || rawStdout.trim()).slice(0, 320);
      resolve({
        ok: false,
        output,
        usage,
        error: cleanFallback || `${opts.providerLabel} exited with code ${code ?? 'unknown'}`,
      });
    });
  });
}

export function spawnCliProcess(opts: {
  exe: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal: AbortSignal;
  onChunk: (chunk: string, stream: 'stdout' | 'stderr' | 'system') => void;
  providerLabel: string;
}): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const child = spawn(opts.exe, opts.args, {
      cwd: fs.existsSync(opts.cwd) ? opts.cwd : process.cwd(),
      env: opts.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(opts.exe),
    });

    const onAbort = () => {
      if (!child.killed) {
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
        }, 1500);
      }
      if (!settled) {
        settled = true;
        resolve({
          ok: false,
          output: stdout,
          cancelled: true,
          error: 'Cancelled by user',
        });
      }
    };

    if (opts.signal.aborted) {
      onAbort();
      return;
    }
    opts.signal.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (buf: Buffer) => {
      const text = buf.toString('utf8');
      stdout += text;
      opts.onChunk(text, 'stdout');
    });

    child.stderr.on('data', (buf: Buffer) => {
      const text = buf.toString('utf8');
      stderr += text;
      opts.onChunk(text, 'stderr');
    });

    child.on('error', (err) => {
      opts.signal.removeEventListener('abort', onAbort);
      if (settled) return;
      settled = true;
      resolve({
        ok: false,
        output: stdout,
        error: `Failed to launch ${opts.providerLabel}: ${err.message}`,
      });
    });

    child.on('close', (code) => {
      opts.signal.removeEventListener('abort', onAbort);
      if (settled) return;
      settled = true;

      const combined = `${stderr}\n${stdout}`;
      const limitCheck = detectRateLimit(combined);

      if (code === 0 && !limitCheck.isRateLimited) {
        resolve({ ok: true, output: stdout.trim() });
        return;
      }

      if (limitCheck.isRateLimited) {
        resolve({
          ok: false,
          output: stdout.trim(),
          rateLimited: true,
          rateLimitReason: limitCheck.reason,
          retryAfterMs: limitCheck.retryAfterMs,
          error: stderr.trim() || limitCheck.reason || 'Rate limit reached',
        });
        return;
      }

      const errorDetail = (stderr.trim() || stdout.trim()).slice(0, 320);
      resolve({
        ok: false,
        output: stdout.trim(),
        error:
          errorDetail ||
          `${opts.providerLabel} exited with code ${code ?? 'unknown'}`,
      });
    });
  });
}
