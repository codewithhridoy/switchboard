import { AccountProfile } from '../../shared/types';

export interface RunRequest {
  account: AccountProfile;
  prompt: string;
  mode: 'coding' | 'general';
  workspaceDir?: string;
  signal: AbortSignal;
  onChunk: (chunk: string, stream: 'stdout' | 'stderr' | 'system') => void;
}

export interface RunResult {
  ok: boolean;
  output: string;
  error?: string;
  rateLimited?: boolean;
  rateLimitReason?: string;
  retryAfterMs?: number;
  cancelled?: boolean;
}

export interface ProviderRunner {
  run(req: RunRequest): Promise<RunResult>;
}
