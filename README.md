## Prerequisites

- Node 20+

## Install

- `sudo npm install -g npm@10.8.2`
- `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash`
- `nvm install 22 && nvm use 22`

# Running locally

- Run `cp .env.example .env.development`
- Run `npm run dev`

## Build

- Run `cp .env.example .env.production`
- Run `npm ci`
- Run `npm run build`
- Serve static assets in `./dist` with preferred tool. Ex. `npx run serve`
