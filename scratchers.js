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
    buildUrl: (url) => {
      const scheme = url.startsWith('https://') ? 'https://' : 'http://';
      const normalized = url.replace(/^https?:\/\//, '');
      return `https://r.jina.ai/${scheme}${normalized}`;
    },
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

const fetchViaProxies = async (url, statusLabel) => {
  const errors = [];
  for (const proxy of proxies) {
    try {
      if (statusLabel) setStatus(`${statusLabel} via ${proxy.name}...`);
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

const extractScratchersFromText = (rawText, baseUrl) => {
  const items = new Map();
  if (!rawText) return [];
  const urlMatches = rawText.matchAll(
    /https?:\/\/[^"'\s)]+\/scratchers\/\$?\d+\/[a-z0-9-]+/gi
  );
  const pathMatches = rawText.matchAll(/\/scratchers\/\$?\d+\/[a-z0-9-]+/gi);

  const addUrl = (url) => {
    try {
      const absoluteUrl = new URL(url, baseUrl).toString();
      const { price, gameNumber, nameFromSlug } = parseGameInfoFromUrl(absoluteUrl);
      const displayName = gameNumber ? `${nameFromSlug} (${gameNumber})` : nameFromSlug;
      if (!items.has(absoluteUrl)) {
        items.set(absoluteUrl, {
          price,
          name: displayName || 'Unknown scratcher',
          url: absoluteUrl,
        });
      }
    } catch (error) {
      return;
    }
  };

  for (const match of urlMatches) {
    addUrl(match[0]);
  }
  for (const match of pathMatches) {
    addUrl(match[0]);
  }

  return Array.from(items.values());
};

const findScratchersApiUrl = (rawText, baseUrl) => {
  if (!rawText) return '';
  const absoluteMatch = rawText.match(
    /https?:\/\/www\.calottery\.com\/sitecore\/api\/ssc\/scratchers\/[a-z0-9/?&=_-]+/i
  );
  if (absoluteMatch) return absoluteMatch[0];
  const relativeMatch = rawText.match(/\/sitecore\/api\/ssc\/scratchers\/[a-z0-9/?&=_-]+/i);
  if (relativeMatch) return new URL(relativeMatch[0], baseUrl).toString();
  return '';
};

const calculateStatsFromPrizeTiers = (prizeTiers, ticketPrice) => {
  if (!prizeTiers.length) {
    return { calculatedCashOdds: null, expectedValue: null, claimedExpectedValue: null };
  }
  let totalPrizes = 0;
  let remainingPrizes = 0;
  let expectedValueNumerator = 0;
  let claimedExpectedValueNumerator = 0;
  const ticketEstimates = [];

  prizeTiers.forEach((tier) => {
    const total = Number(tier.totalNumberOfPrizes) || 0;
    const remaining = Number(tier.numberOfPrizesPending) || 0;
    const odds = Number(tier.odds);
    const value = Number(tier.value) || 0;
    if (total && Number.isFinite(odds)) {
      ticketEstimates.push(odds * total);
    }
    totalPrizes += total;
    remainingPrizes += remaining;
    expectedValueNumerator += value * remaining;
    claimedExpectedValueNumerator += value * total;
  });

  if (!remainingPrizes || !totalPrizes || !ticketEstimates.length) {
    return { calculatedCashOdds: null, expectedValue: null, claimedExpectedValue: null };
  }

  const estimatedTickets =
    ticketEstimates.reduce((sum, estimate) => sum + estimate, 0) / ticketEstimates.length;
  const remainingTickets = estimatedTickets * (remainingPrizes / totalPrizes);
  if (!remainingTickets) {
    return { calculatedCashOdds: null, expectedValue: null, claimedExpectedValue: null };
  }

  const claimedExpectedValue = claimedExpectedValueNumerator / estimatedTickets;
  const netClaimedExpectedValue =
    Number.isFinite(claimedExpectedValue) && Number.isFinite(ticketPrice)
      ? claimedExpectedValue - ticketPrice
      : null;
  const expectedValue = expectedValueNumerator / remainingTickets;
  const netExpectedValue =
    Number.isFinite(expectedValue) && Number.isFinite(ticketPrice)
      ? expectedValue - ticketPrice
      : null;

  return {
    calculatedCashOdds: remainingTickets / remainingPrizes,
    expectedValue: netExpectedValue,
    claimedExpectedValue: netClaimedExpectedValue,
  };
};

const parseScratchersFromGamesApi = (data, baseUrl) => {
  if (!data || typeof data !== 'object') return [];
  const games = Array.isArray(data.games) ? data.games : [];
  return games
    .map((game) => {
      const rawUrl = game.productPage || game.url || game.gameUrl || '';
      const name = game.name || game.gameName || '';
      const gameNumber = game.gameNumber || game.number || '';
      const price = game.price ?? '';
      const claimedCashOdds = game.cashOdds ?? '';
      const prizeTiers = Array.isArray(game.prizeTiers) ? game.prizeTiers : [];
      if (!rawUrl || !name) return null;
      let url = rawUrl;
      try {
        url = new URL(rawUrl, baseUrl).toString();
      } catch (error) {
        return null;
      }
      const priceLabel =
        typeof price === 'number' || /^\d/.test(String(price)) ? `$${price}` : price || '—';
      const displayName = gameNumber ? `${name} (${gameNumber})` : name;
      const numericPrice = Number(price);
      const stats = calculateStatsFromPrizeTiers(prizeTiers, numericPrice);
      return {
        price: priceLabel,
        name: displayName,
        url,
        claimedCashOdds,
        calculatedCashOdds: stats.calculatedCashOdds,
        claimedExpectedValue: stats.claimedExpectedValue,
        expectedValue: stats.expectedValue,
      };
    })
    .filter(Boolean);
};

const parseScratchersFromApiData = (data, baseUrl) => {
  if (!data) return [];
  const pickArray = (value) => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    const candidates = [
      value.scratchers,
      value.games,
      value.data,
      value.results,
      value.items,
      value.Scratchers,
      value.Games,
      value.Data,
      value.Results,
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
    }
    return [];
  };

  const records = Array.isArray(data) ? data : pickArray(data);
  return records
    .map((record) => {
      const rawUrl =
        record.gameUrl ||
        record.gameURL ||
        record.url ||
        record.link ||
        record.detailUrl ||
        record.detailURL ||
        record.detailPageUrl ||
        '';
      const name =
        record.gameName ||
        record.name ||
        record.title ||
        record.GameName ||
        record.Name ||
        record.Title ||
        '';
      const gameNumber =
        record.gameNumber ||
        record.GameNumber ||
        record.gameId ||
        record.GameId ||
        record.number ||
        '';
      const price =
        record.price ||
        record.Price ||
        record.ticketPrice ||
        record.TicketPrice ||
        record.cost ||
        record.Cost ||
        '';
      if (!rawUrl || !name) return null;
      let url = rawUrl;
      try {
        url = new URL(rawUrl, baseUrl).toString();
      } catch (error) {
        return null;
      }
      const priceLabel =
        typeof price === 'number' || /^\d/.test(String(price)) ? `$${price}` : price || '—';
      const displayName = gameNumber ? `${name} (${gameNumber})` : name;
      return {
        price: priceLabel,
        name: displayName,
        url,
      };
    })
    .filter(Boolean);
};

const extractScratchers = (doc, rawText, baseUrl) => {
  const items = new Map();
  const linkItems = extractScratchersFromLinks(doc, baseUrl);
  linkItems.forEach((item) => items.set(item.url, item));
  const textItems = extractScratchersFromText(rawText, baseUrl);
  textItems.forEach((item) => {
    if (!items.has(item.url)) items.set(item.url, item);
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
        <td>${formatOdds(scratcher.claimedCashOdds)}</td>
        <td>${formatOdds(scratcher.calculatedCashOdds)}</td>
        <td>${formatCurrency(scratcher.claimedExpectedValue)}</td>
        <td>${formatCurrency(scratcher.expectedValue)}</td>
      </tr>`
    )
    .join('');
  scratchersBody.innerHTML = rows;
};

const formatOdds = (value) => {
  const odds = Number(value);
  if (!Number.isFinite(odds) || odds <= 0) return '—';
  return `1 in ${odds.toFixed(2)}`;
};

const formatCurrency = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  const formatted = Math.abs(numeric).toFixed(2);
  return numeric < 0 ? `-$${formatted}` : `$${formatted}`;
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
    const sourceUrl = 'https://www.calottery.com/en/scratchers';
    const { doc, rawText } = await fetchScratchersDocument(sourceUrl);
    const baseUrl = new URL(sourceUrl).origin;
    let scratchers = [];
    try {
      const apiResponse = await fetchViaProxies(
        'https://www.calottery.com/api/games/scratchers',
        'Fetching scratchers data'
      );
      const apiData = JSON.parse(apiResponse);
      scratchers = parseScratchersFromGamesApi(apiData, baseUrl);
    } catch (error) {
      scratchers = [];
    }
    if (!scratchers.length) {
      const apiUrl = findScratchersApiUrl(rawText, baseUrl);
      if (apiUrl) {
        try {
          const apiResponse = await fetchViaProxies(apiUrl, 'Fetching scratchers data');
          const apiData = JSON.parse(apiResponse);
          scratchers = parseScratchersFromApiData(apiData, baseUrl);
        } catch (error) {
          scratchers = [];
        }
      }
    }
    if (!scratchers.length) {
      scratchers = extractScratchers(doc, rawText, baseUrl);
    }
    scratchers = sortScratchers(scratchers);
    renderScratchers(scratchers);
    setStatus(`Loaded ${scratchers.length} scratchers.`);
  } catch (error) {
    setStatus(`Error: ${error.message}`);
    renderScratchers([]);
  }
};

loadScratchers();
