import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { CloneRepoInput, CreateProjectInput, GitHubRepoSummary } from '../shared/types';
import { buildEnrichedPath, resolveExecutable } from './runners/cliEnv';

const execFileAsync = promisify(execFile);

export async function scaffoldProjectDirectory(
  input: CreateProjectInput
): Promise<{ projectPath: string; gitInitialized: boolean }> {
  const safeSlug =
    input.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '') || `project-${Date.now()}`;

  const projectPath = path.join(input.parentDir, safeSlug);
  fs.mkdirSync(projectPath, { recursive: true });

  const readmePath = path.join(projectPath, 'README.md');
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(
      readmePath,
      `# ${input.name.trim()}\n\n${input.description?.trim() || 'Created with Switchboard AI.'}\n`,
      'utf8'
    );
  }

  const gitignorePath = path.join(projectPath, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(
      gitignorePath,
      `node_modules/\ndist/\n.DS_Store\n.env\n.env.local\n*.log\n`,
      'utf8'
    );
  }

  if (input.template === 'node-ts') {
    const pkgPath = path.join(projectPath, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      fs.writeFileSync(
        pkgPath,
        JSON.stringify(
          {
            name: safeSlug,
            version: '0.1.0',
            private: true,
            scripts: { dev: 'tsx src/index.ts', build: 'tsc' },
          },
          null,
          2
        ) + '\n',
        'utf8'
      );
    }
    fs.mkdirSync(path.join(projectPath, 'src'), { recursive: true });
    const entryPath = path.join(projectPath, 'src', 'index.ts');
    if (!fs.existsSync(entryPath)) {
      fs.writeFileSync(entryPath, `console.log('Hello from ${input.name.trim()}!');\n`, 'utf8');
    }
  } else if (input.template === 'web-vite') {
    const pkgPath = path.join(projectPath, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      fs.writeFileSync(
        pkgPath,
        JSON.stringify(
          {
            name: safeSlug,
            version: '0.1.0',
            private: true,
            type: 'module',
            scripts: { dev: 'vite', build: 'vite build' },
          },
          null,
          2
        ) + '\n',
        'utf8'
      );
    }
    const htmlPath = path.join(projectPath, 'index.html');
    if (!fs.existsSync(htmlPath)) {
      fs.writeFileSync(
        htmlPath,
        `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <title>${input.name.trim()}</title>\n  </head>\n  <body>\n    <div id="app"></div>\n  </body>\n</html>\n`,
        'utf8'
      );
    }
  }

  let gitInitialized = false;
  if (input.initGit || input.createGitHubRepo) {
    const gitExe = resolveExecutable('git');
    if (gitExe) {
      const env = { ...process.env, PATH: buildEnrichedPath() };
      if (!fs.existsSync(path.join(projectPath, '.git'))) {
        await execFileAsync(gitExe, ['init', '-b', 'main'], { cwd: projectPath, env });
      }
      await execFileAsync(gitExe, ['add', '-A'], { cwd: projectPath, env });
      try {
        await execFileAsync(gitExe, ['commit', '-m', 'chore: initial project scaffold'], {
          cwd: projectPath,
          env,
        });
      } catch {
        // Already committed or nothing new to commit
      }
      gitInitialized = true;
    }
  }

  return { projectPath, gitInitialized };
}

export async function createGitHubRepoAndPush(opts: {
  projectPath: string;
  repoName: string;
  description?: string;
  isPrivate: boolean;
  token: string;
}): Promise<{ htmlUrl: string; fullName: string }> {
  const safeName =
    opts.repoName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '') || `project-${Date.now()}`;

  const res = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${opts.token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'Switchboard-AI',
    },
    body: JSON.stringify({
      name: safeName,
      description: opts.description?.trim() || 'Created with Switchboard AI',
      private: opts.isPrivate,
      auto_init: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub repo creation failed (${res.status}): ${body.slice(0, 220)}`);
  }

  const repo = (await res.json()) as {
    html_url: string;
    full_name: string;
    clone_url: string;
  };

  const gitExe = resolveExecutable('git');
  if (gitExe) {
    const env = { ...process.env, PATH: buildEnrichedPath() };
    if (!fs.existsSync(path.join(opts.projectPath, '.git'))) {
      await execFileAsync(gitExe, ['init', '-b', 'main'], { cwd: opts.projectPath, env });
      await execFileAsync(gitExe, ['add', '-A'], { cwd: opts.projectPath, env });
      try {
        await execFileAsync(gitExe, ['commit', '-m', 'chore: initial commit'], {
          cwd: opts.projectPath,
          env,
        });
      } catch {
        // Ignore if empty
      }
    }

    // Set clean HTTPS origin (without embedding token on disk)
    try {
      await execFileAsync(gitExe, ['remote', 'set-url', 'origin', repo.clone_url], {
        cwd: opts.projectPath,
        env,
      });
    } catch {
      await execFileAsync(gitExe, ['remote', 'add', 'origin', repo.clone_url], {
        cwd: opts.projectPath,
        env,
      });
    }

    // Push using an ephemeral Authorization header so the token is never saved in .git/config
    const basicAuth = Buffer.from(`x-access-token:${opts.token}`).toString('base64');
    await execFileAsync(
      gitExe,
      [
        '-c',
        `http.extraHeader=AUTHORIZATION: basic ${basicAuth}`,
        'push',
        '-u',
        'origin',
        'HEAD:main',
      ],
      { cwd: opts.projectPath, env }
    );
  }

  return { htmlUrl: repo.html_url, fullName: repo.full_name };
}

export async function detectGitHubRemote(
  projectPath: string
): Promise<{ htmlUrl?: string; fullName?: string }> {
  const gitExe = resolveExecutable('git');
  if (!gitExe || !fs.existsSync(path.join(projectPath, '.git'))) {
    return {};
  }
  try {
    const { stdout } = await execFileAsync(gitExe, ['remote', 'get-url', 'origin'], {
      cwd: projectPath,
      timeout: 3000,
      env: { ...process.env, PATH: buildEnrichedPath() },
    });
    const raw = stdout.trim();
    const match = raw.match(/github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/i);
    if (match) {
      return {
        fullName: match[1],
        htmlUrl: `https://github.com/${match[1]}`,
      };
    }
  } catch {
    // No remote configured
  }
  return {};
}

export function normalizeRepoCloneUrl(raw: string): {
  cloneUrl: string;
  defaultFolderName: string;
  isGitHubHttps: boolean;
} {
  const trimmed = raw.trim();
  // Support `owner/repo` shorthand
  if (/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(trimmed)) {
    const repoPart = trimmed.split('/')[1].replace(/\.git$/i, '');
    return {
      cloneUrl: `https://github.com/${trimmed.replace(/\.git$/i, '')}.git`,
      defaultFolderName: repoPart,
      isGitHubHttps: true,
    };
  }

  const folderMatch = trimmed.match(/\/([^/]+?)(?:\.git)?\/?$/);
  const sshMatch = trimmed.match(/:([^/]+\/)?([^/]+?)(?:\.git)?$/);
  const defaultFolderName =
    folderMatch?.[1] || sshMatch?.[2] || `repo-${Date.now()}`;

  return {
    cloneUrl: trimmed,
    defaultFolderName,
    isGitHubHttps: /^https:\/\/github\.com\//i.test(trimmed),
  };
}

export async function listUserGitHubRepos(token: string): Promise<GitHubRepoSummary[]> {
  const res = await fetch(
    'https://api.github.com/user/repos?sort=updated&per_page=60&affiliation=owner,collaborator,organization_member',
    {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'Switchboard-AI',
      },
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Failed to list GitHub repos (${res.status}): ${body.slice(0, 200)}`);
  }
  const raw = (await res.json()) as Array<{
    id: number;
    name: string;
    full_name: string;
    description: string | null;
    private: boolean;
    clone_url: string;
    html_url: string;
    default_branch: string;
    updated_at: string;
  }>;

  return raw.map((r) => ({
    id: r.id,
    name: r.name,
    fullName: r.full_name,
    description: r.description,
    private: r.private,
    cloneUrl: r.clone_url,
    htmlUrl: r.html_url,
    defaultBranch: r.default_branch,
    updatedAt: r.updated_at,
  }));
}

export async function cloneGitRepository(
  input: CloneRepoInput,
  githubToken?: string
): Promise<{ projectPath: string; name: string }> {
  const gitExe = resolveExecutable('git');
  if (!gitExe) {
    throw new Error('Git (`git`) is not installed or not found on PATH.');
  }

  const { cloneUrl, defaultFolderName, isGitHubHttps } = normalizeRepoCloneUrl(input.repoUrl);
  const folderName =
    input.folderName
      ?.trim()
      .replace(/[\\/]+/g, '-') || defaultFolderName;

  fs.mkdirSync(input.parentDir, { recursive: true });
  const targetPath = path.join(input.parentDir, folderName);

  if (fs.existsSync(targetPath) && fs.readdirSync(targetPath).length > 0) {
    throw new Error(`Destination folder already exists and is not empty: ${targetPath}`);
  }

  const args: string[] = [];
  if (isGitHubHttps && githubToken) {
    const basicAuth = Buffer.from(`x-access-token:${githubToken}`).toString('base64');
    args.push('-c', `http.extraHeader=AUTHORIZATION: basic ${basicAuth}`);
  }

  args.push('clone');
  if (input.branch?.trim()) {
    args.push('--branch', input.branch.trim());
  }
  args.push(cloneUrl, targetPath);

  try {
    await execFileAsync(gitExe, args, {
      cwd: input.parentDir,
      timeout: 180_000,
      env: { ...process.env, PATH: buildEnrichedPath(), GIT_TERMINAL_PROMPT: '0' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Git clone failed: ${msg.slice(0, 320)}`);
  }

  return { projectPath: targetPath, name: folderName };
}
