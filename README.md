# github-dashboard

A local dashboard for tracking GitHub repositories, topic-based project groups, open issues, and pull requests. It integrates a multi-pane layout, command palette, and caching.

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

The application requires these environment variables:

* `PORT`: server listen port.
* `GITHUB_TOKEN`: A GitHub personal access token with permissions to read repositories, issues, and pull requests.

## Data Boundaries

Project metadata is derived from live GitHub repository topics. The dashboard does not persist project group state to a local database.

## License

This project is licensed under the MIT License.
