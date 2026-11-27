import { describe, expect, it } from 'vitest';
import { classifyPrompt, decomposePrompt } from '../classifier';

describe('classifyPrompt', () => {
  it('routes architecture & system design prompts to architecture', () => {
    const res = classifyPrompt(
      'Design a scalable microservice architecture and database schema migration plan.',
      'coding'
    );
    expect(res.category).toBe('architecture');
  });

  it('routes UI/CSS work to frontend-ui', () => {
    const res = classifyPrompt(
      'Build a responsive dark mode dashboard sidebar with Tailwind CSS and accessible modals.',
      'coding'
    );
    expect(res.category).toBe('frontend-ui');
  });

  it('routes whole-repo audits to large-context', () => {
    const res = classifyPrompt(
      'Audit the entire codebase across all files for security issues and dead code.',
      'coding'
    );
    expect(res.category).toBe('large-context');
  });

  it('routes email/docs requests to writing', () => {
    const res = classifyPrompt(
      'Draft release notes and a blog post announcing our v1.0 launch.',
      'general'
    );
    expect(res.category).toBe('writing');
  });

  it('routes short coding execution instructions to coding instead of quick-edit', () => {
    const res = classifyPrompt(
      'p0 is merged and complete all other steps from p1--5 and everything one by one',
      'coding'
    );
    expect(res.category).toBe('coding');
  });
});

describe('decomposePrompt', () => {
  it('splits numbered multi-step prompts into per-step categories', () => {
    const prompt = `Build our new billing page:
1. Audit the entire codebase to find all subscription endpoints.
2. Build a responsive dark mode React dashboard component with CSS grid.
3. Write release notes and README documentation for the feature.`;

    const steps = decomposePrompt(prompt, 'coding', true);
    expect(steps).toHaveLength(3);
    expect(steps[0].category).toBe('large-context');
    expect(steps[1].category).toBe('frontend-ui');
    expect(steps[2].category).toBe('writing');
  });

  it('keeps single subtask when autoDecompose is false', () => {
    const steps = decomposePrompt('1. Do A\n2. Do B', 'coding', false);
    expect(steps).toHaveLength(1);
  });
});
