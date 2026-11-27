import {
  AccountProfile,
  CodingPermissionMode,
  SubtaskActivityStep,
  TaskAttachment,
} from '../../shared/types';

export interface RunRequest {
  account: AccountProfile;
  prompt: string;
  attachments?: TaskAttachment[];
  mode: 'coding' | 'general';
  permissionMode?: CodingPermissionMode;
  fastMode?: boolean;
  workspaceDir?: string;
  signal: AbortSignal;
  onChunk: (chunk: string, stream: 'stdout' | 'stderr' | 'system') => void;
  onStatus?: (statusText: string) => void;
  onActivity?: (step: Omit<SubtaskActivityStep, 'startedAt'>) => void;
}

export interface RunUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheTokens?: number;
}

export interface RunResult {
  ok: boolean;
  output: string;
  usage?: RunUsage;
  error?: string;
  permissionDenied?: boolean;
  rateLimited?: boolean;
  rateLimitReason?: string;
  retryAfterMs?: number;
  cancelled?: boolean;
}

export interface ProviderRunner {
  run(req: RunRequest): Promise<RunResult>;
}
