import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createStarterAccounts,
  DEFAULT_ROUTING_RULES,
  DEFAULT_SETTINGS,
} from '../shared/presets';
import {
  AccountProfile,
  AppSettings,
  OrchestratedTask,
  RoutingRule,
} from '../shared/types';

export interface PersistedData {
  version: number;
  accounts: AccountProfile[];
  routingRules: RoutingRule[];
  tasks: OrchestratedTask[];
  settings: AppSettings;
}

export class SwitchboardStore {
  public readonly baseDir: string;
  public readonly profilesDir: string;
  public readonly stateFile: string;
  private data: PersistedData;

  constructor(customBaseDir?: string) {
    this.baseDir = customBaseDir ?? path.join(os.homedir(), '.switchboard');
    this.profilesDir = path.join(this.baseDir, 'profiles');
    this.stateFile = path.join(this.baseDir, 'state.json');

    fs.mkdirSync(this.profilesDir, { recursive: true });
    this.data = this.load();
    this.ensureProfileDirs();
  }

  private load(): PersistedData {
    try {
      if (fs.existsSync(this.stateFile)) {
        const raw = fs.readFileSync(this.stateFile, 'utf8');
        const parsed = JSON.parse(raw) as Partial<PersistedData>;
        return {
          version: 1,
          accounts: Array.isArray(parsed.accounts)
            ? parsed.accounts
            : createStarterAccounts(this.profilesDir),
          routingRules:
            Array.isArray(parsed.routingRules) && parsed.routingRules.length > 0
              ? parsed.routingRules
              : DEFAULT_ROUTING_RULES,
          tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
          settings: {
            ...DEFAULT_SETTINGS,
            ...(parsed.settings ?? {}),
          },
        };
      }
    } catch {
      // Fall back to clean defaults if state file is corrupted
    }

    const initial: PersistedData = {
      version: 1,
      accounts: createStarterAccounts(this.profilesDir),
      routingRules: DEFAULT_ROUTING_RULES,
      tasks: [],
      settings: {
        ...DEFAULT_SETTINGS,
        defaultWorkspaceDir: os.homedir(),
      },
    };
    this.persist(initial);
    return initial;
  }

  private ensureProfileDirs(): void {
    for (const acc of this.data.accounts) {
      if (acc.profileDir) {
        try {
          fs.mkdirSync(acc.profileDir, { recursive: true });
        } catch {
          // Ignore invalid custom path until user updates it
        }
      }
    }
  }

  private persist(next: PersistedData): void {
    const tmpFile = `${this.stateFile}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(next, null, 2), 'utf8');
    fs.renameSync(tmpFile, this.stateFile);
  }

  public getData(): PersistedData {
    return this.data;
  }

  public save(): void {
    this.ensureProfileDirs();
    this.persist(this.data);
  }

  public createProfileDir(slug: string): string {
    const safe = slug
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || `profile-${Date.now()}`;
    const dir = path.join(this.profilesDir, safe);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
}
