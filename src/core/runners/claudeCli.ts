import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { detectRateLimit } from '../rateLimit';
import { buildEnrichedPath, resolveExecutable } from './cliEnv';
import { ProviderRunner, RunRequest, RunResult } from './types';

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

    const args = ['-p', req.prompt, '--output-format', 'text'];
    if (req.account.model) {
      args.push('--model', req.account.model);
    }
    if (req.account.effort) {
      args.push('--effort', req.account.effort);
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

    return spawnCliProcess({
      exe,
      args,
      cwd: req.mode === 'coding' && req.workspaceDir ? req.workspaceDir : process.cwd(),
      env,
      signal: req.signal,
      onChunk: req.onChunk,
      providerLabel: 'Claude Code CLI',
    });
  }
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
