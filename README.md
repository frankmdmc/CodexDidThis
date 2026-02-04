# California Scratch Ticket Expected Value Calculator

This repository contains a simple web page that estimates the expected value of a California Lottery scratch ticket. A few popular scratchers are available from a dropdown, or you can paste any scratcher URL. The script parses the ticket information and calculates the expected value based on the remaining prizes table.

## Live site (GitHub Pages)

After enabling GitHub Pages for this repository (Settings → Pages → Deploy from `main`/`master` + `/root`), the site is available at:

`https://frankmdmc.github.io/CodexDidThis/`

## Local usage

1. Open `index.html` in a modern browser (or host the repository with GitHub Pages).
2. Select a scratcher from the dropdown or paste a URL in the input field.
3. Click **Calculate**.

If you see a "Fetch failed" error on the live site, open `debug.html` and run the diagnostics.
Share the output so we can identify which proxy is failing.

The script scrapes the prize table and other details using XPath selectors similar to those used with `IMPORTXML` in Google Sheets. It then computes an estimated expected value by scaling the number of non‑winning tickets according to the ratio of remaining winning tickets.

**Note:** This tool relies on the structure of the California Lottery website. If the site's HTML changes or if cross-origin requests are blocked, the script may not work without adjustments.
To avoid cross-origin restrictions, the page fetches scratcher URLs through
multiple public proxies (including `api.allorigins.win` and `r.jina.ai`) so it
can fall back when one provider is unavailable.
