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
 * profile environment variable so they can authenticate natively via the official CLI.
 */
export function launchAccountCliLogin(account: AccountProfile): Promise<TerminalLaunchResult> {
  const profileDir = account.profileDir;
  if (profileDir) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  let unixCmd = '';
  let winCmd = '';

  if (account.provider === 'claude-cli') {
    const dir = profileDir ?? '';
    unixCmd = dir
      ? `CLAUDE_CONFIG_DIR=${shellQuote(dir)} claude`
      : 'claude';
    winCmd = dir
      ? `set "CLAUDE_CONFIG_DIR=${dir}" && claude`
      : 'claude';
  } else if (account.provider === 'gemini-cli') {
    const dir = profileDir ?? '';
    const xdg = dir ? path.join(dir, '.config') : '';
    unixCmd = dir
      ? `GEMINI_CLI_HOME=${shellQuote(dir)} XDG_CONFIG_HOME=${shellQuote(xdg)} gemini`
      : 'gemini';
    winCmd = dir
      ? `set "GEMINI_CLI_HOME=${dir}" && gemini`
      : 'gemini';
  } else if (account.provider === 'codex-cli') {
    const dir = profileDir ?? '';
    unixCmd = dir
      ? `CODEX_HOME=${shellQuote(dir)} codex login`
      : 'codex login';
    winCmd = dir
      ? `set "CODEX_HOME=${dir}" && codex login`
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
        const banner = `echo "=== Switchboard Isolated Login: ${account.name.replace(/"/g, '\\"')} ===" && ${unixCmd}`;
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

      // Linux: try common terminal emulators
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
