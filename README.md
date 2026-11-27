# Recall for Interviews

An iOS-first study app for software engineers preparing for technical interviews in English. Practice recalling a concept, explain a trade-off, and revisit it on a schedule that responds to how you did.

**Status: functional prototype, not a store release.** The public app uses sample, unreviewed study cards, stores reviews locally, and starts in English. Switch to Brazilian Portuguese to change the entire study experience without losing progress. See the [product plan](docs/product-plan.md).

**AI grading, accounts and sync are not implemented.** The [grading-service plan](docs/grading-service-plan.md) is an unapproved draft; it must not be treated as a deployed service or permission for paid provider calls.

## Run locally

Use the Node version in `.nvmrc`, then run `npm ci`, `npm test`, and `npm run typecheck`. On a Mac with Xcode and an iOS simulator, run `npx expo run:ios --configuration Release --device` and select a simulator. Physical iPhone validation and the commercial deck are separate release gates.

Example prompt: “When would a Layer 7 load balancer be a better choice than Layer 4? Name a trade-off.” Try answering before selecting “Submit answer.” You can type a response or answer aloud without recording; recording is planned for a later phase.
