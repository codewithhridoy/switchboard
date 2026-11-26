import { ProviderKind } from '../../shared/types';
import { ApiRunner } from './apiRunner';
import { ClaudeCliRunner } from './claudeCli';
import { CodexCliRunner } from './codexCli';
import { GeminiCliRunner } from './geminiCli';
import { ProviderRunner } from './types';

const claudeCli = new ClaudeCliRunner();
const geminiCli = new GeminiCliRunner();
const codexCli = new CodexCliRunner();
const apiRunner = new ApiRunner();

export function getRunnerForProvider(provider: ProviderKind): ProviderRunner {
  switch (provider) {
    case 'claude-cli':
      return claudeCli;
    case 'gemini-cli':
      return geminiCli;
    case 'codex-cli':
      return codexCli;
    case 'anthropic-api':
    case 'gemini-api':
    case 'openai-compatible':
      return apiRunner;
  }
}
