import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { CliHealthInfo, ProviderKind } from '../../shared/types';

const execFileAsync = promisify(execFile);

/**
 * Builds an enriched PATH so Electron desktop apps launched from macOS Finder / Dock
 * can still find CLIs installed via Homebrew, nvm, npm global, or ~/.local/bin.
 */
export function buildEnrichedPath(basePath = process.env.PATH ?? ''): string {
  const home = os.homedir();
  const sep = process.platform === 'win32' ? ';' : ':';
  const extras: string[] = [];

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
    const localAppData = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');
    extras.push(
      path.join(appData, 'npm'),
      path.join(localAppData, 'Programs', 'nodejs'),
      path.join(home, '.local', 'bin')
    );
  } else {
    extras.push(
      path.join(home, '.local', 'bin'),
      path.join(home, '.npm-global', 'bin'),
      path.join(home, '.pnpm'),
      path.join(home, 'Library', 'pnpm'),
      '/opt/homebrew/bin',
      '/opt/homebrew/sbin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin'
    );

    // Include latest nvm node bin if present
    const nvmVersions = path.join(home, '.nvm', 'versions', 'node');
    try {
      if (fs.existsSync(nvmVersions)) {
        const dirs = fs
          .readdirSync(nvmVersions)
          .filter((d) => d.startsWith('v'))
          .sort()
          .reverse();
        for (const d of dirs.slice(0, 3)) {
          extras.push(path.join(nvmVersions, d, 'bin'));
        }
      }
    } catch {
      // Ignore unreadable nvm directory
    }
  }

  const seen = new Set<string>();
  const combined: string[] = [];
  for (const part of [...basePath.split(sep), ...extras]) {
    if (!part) continue;
    if (!seen.has(part)) {
      seen.add(part);
      combined.push(part);
    }
  }
  return combined.join(sep);
}

export function resolveExecutable(binary: string, customPath?: string): string | null {
  if (customPath && fs.existsSync(customPath)) {
    return customPath;
  }

  const envPath = buildEnrichedPath();
  const sep = process.platform === 'win32' ? ';' : ':';
  const exts =
    process.platform === 'win32' ? ['', '.cmd', '.exe', '.bat'] : [''];

  for (const dir of envPath.split(sep)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, `${binary}${ext}`);
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return candidate;
        }
      } catch {
        // Ignore stat failures
      }
    }
  }

  return null;
}

interface CliSpec {
  provider: ProviderKind;
  binary: string;
  installHint: string;
}

const CLI_SPECS: CliSpec[] = [
  {
    provider: 'claude-cli',
    binary: 'claude',
    installHint: 'npm install -g @anthropic-ai/claude-code',
  },
  {
    provider: 'gemini-cli',
    binary: 'gemini',
    installHint: 'npm install -g @google/gemini-cli',
  },
  {
    provider: 'codex-cli',
    binary: 'codex',
    installHint: 'npm install -g @openai/codex',
  },
];

export async function checkCliHealth(): Promise<CliHealthInfo[]> {
  const enrichedPath = buildEnrichedPath();
  const results = await Promise.all(
    CLI_SPECS.map(async (spec): Promise<CliHealthInfo> => {
      const resolvedPath = resolveExecutable(spec.binary);
      if (!resolvedPath) {
        return {
          provider: spec.provider,
          binary: spec.binary,
          installed: false,
          installHint: spec.installHint,
        };
      }

      try {
        const { stdout, stderr } = await execFileAsync(resolvedPath, ['--version'], {
          timeout: 4000,
          env: { ...process.env, PATH: enrichedPath },
        });
        const version = (stdout || stderr).trim().split(/\r?\n/)[0];
        return {
          provider: spec.provider,
          binary: spec.binary,
          installed: true,
          version,
          resolvedPath,
          installHint: spec.installHint,
        };
      } catch {
        return {
          provider: spec.provider,
          binary: spec.binary,
          installed: true,
          resolvedPath,
          installHint: spec.installHint,
        };
      }
    })
  );

  return results;
}
