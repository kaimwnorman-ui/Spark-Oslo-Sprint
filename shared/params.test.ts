import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysAhead, teachSeconds } from './params.ts';

test('?teach: no value means the default applies (the 20 s bug)', () => {
  assert.equal(teachSeconds(null), null);
  assert.equal(teachSeconds(undefined), null);
  assert.equal(teachSeconds(''), null);
  assert.equal(teachSeconds('   '), null);
  assert.equal(teachSeconds('abc'), null);
  assert.equal(teachSeconds('NaN'), null);
  assert.equal(teachSeconds('0'), null);
  assert.equal(teachSeconds('-30'), null);
});

test('?teach: real values are kept between 20 and 300 seconds', () => {
  assert.equal(teachSeconds('90'), 90);
  assert.equal(teachSeconds('45.6'), 46);
  assert.equal(teachSeconds('5'), 20);
  assert.equal(teachSeconds('999'), 300);
});

test('?days: only a positive number moves the clock', () => {
  assert.equal(daysAhead(null), 0);
  assert.equal(daysAhead('abc'), 0);
  assert.equal(daysAhead('-3'), 0);
  assert.equal(daysAhead('4'), 4);
  assert.equal(daysAhead('4.9'), 4);
  assert.equal(daysAhead('9999'), 365);
});
