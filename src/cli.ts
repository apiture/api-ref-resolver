#!/usr/bin/env node

import * as fs from 'fs';

import { Command } from 'commander';
import * as mkdirs from 'mkdirs';
import * as path from 'path';
import * as yaml from 'js-yaml';

import { version } from '../package.json';
import { ApiRefResolver } from './ApiRefResolver';
import type { ApiRefOptions } from './ApiRefResolver';

async function main(args: string[] = process.argv) {
  const cli = new Command();
  cli
    .version(version)
    .usage('[options]')
    .option('-i, --input <input-file>', 'An openapi.yaml or asyncapi.yaml file name or URL. Defaults to "pi.yaml"')
    .option('-o, --output <output-file>', 'The output file, defaults to stdout if omitted')
    .option('-f, --format [yaml|json]', 'Output format for stdout if no --output option is used; default to yaml')
    .option('-n, --no-markers', 'Do not add x-resolved-from and x-resolved-at markers')
    .option('-v, --verbose', 'Verbose output')
    .parse(args);
  const opts = cli.opts();
  const sourceFileName: string = opts.input || 'api.yaml';
  const outputFileName: string = opts.output;

  const resolver = new ApiRefResolver(sourceFileName);
  const options: ApiRefOptions = {};
  options.verbose = opts.verbose;
  options.noMarkers = opts.noMarkers;
  resolver
    .resolve(options)
    .then((resolved) => {
      if (outputFileName) {
        const outDir = path.dirname(outputFileName);
        mkdirs(outDir);
        fs.writeFileSync(outputFileName, yaml.dump(resolved.api), 'utf8');
      } else if (opts.format === 'json') {
        console.log(JSON.stringify(resolved.api, null, 2));
      } else {
        console.log(yaml.dump(resolved.api));
      }
    })
    .catch((ex) => {
      console.error(ex.message);
      process.exit(1);
    });
}

main(process.argv);
