#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import {server} from './index.js';

async function main(){
const argv = await yargs(hideBin(process.argv))
  .option('url', {
    description: 'URL for Knowledge web site',
    demandOption: true,
    type: 'string',
  })
  .help().argv;

await server.start({ url: argv.url });
}

main().catch(error=>{
  console.error(error);
  process.exit(1);
});
