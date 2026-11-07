import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveKeys, ANTHROPIC_API_URL } from '../src/env.ts';

test('ANTHROPIC_API_KEY wins when both are set', () => {
  const k = resolveKeys({ ANTHROPIC_API_KEY: 'a', SPARK_ANTHROPIC_API_KEY: 'b' });
  assert.equal(k.anthropicApiKey, 'a');
  assert.equal(k.anthropicKeySource, 'ANTHROPIC_API_KEY');
});

test('falls back to SPARK_ANTHROPIC_API_KEY', () => {
  const k = resolveKeys({ SPARK_ANTHROPIC_API_KEY: 'b' });
  assert.equal(k.anthropicApiKey, 'b');
  assert.equal(k.anthropicKeySource, 'SPARK_ANTHROPIC_API_KEY');
});

test('blank values count as missing', () => {
  const k = resolveKeys({ ANTHROPIC_API_KEY: '  ', SPARK_ANTHROPIC_API_KEY: 'b', KIE_API_KEY: '' });
  assert.equal(k.anthropicApiKey, 'b');
  assert.equal(k.kieApiKey, undefined);
});

test('no key means offline mode', () => {
  const k = resolveKeys({});
  assert.equal(k.anthropicApiKey, undefined);
  assert.equal(k.anthropicKeySource, null);
});

test('base URL ignores ANTHROPIC_BASE_URL', () => {
  const k = resolveKeys({ ANTHROPIC_BASE_URL: 'http://gateway.example', ANTHROPIC_API_KEY: 'a' });
  assert.equal(k.anthropicBaseURL, ANTHROPIC_API_URL);
  assert.equal(k.anthropicBaseURL, 'https://api.anthropic.com');
});
