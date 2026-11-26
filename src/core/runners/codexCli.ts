import fs from 'node:fs';
import { buildEnrichedPath, resolveExecutable } from './cliEnv';
import { spawnCliProcess } from './claudeCli';
import { ProviderRunner, RunRequest, RunResult } from './types';

export class CodexCliRunner implements ProviderRunner {
  async run(req: RunRequest): Promise<RunResult> {
    const exe = resolveExecutable('codex', req.account.cliPath);
    if (!exe) {
      return {
        ok: false,
        output: '',
        error:
          'OpenAI Codex CLI (`codex`) is not installed. Install it with: npm install -g @openai/codex',
      };
    }

    const args = ['exec', req.prompt];
    if (req.account.model) {
      args.push('-m', req.account.model);
    }
    if (req.account.extraArgs?.length) {
      args.push(...req.account.extraArgs);
    }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: buildEnrichedPath(),
      NO_COLOR: '1',
    };

    if (req.account.profileDir) {
      fs.mkdirSync(req.account.profileDir, { recursive: true });
      env.CODEX_HOME = req.account.profileDir;
    }

    return spawnCliProcess({
      exe,
      args,
      cwd: req.mode === 'coding' && req.workspaceDir ? req.workspaceDir : process.cwd(),
      env,
      signal: req.signal,
      onChunk: req.onChunk,
      providerLabel: 'OpenAI Codex CLI',
    });
  }
}
