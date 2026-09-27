
import fs from 'node:fs';

import path from 'node:path';

import { fileURLToPath } from 'node:url';



function resolveDotEnv(): string {

  const candidates = [

    path.resolve(process.cwd(), '.env'),

    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env'),

    '/var/www/payhub/.env',

  ];



  for (const candidate of candidates) {

    if (fs.existsSync(candidate)) return candidate;

  }



  return candidates[0]!;

}



export function loadDotEnv(file = resolveDotEnv()): void {

  if (!fs.existsSync(file)) return;



  const raw = fs.readFileSync(file, 'utf8');



  for (const line of raw.split(/\r?\n/)) {

    const trimmed = line.trim();



    if (!trimmed || trimmed.startsWith('#')) continue;



    const index = trimmed.indexOf('=');

    if (index < 1) continue;



    const key = trimmed.slice(0, index).trim();

    let value = trimmed.slice(index + 1).trim();



    if (

      (value.startsWith('"') && value.endsWith('"')) ||

      (value.startsWith("'") && value.endsWith("'"))

    ) {

      value = value.slice(1, -1);

    }



    if (process.env[key] === undefined) {

      process.env[key] = value;

    }

  }

}

