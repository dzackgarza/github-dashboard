dev:
    direnv exec . npm run dev

build:
    npm run build

test:
    @just -f ~/ai-review-ci/justfiles/bun.just -d . test

test-ci:
    @just -f ~/ai-review-ci/justfiles/bun.just -d . test-ci
