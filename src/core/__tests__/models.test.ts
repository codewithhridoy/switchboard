import { describe, expect, it } from 'vitest';
import { PROVIDER_MODELS } from '../../shared/presets';
import { composeModelId, groupModelsByBase, splitModelAndEffort } from '../../shared/models';

describe('groupModelsByBase', () => {
  it('deduplicates agy-cli models and separates effort variants cleanly', () => {
    const groups = groupModelsByBase('agy-cli', undefined, PROVIDER_MODELS['agy-cli']);
    const ids = groups.map((g) => g.baseId);

    // No duplicate base models
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('gemini-4-neon');
    expect(ids).toContain('gemini-4-carbon');
    expect(ids).toContain('claude-opus-5-5');

    const neon = groups.find((g) => g.baseId === 'gemini-4-neon')!;
    expect(neon.label).toBe('Gemini 4 Neon');
    expect(neon.suffixEncoded).toBe(true);
    expect(neon.efforts).toEqual(['low', 'medium', 'high', 'xhigh']);
    expect(composeModelId(neon, 'xhigh')).toBe('gemini-4-neon-xhigh');
    expect(composeModelId(neon, 'medium')).toBe('gemini-4-neon-medium');
  });

  it('gives claude-cli unique base models with native effort levels', () => {
    const groups = groupModelsByBase('claude-cli', undefined, PROVIDER_MODELS['claude-cli']);
    const opus = groups.find((g) => g.baseId === 'claude-opus-5-5')!;
    expect(opus.suffixEncoded).toBe(false);
    expect(opus.efforts).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    expect(composeModelId(opus, 'high')).toBe('claude-opus-5-5');
  });

  it('splits suffix-encoded model IDs cleanly', () => {
    expect(splitModelAndEffort('gemini-4-neon-high')).toEqual({
      baseId: 'gemini-4-neon',
      effort: 'high',
    });
    expect(splitModelAndEffort('claude-opus-5-5')).toEqual({
      baseId: 'claude-opus-5-5',
    });
  });
});
