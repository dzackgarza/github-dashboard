dev:
    PORT=3002 STATIC_DIST_DIR=./dist npm run dev

build:
    npm run build

test:
    npm run lint
    npm run test:unit
    npm run test:e2e
