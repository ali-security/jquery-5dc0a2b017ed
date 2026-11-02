#!/bin/bash
# Runs jQuery's QUnit browser suite (test/index.html) headlessly against the
# freshly built dist/ files, once with dist/jquery.min.js (the suite's default)
# and once with dist/jquery.js (?dev). See .github/seal/run-headless.js.
#
# The project's own build stays on Node 0.10; only the puppeteer-core driver
# needs a current Node, so it runs from a separate nvm-provisioned Node.
# The suite's ajax tests need PHP: it is served by PHP's built-in server, with
# several workers because some fixtures (data/core/dont_return.php) block.

cd "$(dirname "$0")/../.."

RUNNER_DIR="${RUNNER_DIR:-/tmp/jq-headless-runner}"
CHROME_BIN="${CHROME_BIN:-$(command -v google-chrome || command -v chromium)}"
export CHROME_BIN

. "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
nvm install 18
set -e
npm install --registry=https://registry.npmjs.org/ --prefix "$RUNNER_DIR" puppeteer-core@21.11.0
export PUPPETEER_MODULE="$RUNNER_DIR/node_modules/puppeteer-core"

php --version
"$CHROME_BIN" --version
PHP_CLI_SERVER_WORKERS=8 php -S 127.0.0.1:8000 > /tmp/php-server.log 2>&1 &
PHP_PID=$!
trap 'kill $PHP_PID' EXIT
sleep 2

node .github/seal/run-headless.js http://127.0.0.1:8000
node .github/seal/run-headless.js http://127.0.0.1:8000 dev
