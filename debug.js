const output = document.getElementById('debugOutput');
const debugButton = document.getElementById('runDebug');
const urlInput = document.getElementById('debugUrl');

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
        return { content: text, warning: `JSON parse error: ${error.message}` };
      }
    },
  },
  {
    name: 'r.jina.ai',
    buildUrl: (url) => `https://r.jina.ai/http://${url.replace(/^https?:\/\//, '')}`,
  },
];

const formatLine = (label, value) => `${label}: ${value ?? 'n/a'}`;

const runFetch = async (targetUrl, proxy) => {
  const start = performance.now();
  const response = await fetch(proxy.buildUrl(targetUrl));
  const duration = Math.round(performance.now() - start);
  const text = await response.text();
  const parsed = proxy.parse ? proxy.parse(text) : { content: text, warning: '' };
  const content = parsed.content || '';
  const snippet = content.slice(0, 500).replace(/\s+/g, ' ');
  return {
    name: proxy.name,
    url: proxy.buildUrl(targetUrl),
    ok: response.ok,
    status: response.status,
    duration,
    contentType: response.headers.get('content-type'),
    snippet: snippet || '(empty response)',
    warning: parsed.warning,
  };
};

const runDiagnostics = async () => {
  const targetUrl = urlInput.value.trim();
  output.textContent = '';
  if (!targetUrl) {
    output.textContent = 'Paste a scratcher URL before running diagnostics.';
    return;
  }
  try {
    new URL(targetUrl);
  } catch {
    output.textContent = 'That does not look like a valid URL.';
    return;
  }

  debugButton.disabled = true;
  output.textContent = `Running diagnostics for: ${targetUrl}\n`;
  for (const proxy of proxies) {
    output.textContent += `\n=== ${proxy.name} ===\n`;
    output.textContent += `${formatLine('Proxy URL', proxy.buildUrl(targetUrl))}\n`;
    try {
      const result = await runFetch(targetUrl, proxy);
      output.textContent += `${formatLine('HTTP status', `${result.status} (${result.ok ? 'ok' : 'not ok'})`)}\n`;
      output.textContent += `${formatLine('Duration', `${result.duration}ms`)}\n`;
      output.textContent += `${formatLine('Content-Type', result.contentType)}\n`;
      if (result.warning) {
        output.textContent += `${formatLine('Warning', result.warning)}\n`;
      }
      output.textContent += `${formatLine('Snippet', result.snippet)}\n`;
    } catch (error) {
      output.textContent += `${formatLine('Error', error.message)}\n`;
    }
  }
  debugButton.disabled = false;
};

debugButton.addEventListener('click', runDiagnostics);
urlInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    runDiagnostics();
  }
});
