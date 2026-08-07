#!/bin/bash

# exit if any of the intermediate steps fail
set -e

browser=$1

if [ -z "$browser" ]; then
  echo "Specify target browser"
  echo "chrome, firefox"
  exit 1
fi

# set current working directory to directory of the shell script
cd "$(dirname "$0")"

# cleanup
rm -rf ../themes
rm -rf ../vendor
rm -f ../markdown-viewer.zip
mkdir -p ../themes
mkdir -p ../vendor

# build deps
sh bootstrap/build.sh
sh csso/build.sh
sh markdown-it/build.sh
sh marked/build.sh
sh mathjax/build.sh
sh mdc/build.sh
sh mermaid/build.sh
sh mithril/build.sh
sh panzoom/build.sh
sh prism/build.sh
sh remark/build.sh
sh themes/build.sh $browser

# verify that every dependency produced a non-empty artifact
for file in \
  themes/github.css \
  vendor/bootstrap.min.css \
  vendor/csso.min.js \
  vendor/markdown-it.min.js \
  vendor/marked.min.js \
  vendor/mathjax/tex-mml-chtml.js \
  vendor/mdc.min.css \
  vendor/mdc.min.js \
  vendor/mermaid.min.js \
  vendor/mithril.min.js \
  vendor/panzoom.min.js \
  vendor/prism-autoloader.min.js \
  vendor/prism-okaidia.min.css \
  vendor/prism.min.css \
  vendor/prism.min.js \
  vendor/remark.min.js
do
  if [ ! -s "../$file" ]; then
    echo "build failed: $file is missing or empty"
    exit 1
  fi
done

for dir in \
  themes \
  vendor/mathjax/extensions \
  vendor/mathjax/fonts \
  vendor/prism
do
  if [ -z "$(ls -A ../$dir 2> /dev/null)" ]; then
    echo "build failed: $dir is missing or empty"
    exit 1
  fi
done

# copy files
mkdir -p tmp
mkdir -p tmp/markdown-viewer
cd ..
cp -r background content icons options popup themes vendor LICENSE build/tmp/markdown-viewer/

# copy manifest.json
if [ "$browser" = "chrome" ]; then
  cp manifest.chrome.json build/tmp/markdown-viewer/manifest.json
  cp manifest.chrome.json manifest.json
elif [ "$browser" = "firefox" ]; then
  cp manifest.firefox.json build/tmp/markdown-viewer/manifest.json
  cp manifest.firefox.json manifest.json
fi

# archive the markdown-viewer folder itself
if [ "$browser" = "chrome" ]; then
  cd build/tmp/
  zip -r ../../markdown-viewer.zip markdown-viewer
  cd ..
# archive the contents of the markdown-viewer folder
elif [ "$browser" = "firefox" ]; then
  cd build/tmp/markdown-viewer/
  zip -r ../../../markdown-viewer.zip .
  cd ../../
fi

# cleanup
rm -rf tmp/
