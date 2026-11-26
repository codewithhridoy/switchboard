import { spawn } from 'node:child_process';
import { buildEnrichedPath, resolveExecutable } from './cliEnv';
import { spawnCliProcess } from './claudeCli';
import { ProviderRunner, RunRequest, RunResult } from './types';

export class AgyCliRunner implements ProviderRunner {
  async run(req: RunRequest): Promise<RunResult> {
    const exe = resolveExecutable('agy', req.account.cliPath);
    if (!exe) {
      return {
        ok: false,
        output: '',
        error:
          'Google Antigravity CLI (`agy`) is not installed. Install it from https://antigravity.google',
      };
    }

    const args = ['-p', req.prompt, '--output-format', 'text'];
    if (req.account.model) {
      args.push('--model', req.account.model);
    }
    if (req.account.extraArgs?.length) {
      args.push(...req.account.extraArgs);
    }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: buildEnrichedPath(),
      NO_COLOR: '1',
    };

    return spawnCliProcess({
      exe,
      args,
      cwd: req.mode === 'coding' && req.workspaceDir ? req.workspaceDir : process.cwd(),
      env,
      signal: req.signal,
      onChunk: req.onChunk,
      providerLabel: 'Google Antigravity CLI (agy)',
    });
  }
}

// Keep unused spawn import clean if needed
void spawn;
