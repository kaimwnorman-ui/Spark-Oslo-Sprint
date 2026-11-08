import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanUrl, shortUrl } from './url.ts';

test('credentials and fragments never leave the browser', () => {
  assert.equal(cleanUrl('https://user:hunter2@example.com/a#section-2'), 'https://example.com/a');
  assert.equal(cleanUrl('http://example.com:8080/a/'), 'http://example.com:8080/a/');
});

test('secret and tracking parameters are removed; parameters that identify the page stay', () => {
  assert.equal(cleanUrl('https://example.com/read?p=123&utm_source=x&fbclid=abc'), 'https://example.com/read?p=123');
  assert.equal(cleanUrl('https://example.com/a?token=SECRET&access_token=S2&page=2&api_key=K'), 'https://example.com/a?page=2');
  assert.equal(cleanUrl('https://example.com/a?session=1&SID=2&code=3&state=4&email=me%40x.com'), 'https://example.com/a');
  assert.equal(cleanUrl('https://example.com/a?id=7&sort=new'), 'https://example.com/a?id=7&sort=new');
});

test('anything that is not an http(s) address becomes empty', () => {
  for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'chrome://settings', 'not a url', '']) assert.equal(cleanUrl(bad), '', bad);
});

test('a short form for previews', () => {
  assert.equal(shortUrl('https://en.wikipedia.org/wiki/Tide?x=1'), 'en.wikipedia.org/wiki/Tide');
  assert.equal(shortUrl('https://example.com/'), 'example.com');
  assert.ok(shortUrl('https://example.com/' + 'a'.repeat(200)).length <= 60);
  assert.equal(shortUrl('nope'), '');
});
