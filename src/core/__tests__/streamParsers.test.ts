import { describe, expect, it } from 'vitest';
import { parseAgyStreamLine, parseClaudeStreamLine } from '../runners/streamParsers';

describe('NDJSON stream parsers', () => {
  it('parses Claude stream-json thinking and text deltas', () => {
    const thinking = parseClaudeStreamLine(
      JSON.stringify({
        type: 'system',
        subtype: 'thinking_tokens',
        estimated_tokens: 120,
      })
    );
    expect(thinking?.statusText).toBe('Thinking (120 tokens)...');

    const delta = parseClaudeStreamLine(
      JSON.stringify({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Hello world' },
        },
      })
    );
    expect(delta?.textDelta).toBe('Hello world');

    const result = parseClaudeStreamLine(
      JSON.stringify({
        type: 'result',
        result: 'Hello world',
        usage: { input_tokens: 50, output_tokens: 12, cache_read_input_tokens: 100 },
      })
    );
    expect(result?.finalText).toBe('Hello world');
    expect(result?.usage).toEqual({
      inputTokens: 50,
      outputTokens: 12,
      cacheTokens: 100,
    });
  });

  it('parses Agy stream-json init, text deltas, and exact usage result', () => {
    const init = parseAgyStreamLine(
      JSON.stringify({ event: 'init', init: { model: 'gemini-4-neon-high' } })
    );
    expect(init?.statusText).toContain('gemini-4-neon-high');

    const delta = parseAgyStreamLine(
      JSON.stringify({
        event: 'step_update',
        step_update: {
          step_type: 'agent_response',
          state: 'ACTIVE',
          text_delta: 'Streaming live!',
        },
      })
    );
    expect(delta?.textDelta).toBe('Streaming live!');

    const res = parseAgyStreamLine(
      JSON.stringify({
        event: 'result',
        result: {
          status: 'SUCCESS',
          response: 'Streaming live!',
          usage: { input_tokens: 200, output_tokens: 15, cache_read_tokens: 50 },
        },
      })
    );
    expect(res?.finalText).toBe('Streaming live!');
    expect(res?.usage).toEqual({
      inputTokens: 200,
      outputTokens: 15,
      cacheTokens: 50,
    });
  });

  it('surfaces Agy headless denied_actions and live tool command status instead of empty success', () => {
    const toolStep = parseAgyStreamLine(
      JSON.stringify({
        event: 'step_update',
        step_update: {
          step_index: 2,
          step_type: 'tool',
          state: 'ACTIVE',
          tool_name: 'run_command',
          tool_info: {
            name: 'run_command',
            parameters: { CommandLine: 'git status -sb' },
          },
        },
      })
    );
    expect(toolStep?.statusText).toContain('git status -sb');
    expect(toolStep?.activityStep).toMatchObject({
      id: 'agy-step-2',
      kind: 'tool',
      status: 'running',
    });

    const toolDone = parseAgyStreamLine(
      JSON.stringify({
        event: 'step_update',
        step_update: {
          step_index: 2,
          step_type: 'tool',
          state: 'DONE',
          tool_name: 'run_command',
          duration_seconds: 1.42,
          tool_info: {
            name: 'run_command',
            parameters: { CommandLine: 'git status -sb' },
            output: '## main\n M README.md',
          },
        },
      })
    );
    expect(toolDone?.activityStep).toMatchObject({
      id: 'agy-step-2',
      status: 'done',
      durationSec: 1.4,
      detail: '## main',
    });

    const deniedResult = parseAgyStreamLine(
      JSON.stringify({
        event: 'result',
        result: {
          status: 'SUCCESS',
          response: '',
          denied_actions: [{ action: 'command', display_name: 'Bash' }],
          usage: { input_tokens: 100, output_tokens: 0, cache_read_tokens: 0 },
        },
      })
    );
    expect(deniedResult?.permissionDenied).toBe(true);
    expect(deniedResult?.errorText).toContain('Bash (command)');
    expect(deniedResult?.errorText).toContain('Full Auto');
  });

  it('surfaces Claude headless permission_denials when result is empty', () => {
    const deniedResult = parseClaudeStreamLine(
      JSON.stringify({
        type: 'result',
        result: '',
        permission_denials: [{ tool_name: 'Bash' }],
      })
    );
    expect(deniedResult?.permissionDenied).toBe(true);
    expect(deniedResult?.errorText).toContain('Bash');
  });
});
