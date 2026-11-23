import type Anthropic from '@anthropic-ai/sdk';

// the browser calls anthropic directly, so the model ships in the bundle
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5-5';

/**
 * how hard the model thinks before writing. sonnet 5.5 thinks by default at
 * high effort, and thinking counts against max_tokens: npm run eval:live
 * found every report cut off at 1500 tokens with little or no text written.
 * the report and chat write from numbers already worked out, so low is enough
 */
export const COACH_EFFORT = 'low';

/** a messages request with output_config, which the installed sdk's types predate */
export type ClaudeRequest = Anthropic.MessageCreateParamsNonStreaming & {
  output_config: { effort: typeof COACH_EFFORT };
};
