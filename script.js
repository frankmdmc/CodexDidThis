const results = document.getElementById('results');
const statusMessage = document.getElementById('status');
const calcButton = document.getElementById('calc');
const input = document.getElementById('ticketUrl');
const select = document.getElementById('ticketSelect');
const reconstructedTable = document.getElementById('reconstructedTable');
const mathExample = document.getElementById('mathExample');
const includeSmallPrizesToggle = document.getElementById('includeSmallPrizes');
const applyTaxToggle = document.getElementById('applyTax');
const taxRateInput = document.getElementById('taxRate');

const setStatus = (message = '') => {
  statusMessage.textContent = message;
};

const setLoading = (loading) => {
  calcButton.disabled = loading;
  if (loading) {
    results.textContent = '';
    if (reconstructedTable) reconstructedTable.innerHTML = '';
    if (mathExample) mathExample.textContent = '';
    setStatus('Loading ticket data...');
  }
};

const proxies = [
  {
    name: 'allorigins raw',
    buildUrl: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  },
  {
    name: 'allorigins get',
    buildUrl: (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    parse: (text) => {
      try {
        const data = JSON.parse(text);
        return {
          content: data.contents || '',
          warning: data.status?.http_code ? `HTTP ${data.status.http_code}` : '',
        };
      } catch (error) {
        return { content: '', warning: `JSON parse error: ${error.message}` };
      }
    },
  },
  {
    name: 'r.jina.ai',
    buildUrl: (url) => {
      const scheme = url.startsWith('https://') ? 'https://' : 'http://';
      const normalized = url.replace(/^https?:\/\//, '');
      return `https://r.jina.ai/${scheme}${normalized}`;
    },
  },
];

const findPrizeTable = (doc) => {
  const tables = Array.from(doc.querySelectorAll('table'));
  for (const table of tables) {
    const headerCells = Array.from(table.querySelectorAll('thead th'));
    const headerText = headerCells.map((cell) => cell.textContent.trim().toLowerCase()).join(' ');
    const hasPrize = headerText.includes('prize');
    const hasRemaining = headerText.includes('remaining');
    const hasOdds = headerText.includes('odds');
    if (hasPrize && hasRemaining) {
      return table;
    }
    if (headerCells.length === 0) {
      const firstRow = table.querySelector('tr');
      if (!firstRow) continue;
      const rowText = Array.from(firstRow.querySelectorAll('td, th'))
        .map((cell) => cell.textContent.trim().toLowerCase())
        .join(' ');
      if (rowText.includes('prize') && rowText.includes('remaining')) {
        return table;
      }
    }
    if (hasPrize && hasOdds) {
      return table;
    }
  }
  return null;
};

const fetchTicketDocument = async (url) => {
  const errors = [];
  for (const proxy of proxies) {
    try {
      setStatus(`Fetching via ${proxy.name}...`);
      const res = await fetch(proxy.buildUrl(url));
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const parsed = proxy.parse ? proxy.parse(text) : { content: text, warning: '' };
      const content = parsed.content?.trim() || '';
      if (!content) {
        throw new Error(parsed.warning || 'Empty response');
      }
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/html');
      const prizeTable = findPrizeTable(doc);
      return { doc, prizeTable, rawText: content };
    } catch (error) {
      errors.push(`${proxy.name}: ${error.message}`);
    }
  }
  throw new Error(`Fetch failed. Tried ${errors.length} proxies. ${errors.join(' | ')}`);
};

const textFromCell = (cell) => (cell ? cell.textContent.trim() : '');

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatNumber = (value) => {
  if (!Number.isFinite(value)) return 'n/a';
  return value.toLocaleString('en-US', { maximumFractionDigits: 6 });
};

const formatCurrency = (value) => {
  if (!Number.isFinite(value)) return 'n/a';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
};

const median = (values) => {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
};

const parseOddsValue = (text) => {
  if (!text) return 0;
  const match = text.match(/1\s*in\s*([0-9.,]+)/i);
  if (match) {
    return parseFloat(match[1].replace(/,/g, '')) || 0;
  }
  return parseFloat(text.replace(/[^0-9.]+/g, '')) || 0;
};

const extractLabelValue = (doc, labelRegex, valueRegex) => {
  const elements = doc.querySelectorAll('p, li, div, span');
  for (const el of elements) {
    const text = el.textContent.replace(/\s+/g, ' ').trim();
    if (!labelRegex.test(text)) continue;
    const strong = el.querySelector('strong');
    if (strong?.textContent.trim()) {
      return strong.textContent.trim();
    }
    if (valueRegex) {
      const match = text.match(valueRegex);
      if (match?.[1]) return match[1].trim();
    }
  }
  return '';
};

const parsePrizeCounts = (cell) => {
  if (!cell) return { remaining: '', initial: '' };
  const spans = cell.querySelectorAll('span');
  if (spans.length >= 2) {
    return {
      remaining: spans[0].textContent.trim(),
      initial: spans[1].textContent.trim(),
    };
  }
  const parts = cell.textContent.split(/\s+/).filter(Boolean);
  return { remaining: parts[0] || '', initial: parts[1] || '' };
};

const parsePrizeRowsFromText = (text) => {
  if (!text) return [];
  const rows = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const rowRegex = /^(\$[0-9,]+(?:\.[0-9]+)?|Ticket)\s+([0-9,]+)\s+([0-9,]+)\s+of\s+([0-9,]+)/i;
  for (const line of lines) {
    const match = line.match(rowRegex);
    if (!match) continue;
    rows.push({
      prize: match[1],
      odds: match[2],
      remaining: match[3],
      initial: match[4],
    });
  }
  return rows;
};

async function fetchTicket() {
  const url = input.value.trim();
  results.textContent = '';
  setStatus('');
  if (!url) {
    setStatus('Paste a valid California Lottery scratcher URL.');
    return;
  }
  try {
    new URL(url);
  } catch {
    setStatus('That URL does not look valid. Please double-check it.');
    return;
  }

  try {
    setLoading(true);
    const { doc, prizeTable, rawText } = await fetchTicketDocument(url);

    const xp = (path) => doc.evaluate(path, doc, null, XPathResult.STRING_TYPE, null).stringValue.trim();
    const findTextByLabel = (label) => {
      const lowerLabel = label.toLowerCase();
      const elements = doc.querySelectorAll('p, li, div');
      for (const el of elements) {
        const text = el.textContent.trim();
        if (text.toLowerCase().includes(lowerLabel)) {
          const strong = el.querySelector('strong');
          if (strong?.textContent.trim()) {
            return strong.textContent.trim();
          }
          const match = text.split(':').slice(1).join(':').trim();
          if (match) {
            return match;
          }
        }
      }
      return '';
    };
    const data = {};
    data.name = xp('/html/head/title') || 'Unknown ticket';
    data.cost =
      xp('//*[@id="section-content-1-1"]//p[contains(text(),"Price") or contains(text(),"Cost")]/strong') ||
      extractLabelValue(doc, /(price|cost)/i, /(?:price|cost)\s*:?\s*(\$?[0-9.,]+)/i);
    data.gameNumber =
      xp('//*[@id="section-content-1-1"]//p[contains(text(),"Game Number")]/strong') ||
      extractLabelValue(doc, /game\s*number/i, /game\s*number\s*:?\s*([0-9]+)/i);
    data.overallOdds =
      xp('//*[@id="section-content-1-1"]//p[contains(text(),"Overall Odds")]/strong') ||
      extractLabelValue(doc, /overall\s*odds/i, /(1\s*in\s*[0-9.,]+)/i);
    data.cashOdds =
      xp('//*[@id="section-content-1-1"]//p[contains(text(),"Cash Odds")]/strong') ||
      extractLabelValue(doc, /cash\s*odds/i, /(1\s*in\s*[0-9.,]+)/i);

    const prizes = [];
    if (prizeTable) {
      const rows = prizeTable.querySelectorAll('tbody tr').length
        ? prizeTable.querySelectorAll('tbody tr')
        : prizeTable.querySelectorAll('tr');
      rows.forEach((row, index) => {
        if (index === 0 && row.querySelectorAll('th').length) return;
        const cells = row.querySelectorAll('td');
        if (cells.length < 3) return;
        const { remaining, initial } = parsePrizeCounts(cells[2]);
        prizes.push({
          prize: textFromCell(cells[0]),
          odds: textFromCell(cells[1]),
          remaining,
          initial,
        });
      });
    } else {
      const textRows = parsePrizeRowsFromText(rawText);
      textRows.forEach((row) => prizes.push(row));
    }

    if (!prizes.length) {
      throw new Error('No prize table found. The page layout may have changed.');
    }

    const num = (s) => parseFloat((s || '0').replace(/[^0-9.]+/g, '')) || 0;
    const ticketCost = num(data.cost);

    let initialWinning = 0;
    let currentWinning = 0;
    prizes.forEach((p) => {
      p.value = /ticket/i.test(p.prize) ? ticketCost : num(p.prize);
      p.remaining = num(p.remaining);
      p.initial = num(p.initial);
      p.oddsRaw = p.odds;
      p.oddsValue = parseOddsValue(p.oddsRaw);
      p.totalTicketsEstimate = p.remaining && p.oddsValue ? p.remaining * p.oddsValue : 0;
      initialWinning += p.initial;
      currentWinning += p.remaining;
    });

    if (!initialWinning) {
      throw new Error('Could not calculate remaining prizes. Missing prize counts.');
    }

    const ticketTier = prizes.find((p) => /ticket/i.test(p.prize));
    let totalRemainingTickets = 0;
    if (ticketTier && ticketTier.initial && ticketTier.oddsValue) {
      const initialTotalTickets = ticketTier.initial * ticketTier.oddsValue;
      const remainingRatio = ticketTier.remaining / ticketTier.initial;
      totalRemainingTickets = initialTotalTickets * remainingRatio;
    }
    if (!totalRemainingTickets) {
      totalRemainingTickets = median(prizes.map((p) => p.totalTicketsEstimate));
    }
    if (!totalRemainingTickets) {
      throw new Error('Could not calculate remaining ticket totals from prize odds.');
    }

    const includeSmallPrizes = includeSmallPrizesToggle?.checked ?? true;
    const applyTax = applyTaxToggle?.checked ?? false;
    const taxRate = parseFloat(taxRateInput?.value || '0') / 100 || 0;

    let evPrize = 0;
    prizes.forEach((p) => {
      if (!includeSmallPrizes && p.value > 0 && p.value < 500) {
        p.valueAdjusted = 0;
      } else {
        p.valueAdjusted = p.value;
      }
      if (applyTax && p.valueAdjusted > 0 && !/ticket/i.test(p.prize)) {
        p.valueAdjusted = p.valueAdjusted * (1 - taxRate);
      }
      p.probability = p.remaining / totalRemainingTickets;
      evPrize += p.probability * p.valueAdjusted;
    });

    data.expectedValue = (evPrize - ticketCost).toFixed(4);
    const displayValue = (value) => (value ? value : 'n/a');
    const out = `Name: ${displayValue(data.name)}\nCost: ${displayValue(data.cost)}\nGame Number: ${displayValue(
      data.gameNumber
    )}\nOverall Odds: ${displayValue(data.overallOdds)}\nCash Odds: ${displayValue(
      data.cashOdds
    )}\nExpected Ticket Value: ${data.expectedValue}`;
    results.textContent = out;
    if (reconstructedTable) {
      const tableRows = prizes
        .map(
          (p) => `<tr>
            <td>${escapeHtml(p.prize)}</td>
            <td>${escapeHtml(p.oddsRaw)}</td>
            <td>${formatNumber(p.remaining)}</td>
            <td>${formatNumber(p.initial)}</td>
            <td>${formatNumber(p.oddsValue)}</td>
            <td>${formatNumber(p.totalTicketsEstimate)}</td>
            <td>${formatNumber(p.probability)}</td>
            <td>${formatCurrency(p.valueAdjusted)}</td>
          </tr>`
        )
        .join('');
      const estimationNote = ticketTier
        ? 'We anchor total remaining tickets to the Ticket tier, then compute probabilities as Remaining ÷ total.'
        : 'We estimate total remaining tickets from each tier as Remaining × (1 in N odds), then use the median of those estimates to compute probabilities.';
      reconstructedTable.innerHTML = `
        <p class="note">${estimationNote}</p>
        <table>
          <thead>
            <tr>
              <th>Prize</th>
              <th>Odds (1 in N)</th>
              <th>Remaining</th>
              <th>Total</th>
              <th>Parsed N</th>
              <th>Estimated Total Tickets (X×N)</th>
              <th>Probability</th>
              <th>Prize Value (Adjusted)</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
        <p class="note">Total remaining tickets: ${formatNumber(totalRemainingTickets)}</p>
        <p class="note">Adjustments: ${includeSmallPrizes ? 'include' : 'exclude'} prizes under $500, ${
          applyTax ? `apply ${formatNumber(taxRate * 100)}% tax` : 'no tax applied'
        }.</p>
      `;
    }
    if (mathExample) {
      const sample = prizes.find((p) => p.totalTicketsEstimate);
      if (sample) {
        const ticketRatio =
          ticketTier && ticketTier.initial ? ticketTier.remaining / ticketTier.initial : 0;
        const anchorText = ticketTier
          ? `Ticket tier anchor: ${formatNumber(ticketTier.remaining)} ÷ ${formatNumber(
              ticketTier.initial
            )} = ${formatNumber(ticketRatio)} remaining ratio.`
          : `Median total tickets across tiers = ${formatNumber(totalRemainingTickets)}.`;
        mathExample.textContent = `Example: For ${sample.prize}, total tickets estimate ≈ ${formatNumber(
          sample.remaining
        )} × ${formatNumber(sample.oddsValue)} = ${formatNumber(
          sample.totalTicketsEstimate
        )}. ${anchorText} Probability = ${formatNumber(sample.remaining)} ÷ ${formatNumber(
          totalRemainingTickets
        )} = ${formatNumber(sample.probability)}. Expected value contribution = probability × prize value.`;
      } else {
        mathExample.textContent =
          'Example: Total tickets are estimated as Remaining × (1 in N odds). Probability is Remaining divided by the estimated total tickets.';
      }
    }
    setStatus('Calculation complete.');
  } catch (err) {
    results.textContent = '';
    setStatus(`Error: ${err.message}`);
  } finally {
    setLoading(false);
  }
}

calcButton.addEventListener('click', fetchTicket);
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    fetchTicket();
  }
});

if (select) {
  input.value = select.value;
  select.addEventListener('change', () => {
    input.value = select.value;
  });
}
