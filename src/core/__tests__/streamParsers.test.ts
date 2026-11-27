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
});
