// One-time: make the public key that fixes the extension ID (manifest "key").
// Prints the key and the ID it gives. The private key is never written anywhere:
// we only need the ID to stay stable for "load unpacked" and CORS.
import { generateKeyPairSync } from 'node:crypto';
import { extensionIdFromKey } from './lib.mjs';

const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
console.log(JSON.stringify({ key, id: extensionIdFromKey(key) }, null, 2));
