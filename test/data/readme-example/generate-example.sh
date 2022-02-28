#!/usr/bin/env bash -x

if [[ ! -f components.yaml ]]
then cd test/data/readme-example
fi
node ../../../lib/src/cli.js -i api.yaml | sed 's@file:///.*test/data/readme-example/@@' | tee resolved-api.yaml
