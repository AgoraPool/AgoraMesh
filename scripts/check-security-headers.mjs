import { readFileSync } from 'node:fs';

const netlify = readFileSync('netlify.toml', 'utf8');
const nginx = readFileSync('nginx.conf', 'utf8');
const required = ['Content-Security-Policy', 'Referrer-Policy', 'X-Content-Type-Options'];

for (const header of required) {
  if (!netlify.includes(header) || !nginx.includes(header)) {
    console.error(`Missing security header: ${header}`);
    process.exit(1);
  }
}

console.log('Security header configuration found.');
