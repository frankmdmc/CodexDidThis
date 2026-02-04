const scratchersBody = document.getElementById('scratchersBody');
const statusMessage = document.getElementById('status');

const setStatus = (message = '') => {
  if (statusMessage) statusMessage.textContent = message;
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

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const fetchScratchersDocument = async (url) => {
  const errors = [];
  for (const proxy of proxies) {
    try {
      setStatus(`Fetching scratchers via ${proxy.name}...`);
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
      return { doc, rawText: content };
    } catch (error) {
      errors.push(`${proxy.name}: ${error.message}`);
    }
  }
  throw new Error(`Fetch failed. Tried ${errors.length} proxies. ${errors.join(' | ')}`);
};

const normalizeName = (value) => value.replace(/\s+/g, ' ').trim();

const parseGameInfoFromUrl = (url) => {
  const priceMatch = url.match(/\/scratchers\/\$?([0-9]+)/i);
  const price = priceMatch ? `$${priceMatch[1]}` : '—';
  const slug = url.split('/').filter(Boolean).pop() || '';
  const slugParts = slug.split('-');
  const lastPart = slugParts[slugParts.length - 1];
  const gameNumber = /^\d{3,}$/.test(lastPart) ? lastPart : '';
  const nameFromSlug = gameNumber ? slugParts.slice(0, -1).join(' ') : slugParts.join(' ');
  return {
    price,
    gameNumber,
    nameFromSlug: normalizeName(nameFromSlug.replace(/\bca(?:lifornia)?\b/gi, '')),
  };
};

const extractScratchersFromLinks = (doc, baseUrl) => {
  const links = Array.from(doc.querySelectorAll('a[href*="/scratchers/"]'));
  const items = new Map();

  links.forEach((link) => {
    const href = link.getAttribute('href');
    if (!href) return;
    if (!/\/scratchers\/\$?[0-9]+/i.test(href)) return;
    const absoluteUrl = new URL(href, baseUrl).toString();
    const { price, gameNumber, nameFromSlug } = parseGameInfoFromUrl(absoluteUrl);
    const textName = normalizeName(link.textContent);
    const name = textName || nameFromSlug || 'Unknown scratcher';
    const displayName = gameNumber ? `${name} (${gameNumber})` : name;
    if (items.has(absoluteUrl)) return;
    items.set(absoluteUrl, {
      price,
      name: displayName,
      url: absoluteUrl,
    });
  });

  return Array.from(items.values());
};

const renderScratchers = (scratchers) => {
  if (!scratchersBody) return;
  if (!scratchers.length) {
    scratchersBody.innerHTML =
      '<tr><td colspan="5">No scratchers found. Try again later.</td></tr>';
    return;
  }

  const rows = scratchers
    .map(
      (scratcher) => `<tr>
        <td>${escapeHtml(scratcher.price)}</td>
        <td><a href="${escapeHtml(scratcher.url)}" target="_blank" rel="noreferrer">${escapeHtml(
        scratcher.name
      )}</a></td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
      </tr>`
    )
    .join('');
  scratchersBody.innerHTML = rows;
};

const sortScratchers = (scratchers) =>
  scratchers.sort((a, b) => {
    const priceA = parseFloat((a.price || '').replace(/[^0-9.]/g, '')) || 0;
    const priceB = parseFloat((b.price || '').replace(/[^0-9.]/g, '')) || 0;
    if (priceA !== priceB) return priceA - priceB;
    return a.name.localeCompare(b.name);
  });

const loadScratchers = async () => {
  try {
    setStatus('Loading scratchers...');
    const { doc } = await fetchScratchersDocument('https://www.calottery.com/en/scratchers');
    const scratchers = sortScratchers(extractScratchersFromLinks(doc, window.location.href));
    renderScratchers(scratchers);
    setStatus(`Loaded ${scratchers.length} scratchers.`);
  } catch (error) {
    setStatus(`Error: ${error.message}`);
    renderScratchers([]);
  }
};

loadScratchers();
