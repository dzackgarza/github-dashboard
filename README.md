# github-dashboard

A local dashboard for tracking GitHub repositories, project groups, open issues, and pull requests. It integrates a multi-pane layout, command palette, and caching.

## Installation

```bash
npm install
```

## Usage

Start the development server:

```bash
just dev
```

The server listens on `http://localhost:3002`.

To run verification checks and end-to-end tests:

```bash
just test
```

## Configuration

The application requires the following environment variable:

* `GITHUB_TOKEN`: A GitHub personal access token with permissions to read repositories, issues, and pull requests.

The following configurations are statically hardcoded in the codebase:

* **Server Port**: Port `3002` (non-configurable).
* **Database Storage**: Persistence is stored locally at `data/db.json` resolved relative to the working directory.
* **Build Output**: Static assets compile to `dist`.

## Data Boundaries and Mocks

To limit rate consumption and simplify display logic, the application uses faked endpoints and mock data schemas:

* **Security Alerts**: Dependabot security alerts count is hardcoded to `0` for all repository listings.
* **Commit Dates**: Commit history relative push dates are synthesized locally relative to `Date.now()` with 4-hour offsets.
* **Telemetry**: Synchronization timestamps are set on server boot and do not refresh on subsequent successful cache synchronizations.

## License

This project is licensed under the MIT License.
