dev:
    direnv exec . npm run dev

build:
    npm run build

test:
    npm run lint
    npm run test:unit
    npm run test:e2e
