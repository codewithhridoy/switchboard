import fs from 'node:fs';
import path from 'node:path';
import { buildEnrichedPath, resolveExecutable } from './cliEnv';
import { spawnCliProcess } from './claudeCli';
import { ProviderRunner, RunRequest, RunResult } from './types';

export class GeminiCliRunner implements ProviderRunner {
  async run(req: RunRequest): Promise<RunResult> {
    const exe = resolveExecutable('gemini', req.account.cliPath);
    if (!exe) {
      return {
        ok: false,
        output: '',
        error:
          'Google Gemini CLI (`gemini`) is not installed. Install it with: npm install -g @google/gemini-cli',
      };
    }

    const args = ['-p', req.prompt];
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
      GEMINI_CLI_TRUST_WORKSPACE: 'true',
    };

    if (!req.account.useDefaultProfile && req.account.profileDir) {
      fs.mkdirSync(req.account.profileDir, { recursive: true });
      env.GEMINI_CLI_HOME = req.account.profileDir;
      env.XDG_CONFIG_HOME = path.join(req.account.profileDir, '.config');
    }

    return spawnCliProcess({
      exe,
      args,
      cwd: req.mode === 'coding' && req.workspaceDir ? req.workspaceDir : process.cwd(),
      env,
      signal: req.signal,
      onChunk: req.onChunk,
      providerLabel: 'Google Gemini CLI',
    });
  }
}
