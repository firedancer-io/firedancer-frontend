#!/bin/env bash
set -euf -o pipefail
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
cd "$SCRIPT_DIR"

module purge
module load nodejs-20.11.1

npm install
npm run dev
