#!/usr/bin/env bash

# Generate the resolved-api.yaml as noted in the project README.md

if [[ ! -f components.yaml ]]
then cd test/data/readme-example
fi

# Run the CLI then filter the file:// URLs for better README.
node ../../../lib/src/cli.js -i api.yaml | sed 's@file:///.*test/data/readme-example/@@' | tee resolved-api.yaml
