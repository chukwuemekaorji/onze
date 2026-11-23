import { mkdirSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import Anthropic from '@anthropic-ai/sdk';
import type { AnalysisSummary } from '../../../lib/analysis-summary.js';
import { buildCoachRequest } from '../../../lib/coach-prompt.js';
import {
  CHECKS,
  CHECK_LABELS,
  checkReport,
} from '../../../lib/eval/llm/check-report.js';
import type { ReportCheck } from '../../../lib/eval/llm/check-report.js';
import { DEFAULT_ANTHROPIC_MODEL } from '../../../lib/model.js';
import { failLoudly } from '../shared.js';

/**
 * npm run eval:live: fresh claude replies for the golden set, with the real
 * coach prompt and the app's model. manual only, and the one place outside
 * the browser that may hold an anthropic key: it comes from the
 * ANTHROPIC_API_KEY env var, which lint forbids in api/, web/ and lib/.
 * the estimated cost is printed, and confirmed, before any paid call
 */

const GOLDEN_DIR = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'test',
  'fixtures',
  'golden',
);
const REPLIES_DIR = join(GOLDEN_DIR, 'replies');
// dollars per million tokens, from anthropic's published prices for the model
// the app uses. a model missing here stops the run rather than guess a price
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5-5': { input: 2, output: 10 },
};
// a cautious stand-in when token counting is unavailable: english json runs
// about 3.5 to 4 characters a token, so 3 overcounts
const CHARACTERS_PER_TOKEN_ESTIMATE = 3;

interface Golden {
  id: string;
  title: string;
  summary: AnalysisSummary;
}

export interface SavedReply {
  scenario: string;
  model: string;
  generatedAt: string;
  stopReason: string | null;
  usage: { inputTokens: number; outputTokens: number };
  text: string;
}

async function goldenSet(): Promise<Golden[]> {
  const files = (await readdir(GOLDEN_DIR))
    .filter((file) => file.endsWith('.json'))
    .sort();
  return Promise.all(
    files.map(
      async (file) =>
        JSON.parse(await readFile(join(GOLDEN_DIR, file), 'utf8')) as Golden,
    ),
  );
}

async function inputTokens(
  client: Anthropic,
  request: Anthropic.MessageCreateParamsNonStreaming,
): Promise<{ tokens: number; counted: boolean }> {
  try {
    const counted = await client.beta.messages.countTokens({
      model: request.model,
      ...(request.system === undefined ? {} : { system: request.system }),
      messages: request.messages,
      betas: ['token-counting-2024-11-01'],
    });
    return { tokens: counted.input_tokens, counted: true };
  } catch {
    const characters = JSON.stringify({
      system: request.system,
      messages: request.messages,
    }).length;
    return {
      tokens: Math.ceil(characters / CHARACTERS_PER_TOKEN_ESTIMATE),
      counted: false,
    };
  }
}

async function confirmed(question: string): Promise<boolean> {
  if (process.argv.includes('--yes')) return true;
  if (!process.stdin.isTTY) {
    throw new Error('not a terminal: rerun with --yes to confirm the cost');
  }
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await reader.question(question);
  reader.close();
  return /^y(es)?$/i.test(answer.trim());
}

const dollars = (value: number) => `$${value.toFixed(3)}`;

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'set ANTHROPIC_API_KEY in your shell to run eval:live; it is never needed anywhere else',
    );
  }
  const model = DEFAULT_ANTHROPIC_MODEL;
  const price = PRICES[model];
  if (price === undefined)
    throw new Error(`no price recorded for ${model}; add it to PRICES first`);
  const client = new Anthropic();
  const golden = await goldenSet();
  const requests = golden.map((scenario) => ({
    scenario,
    request: buildCoachRequest(scenario.summary, model),
  }));

  let estimate = 0;
  let allCounted = true;
  console.log(
    `estimated cost, ${model} at $${price.input}/M in and $${price.output}/M out:`,
  );
  for (const { scenario, request } of requests) {
    const { tokens, counted } = await inputTokens(client, request);
    allCounted &&= counted;
    // the output can't run past max_tokens, so this is the most it can cost
    const most = (tokens * price.input + request.max_tokens * price.output) / 1_000_000;
    estimate += most;
    console.log(
      `  ${scenario.id}: ${tokens} input tokens${counted ? '' : ' (estimated)'}, at most ${dollars(most)}`,
    );
  }
  console.log(
    `at most ${dollars(estimate)} for ${requests.length} replies${allCounted ? '' : ' (some input estimated from length, counted high)'}`,
  );
  if (!(await confirmed(`call ${model} ${requests.length} times? [y/N] `))) {
    console.log('stopped before any paid call');
    return;
  }

  mkdirSync(REPLIES_DIR, { recursive: true });
  const results: { scenario: Golden; check: ReportCheck; reply: SavedReply }[] = [];
  let spent = 0;
  for (const { scenario, request } of requests) {
    const response = await client.messages.create(request);
    const text = response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('');
    const reply: SavedReply = {
      scenario: scenario.id,
      model,
      generatedAt: new Date().toISOString(),
      stopReason: response.stop_reason,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      text,
    };
    spent +=
      (reply.usage.inputTokens * price.input +
        reply.usage.outputTokens * price.output) /
      1_000_000;
    await writeFile(
      join(REPLIES_DIR, `${scenario.id}.json`),
      `${JSON.stringify(reply, null, 2)}\n`,
    );
    results.push({ scenario, check: checkReport(text, scenario.summary), reply });
    console.log(
      `  ${scenario.id}: ${reply.stopReason ?? 'no stop reason'}, ${reply.usage.outputTokens} output tokens`,
    );
  }

  console.log(`\nscorecard (${results.length} replies, ${dollars(spent)} spent):`);
  for (const check of CHECKS) {
    const passes = results.filter((result) => result.check.passed[check]).length;
    console.log(
      `  ${String(Math.round((passes / results.length) * 100)).padStart(3)}%  ${CHECK_LABELS[check]} (${passes}/${results.length})`,
    );
  }
  const allPass = results.filter(
    (result) => result.check.violations.length === 0,
  ).length;
  console.log(`  ${allPass}/${results.length} replies pass every check`);
  for (const { scenario, check, reply } of results) {
    if (check.violations.length === 0) continue;
    console.log(
      `\n${scenario.id} (${scenario.title}), stop reason ${reply.stopReason ?? 'none'}:`,
    );
    for (const violation of check.violations) {
      console.log(`  [${violation.check}] ${violation.detail}`);
      if (violation.sentence !== '') console.log(`      "${violation.sentence}"`);
    }
  }
  console.log(
    `\nreplies saved to test/fixtures/golden/replies/; ci checks them on every run`,
  );
}

main().catch(failLoudly);
