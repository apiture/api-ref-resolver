#!/usr/bin/env node

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { ApiRefOptions, ApiRefResolver } from './resolver';
import { version } from '../package.json';
import { Command } from 'commander';

async function main(args: string[] = process.argv) {
  const cli = new Command();
  cli
    .version(version)
    .usage('[options]')
    .option('-i, --input <input-file>', 'Path of an openapi.yaml or asyncapi.yaml file, defaults to "openapi.yaml"')
    .option('-o, --output <output-file>', 'The output file, defaults to stdout if omitted')
    .option('-f, --format [yaml|json]', 'Output format for stdout if no --output option is used; default to yaml')
    .option('-v, --verbose', 'Verbose output')
    .parse(args);
  const opts = cli.opts();
  const sourceFileName = opts.input;
  const outputFileName = opts.output;
  const sourceText = fs.readFileSync(sourceFileName, 'utf8');
  const openApiObject = yaml.load(sourceText);
  const options: ApiRefOptions = {};
  options.verbose = opts.verbose;
  const resolver = new ApiRefResolver();
  resolver
    .resolve(openApiObject, sourceFileName, options)
    .then(function (resolved) {
      if (outputFileName) {
        fs.writeFileSync(outputFileName, yaml.dump(resolved.api), 'utf8');
      } else {
        if (opts.format === 'json') {
          console.log(JSON.stringify(resolved.api, null, 2));
        } else {
          console.log(yaml.dump(resolved.api));
        }
      }
    })
    .catch(function (ex) {
      console.error(ex.message);
      process.exit(1);
    });
}

main(process.argv);
