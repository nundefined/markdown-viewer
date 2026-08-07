#!/bin/bash

# exit if any of the intermediate steps fail
set -e

# set current working directory to directory of the shell script
cd "$(dirname "$0")"

# before
npm ci 2> /dev/null || npm i
mkdir -p tmp

# mdc.min.js
npx rollup --config rollup.mjs --input mdc.mjs --file tmp/mdc.js
npx terser --compress --mangle -- tmp/mdc.js > tmp/mdc.min.js

# mdc.min.css
# mdc.css is checked in, compiled ahead of time from mdc.scss. MDC 0.3x needs a
# sass 1.x to build and would break on sass 2.0, so the compile is not part of
# the build. To regenerate it after changing mdc.scss or the @material versions:
#   npm i && npx sass --load-path=node_modules --no-source-map mdc.scss mdc.css
npx csso --input mdc.css --output tmp/mdc.min.css

# copy
cp tmp/mdc.min.* ../../vendor/

# after
rm -rf node_modules/ tmp/
