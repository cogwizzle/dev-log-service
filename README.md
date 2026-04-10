# dev-log-service

[![CI](https://github.com/cogwizzle/dev-log-service/actions/workflows/ci.yml/badge.svg)](https://github.com/cogwizzle/dev-log-service/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/cogwizzle/dev-log-service/graph/badge.svg)](https://codecov.io/gh/cogwizzle/dev-log-service)

A local web service that aggregates developer activity from GitHub, JIRA, and Confluence, then uses Claude AI to generate daily Markdown activity reports.

## Setup

1. Install dependencies:

```sh
npm install
```

2. Run the setup script to auto-populate credentials from the jira-inator and confluence-inator plugins:

```sh
npm run setup
```

This fills in `JIRA_EMAIL`, `JIRA_API_TOKEN`, and `CONFLUENCE_URL` automatically.

AI summarization uses **AWS Bedrock** with your existing SSO credentials. Make sure your AWS SSO session is active before starting the server:

```sh
aws sso login --profile twilio-devex-bedrock
```

### Required environment variables

| Variable          | Description                                              |
| ----------------- | -------------------------------------------------------- |
| `AWS_PROFILE`     | AWS SSO profile name for Bedrock access                  |
| `CALENDAR_ICS_URL` | Google Calendar ICS subscription URL                   |
| `AWS_REGION`      | AWS region for Bedrock (e.g. `us-west-2`)                |
| `BEDROCK_MODEL_ID` | Bedrock model ID (defaults to `us.anthropic.claude-sonnet-4-5-20251001-v1:0`) |
| `CONFLUENCE_URL`  | Base URL of your Confluence instance                     |
| `GITHUB_ORGS`     | Comma-separated list of GitHub orgs to scope activity to |
| `GITHUB_TOKEN`    | GitHub personal access token (also used by `gh` CLI)     |
| `JIRA_API_TOKEN`  | Atlassian API token                                      |
| `JIRA_EMAIL`      | Email address associated with your Atlassian account     |
| `JIRA_URL`        | Base URL of your JIRA instance                           |
| `PORT`            | Port to run the server on (default: `1337`)              |
| `REPORTS_DIR`     | Path to write Markdown report files (default: `../dev-log`) |

## Running

```sh
# Development (auto-restarts on file changes)
npm run dev

# Production
npm start
```

The service runs at `http://localhost:3000`.

## Scheduled Reports

A cron job fires at **10:00 AM Monday–Friday** and generates a report for the previous business day. Monday generates Friday's report.

Reports are saved as Markdown files in `REPORTS_DIR` and stored in the local SQLite database (`dev-log.db`).

## API

### GitHub

```
GET /api/github?date=YYYY-MM-DD
```

Returns GitHub activity (authored PRs, reviewed PRs, commented PRs, commits) scoped to `GITHUB_ORGS`.

### JIRA

```
GET /api/jira?date=YYYY-MM-DD
```

Returns JIRA issues created, updated, and commented on by the configured user.

### Confluence

```
GET /api/confluence?date=YYYY-MM-DD
```

Returns Confluence pages created, pages updated, and comments written by the configured user.

### Reports

```
GET  /api/reports               # List all saved reports
GET  /api/reports/:date         # Get a specific report
POST /api/reports/generate      # Generate a report
```

**Generate body:**

```json
{ "date": "YYYY-MM-DD", "force": false }
```

Set `force: true` to regenerate an existing report.

## Testing

```sh
npm test
npm run test:coverage
```

## Linting & Formatting

```sh
npm run lint
npm run lint:fix
npm run format
```
