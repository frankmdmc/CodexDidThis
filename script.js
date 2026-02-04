const results = document.getElementById('results');
const statusMessage = document.getElementById('status');
const calcButton = document.getElementById('calc');
const input = document.getElementById('ticketUrl');
const select = document.getElementById('ticketSelect');

const setStatus = (message = '') => {
  statusMessage.textContent = message;
};

const setLoading = (loading) => {
  calcButton.disabled = loading;
  if (loading) {
    results.textContent = '';
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

const fetchTicketHtml = async (url) => {
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
      return content;
    } catch (error) {
      errors.push(`${proxy.name}: ${error.message}`);
    }
  }
  throw new Error(`Fetch failed. Tried ${errors.length} proxies. ${errors.join(' | ')}`);
};

const textFromCell = (cell) => (cell ? cell.textContent.trim() : '');

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
    const html = await fetchTicketHtml(url);
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const xp = (path) => doc.evaluate(path, doc, null, XPathResult.STRING_TYPE, null).stringValue.trim();
    const data = {};
    data.name = xp('/html/head/title') || 'Unknown ticket';
    data.cost = xp('//*[@id="section-content-1-1"]//p[contains(text(),"Price") or contains(text(),"Cost")]/strong');
    data.gameNumber = xp('//*[@id="section-content-1-1"]//p[contains(text(),"Game")]/strong');
    data.overallOdds = xp('//*[@id="section-content-1-1"]//p[contains(text(),"Overall Odds")]/strong');
    data.cashOdds = xp('//*[@id="section-content-1-1"]//p[contains(text(),"Cash Odds")]/strong');

    const prizes = [];
    const rows = doc.querySelectorAll('#section-content-1-3 table tbody tr');
    rows.forEach((row, index) => {
      if (index === 0) return;
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
      initialWinning += p.initial;
      currentWinning += p.remaining;
    });

    if (!initialWinning) {
      throw new Error('Could not calculate remaining prizes. Missing prize counts.');
    }

    const overall = parseFloat((data.overallOdds.match(/[0-9.]+/) || ['0'])[0]);
    if (!overall) {
      throw new Error('Overall odds were not found. The ticket page may have changed.');
    }
    const totalInitial = initialWinning * overall;
    const initialLosing = totalInitial - initialWinning;
    const currentLosing = initialLosing * (currentWinning / initialWinning);
    const totalRemaining = currentWinning + currentLosing;
    if (!totalRemaining) {
      throw new Error('Could not calculate remaining ticket totals.');
    }

    let evPrize = 0;
    prizes.forEach((p) => {
      evPrize += (p.remaining / totalRemaining) * p.value;
    });

    data.expectedValue = (evPrize - ticketCost).toFixed(4);
    const out = `Name: ${data.name}\nCost: ${data.cost}\nGame Number: ${data.gameNumber}\nOverall Odds: ${data.overallOdds}\nCash Odds: ${data.cashOdds}\nExpected Ticket Value: ${data.expectedValue}`;
    results.textContent = out;
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
