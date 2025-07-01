#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as server from './server.js';

const argv = await yargs(hideBin(process.argv))
  .option('url', {
    description: 'URL for Knowledge web site',
    demandOption: true,
    type: 'string',
  })
  .help().argv;

await server.start({ url: argv.url });
