import path from 'node:path';
import { buildEnrichedPath, resolveExecutable } from './cliEnv';
import { spawnNdjsonCliProcess } from './claudeCli';
import { parseAgyStreamLine } from './streamParsers';
import { ProviderRunner, RunRequest, RunResult } from './types';

function stepDownModelForFastMode(model: string): string {
  // Prefer low reasoning variant on fast/quick turns for ~3-5x lower latency
  if (/-(?:xhigh|high|medium)$/i.test(model)) {
    return model.replace(/-(?:xhigh|high|medium)$/i, '-low');
  }
  return model;
}

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

    const effectiveModel = req.fastMode
      ? stepDownModelForFastMode(req.account.model)
      : req.account.model;

    const args = [
      '-p',
      req.prompt,
      '--output-format',
      'stream-json',
      '--disable-slash-commands',
    ];
    if (effectiveModel) {
      args.push('--model', effectiveModel);
    }

    if (req.attachments && req.attachments.length > 0) {
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

    req.onStatus?.(`Starting Google AI Pro (${effectiveModel})...`);

    return spawnNdjsonCliProcess({
      exe,
      args,
      cwd: req.mode === 'coding' && req.workspaceDir ? req.workspaceDir : process.cwd(),
      env,
      signal: req.signal,
      onChunk: req.onChunk,
      onStatus: req.onStatus,
      parseLine: parseAgyStreamLine,
      providerLabel: 'Google Antigravity CLI (agy)',
    });
  }
}
