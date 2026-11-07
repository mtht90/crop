import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer } from './server';

const port = Number(process.env.PORT ?? 8787);
const staticDir = process.env.STATIC_DIR ?? resolve(import.meta.dirname, '../../client/dist');
startServer({ port, staticDir: existsSync(staticDir) ? staticDir : undefined });
console.log(`Rune Arena server on :${port}${existsSync(staticDir) ? ` (static: ${staticDir})` : ''}`);
