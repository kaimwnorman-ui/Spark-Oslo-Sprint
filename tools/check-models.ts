// npm run models:check: one 10-token call per default model (SPEC §12 "Model check").
// Prints which IDs the API accepts. Never prints the key.
import Anthropic from '@anthropic-ai/sdk';
import { createAnthropic } from '../server/src/anthropic.ts';
import { loadSettings } from '../server/src/settings.ts';

const settings = loadSettings(process.env);
const client = createAnthropic(settings.keys);
if (!client) {
  console.error('No Anthropic key (ANTHROPIC_API_KEY or SPARK_ANTHROPIC_API_KEY): nothing to check.');
  process.exit(1);
}

let failed = false;
const models = [...new Set(Object.values(settings.models))];
for (const model of models) {
  const started = Date.now();
  try {
    const msg = await client.messages.create({
      model,
      max_tokens: 10,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
    });
    const roles = Object.entries(settings.models).filter(([, m]) => m === model).map(([r]) => r);
    console.log(`ok   ${model} (${roles.join(', ')}): stop=${msg.stop_reason}, ${Date.now() - started} ms, in=${msg.usage.input_tokens} out=${msg.usage.output_tokens}`);
  } catch (err) {
    failed = true;
    if (err instanceof Anthropic.NotFoundError) console.error(`FAIL ${model}: model not found (pick the closest current model from the claude-api skill)`);
    else if (err instanceof Anthropic.APIError) console.error(`FAIL ${model}: API error ${err.status}: ${err.message}`);
    else console.error(`FAIL ${model}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
process.exit(failed ? 1 : 0);
