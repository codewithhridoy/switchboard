import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { AccountProfile } from '../shared/types';

export interface TerminalLaunchResult {
  ok: boolean;
  command: string;
  error?: string;
}

/**
 * Opens the user's native OS terminal pre-configured with the account's isolated
 * profile environment variable (or default system profile) so they can authenticate
 * natively via the official CLI.
 */
export function launchAccountCliLogin(account: AccountProfile): Promise<TerminalLaunchResult> {
  const useIsolated = !account.useDefaultProfile && Boolean(account.profileDir);
  const profileDir = useIsolated ? account.profileDir : undefined;

  if (profileDir) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  let unixCmd = '';
  let winCmd = '';

  if (account.provider === 'claude-cli') {
    unixCmd = profileDir
      ? `CLAUDE_CONFIG_DIR=${shellQuote(profileDir)} claude auth login`
      : 'claude auth login';
    winCmd = profileDir
      ? `set "CLAUDE_CONFIG_DIR=${profileDir}" && claude auth login`
      : 'claude auth login';
  } else if (account.provider === 'agy-cli') {
    unixCmd = 'agy';
    winCmd = 'agy';
  } else if (account.provider === 'gemini-cli') {
    const xdg = profileDir ? path.join(profileDir, '.config') : '';
    unixCmd = profileDir
      ? `GEMINI_CLI_HOME=${shellQuote(profileDir)} XDG_CONFIG_HOME=${shellQuote(xdg)} gemini`
      : 'gemini';
    winCmd = profileDir
      ? `set "GEMINI_CLI_HOME=${profileDir}" && gemini`
      : 'gemini';
  } else if (account.provider === 'codex-cli') {
    unixCmd = profileDir
      ? `CODEX_HOME=${shellQuote(profileDir)} codex login`
      : 'codex login';
    winCmd = profileDir
      ? `set "CODEX_HOME=${profileDir}" && codex login`
      : 'codex login';
  } else {
    return Promise.resolve({
      ok: false,
      command: '',
      error: 'API accounts authenticate via API key, not a CLI terminal login.',
    });
  }

  const commandToShow = process.platform === 'win32' ? winCmd : unixCmd;

  return new Promise((resolve) => {
    try {
      if (process.platform === 'darwin') {
        const banner = `echo "=== Switchboard Sign-In: ${account.name.replace(/"/g, '\\"')} ===" && ${unixCmd}`;
        const appleScript = `tell application "Terminal"
  activate
  do script "${banner.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
end tell`;
        const child = spawn('osascript', ['-e', appleScript], {
          stdio: 'ignore',
          detached: true,
        });
        child.unref();
        resolve({ ok: true, command: commandToShow });
        return;
      }

      if (process.platform === 'win32') {
        const child = spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', winCmd], {
          stdio: 'ignore',
          detached: true,
        });
        child.unref();
        resolve({ ok: true, command: commandToShow });
        return;
      }

      const script = `${unixCmd}; exec bash`;
      const child = spawn(
        'sh',
        [
          '-c',
          `for term in x-terminal-emulator gnome-terminal konsole xfce4-terminal kitty alacritty xterm; do
             if command -v "$term" >/dev/null 2>&1; then
               exec "$term" -e sh -c ${shellQuote(script)}
             fi
           done
           exit 1`,
        ],
        { stdio: 'ignore', detached: true }
      );
      child.unref();
      resolve({ ok: true, command: commandToShow });
    } catch (err) {
      resolve({
        ok: false,
        command: commandToShow,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
