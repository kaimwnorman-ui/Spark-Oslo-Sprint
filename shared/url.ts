// Addresses leave the browser only in a clean form: no password, no fragment, and no secret or
// tracking value in the query. Pure and tested; used in the browser and again on the server.

/** Query parameters that carry a secret, an identity or tracking. Everything else (?p=123, ?page=2) is kept: it identifies the page. */
const SECRET_PARAM = new RegExp(
  '^(' +
    [
      'utm_[\\w-]*', 'fbclid', 'gclid', 'dclid', 'msclkid', 'yclid', 'igshid', 'mc_eid', 'mc_cid', '_hsenc', '_hsmi', 'ref_src',
      '[\\w-]*token', 'auth', 'authorization', 'api[_-]?key', 'key', 'secret', '[\\w-]*secret', 'password', 'passwd', 'pwd', 'pass',
      'session', 'session[_-]?id', 'sid', 'sessid', 'code', 'state', 'otp', 'signature', 'sig', 'jwt', 'email', 'e-mail', 'mail', 'phone', 'ssn',
    ].join('|') +
    ')$',
  'i',
);

/** The address without credentials, fragment, or secret/tracking parameters; '' when it is not an http(s) address. */
export function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    u.username = '';
    u.password = '';
    u.hash = '';
    for (const key of new Set([...u.searchParams.keys()])) if (SECRET_PARAM.test(key)) u.searchParams.delete(key);
    return u.href;
  } catch {
    return '';
  }
}

/** A short, readable form for a preview: host and path only. */
export function shortUrl(raw: string, max = 60): string {
  try {
    const u = new URL(raw);
    const text = `${u.host}${u.pathname === '/' ? '' : u.pathname}`;
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  } catch {
    return '';
  }
}
