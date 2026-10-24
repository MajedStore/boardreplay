# Validation record

Validated on 24 October 2026 in the Windows workspace with Node.js 24.15.0.

| Command | Observed result |
| --- | --- |
| `npm install` | Dependencies installed; lockfile saved |
| `npm run db:generate` | Prisma 7.10.1 client generated |
| `npm run db:migrate` | Initial migration applied to local SQLite; a second fresh database also initialized successfully |
| `npm run demo:frames` | Four original synthetic PNG frames generated |
| `npm test` | **52 tests passed** across four suites |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed with no warnings |
| `npm run build` | Optimized production build passed |
| `npm run start` | Production server started successfully |
| `npm run test:e2e` against production | **4 tests passed** in 17.1 seconds |

The production browser journeys covered creating a lesson, real multipart image uploads, ordering, rotation, deletion, sample replay and keyboard navigation, source inspection, manual correction with reload, revision restore, print export readiness, mobile tabs and viewport bounds. The comparison journey exercised three explicitly labeled test submissions, human scoring, gated ranking, reference persistence, prepared JPEG download and equivalent instructions, CSV export, report persistence, and a four-page report PDF.

Tests use isolated temporary SQLite databases or lessons, mock AI responses, and remove their fixture records. Test rubric scores and response text are software fixtures, not academic experiment findings. Browser test artifacts are in `test-results/`; the delivered sample lesson contains no invented provider benchmark results.

No live provider credentials were configured or used. OpenAI, Gemini, and Anthropic SDK request formats, structured responses, source validation, retries, successful processing persistence, and failure recovery were checked with mocked providers. Account-specific access, billing, quota, and live handwriting quality still require the real-key smoke test in README.

Production UI screenshots are in `screenshots/`. The print view produced a three-page sample lesson PDF with no KaTeX errors. Its pages were rendered and visually inspected; fractions, radicals, aligned derivations, and boxed expressions were also checked in a separate browser rendering fixture.

Development uses supported Webpack mode because Turbopack's filesystem tracking repeatedly refreshed pages with local data in this Windows environment. Production builds use the default build engine. Advanced cropping, rich annotations, symbolic proof checking, and distributed job processing remain outside this MVP.
