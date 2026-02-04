const results = document.getElementById('results');
const statusMessage = document.getElementById('status');
const calcButton = document.getElementById('calc');
const input = document.getElementById('ticketUrl');
const select = document.getElementById('ticketSelect');
const reconstructedTable = document.getElementById('reconstructedTable');
const mathExample = document.getElementById('mathExample');

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
    buildUrl: (url) => `https://r.jina.ai/http://${url.replace(/^https?:\/\//, '')}`,
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
      if (!prizeTable) {
        throw new Error('No prize table found in response.');
      }
      return { doc, prizeTable };
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
    const { doc, prizeTable } = await fetchTicketDocument(url);

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
      findTextByLabel('Price') ||
      findTextByLabel('Cost');
    data.gameNumber =
      xp('//*[@id="section-content-1-1"]//p[contains(text(),"Game")]/strong') || findTextByLabel('Game Number');
    data.overallOdds =
      xp('//*[@id="section-content-1-1"]//p[contains(text(),"Overall Odds")]/strong') ||
      findTextByLabel('Overall Odds');
    data.cashOdds =
      xp('//*[@id="section-content-1-1"]//p[contains(text(),"Cash Odds")]/strong') ||
      findTextByLabel('Cash Odds');

    const prizes = [];
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
      const oddsMatch = p.oddsRaw.match(/1\s*in\s*([0-9.]+)/i);
      p.oddsValue = oddsMatch ? parseFloat(oddsMatch[1]) : num(p.oddsRaw);
      p.totalTicketsEstimate = p.remaining && p.oddsValue ? p.remaining * p.oddsValue : 0;
      initialWinning += p.initial;
      currentWinning += p.remaining;
    });

    if (!initialWinning) {
      throw new Error('Could not calculate remaining prizes. Missing prize counts.');
    }

    const totalRemainingTickets = median(prizes.map((p) => p.totalTicketsEstimate));
    if (!totalRemainingTickets) {
      throw new Error('Could not calculate remaining ticket totals from prize odds.');
    }

    let evPrize = 0;
    prizes.forEach((p) => {
      p.probability = p.remaining / totalRemainingTickets;
      evPrize += p.probability * p.value;
    });

    data.expectedValue = (evPrize - ticketCost).toFixed(4);
    const out = `Name: ${data.name}\nCost: ${data.cost}\nGame Number: ${data.gameNumber}\nOverall Odds: ${data.overallOdds}\nCash Odds: ${data.cashOdds}\nExpected Ticket Value: ${data.expectedValue}`;
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
            <td>${formatCurrency(p.value)}</td>
          </tr>`
        )
        .join('');
      reconstructedTable.innerHTML = `
        <p class="note">We estimate total remaining tickets from each tier as Remaining × (1 in N odds), then use the median of those estimates to compute probabilities.</p>
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
              <th>Prize Value</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
        <p class="note">Total remaining tickets: ${formatNumber(totalRemainingTickets)}</p>
      `;
    }
    if (mathExample) {
      const sample = prizes.find((p) => p.totalTicketsEstimate);
      if (sample) {
        mathExample.textContent = `Example: For ${sample.prize}, total tickets estimate ≈ ${formatNumber(
          sample.remaining
        )} × ${formatNumber(sample.oddsValue)} = ${formatNumber(
          sample.totalTicketsEstimate
        )}. Median total tickets across tiers = ${formatNumber(
          totalRemainingTickets
        )}. Probability = ${formatNumber(sample.remaining)} ÷ ${formatNumber(
          totalRemainingTickets
        )} = ${formatNumber(sample.probability)}. Expected value contribution = probability × prize value.`;
      } else {
        mathExample.textContent =
          'Example: Total tickets are estimated as Remaining × (1 in N odds). Probability is Remaining divided by the median total tickets.';
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
