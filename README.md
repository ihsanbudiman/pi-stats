# pi-stats

`pi-stats` is a Pi package that tracks token usage by local day, provider, and model.

It stores usage metadata only. It does not store prompts, assistant responses, tool output, project paths, session IDs, or session names.

## Install

```bash
pi install git:github.com/ihsanbudiman/pi-stats
```

## Commands

```text
/pi-stats                 Show last-7-days terminal summary
/pi-stats open            Open the local HTML dashboard
/pi-stats export [file]   Export a self-contained HTML report
/pi-stats db              Show the SQLite database path
```

## Storage

Default database path:

```text
~/.pi/agent/pi-stats/usage.sqlite
```

Override it with:

```bash
export PI_STATS_DB_PATH=/path/to/usage.sqlite
```

## Dashboard

`/pi-stats open` serves the dashboard at `http://127.0.0.1:7478/` (an ephemeral port is used if 7478 is taken). It shows stat tiles for total/input/output/cache tokens and estimated cost, a daily token chart with hover details, and provider/model breakdown tables.

Filters: a date-range picker (Today, Last 7 days, Last 30 days, or a custom range picked with two calendar clicks), plus provider and model dropdowns. All usage data is embedded in the page and filtering happens entirely in the browser — no server round-trips, and filters keep working even after the Pi session that served the page ends. The page is a snapshot; use its Refresh button to include events recorded after it loaded.

The dashboard is plain HTML, CSS, and JavaScript with no CDN assets and no frontend build step. `/pi-stats export` writes the same page as a single file, fully interactive offline.

## Pricing

Costs are estimates from Pi model metadata. If a model has no known pricing, `pi-stats` still records tokens and shows cost as `—`.
