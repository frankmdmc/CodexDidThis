async function fetchTicket() {
  const url = document.getElementById('ticketUrl').value.trim();
  if (!url) return;
  document.getElementById('results').textContent = 'Loading...';
  try {
    // use a public CORS proxy so the browser can fetch the ticket page
    // `allorigins` expects the target URL in the `url` query parameter
    const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error('Fetch failed');
    const html = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const xp = (path) => doc.evaluate(path, doc, null, XPathResult.STRING_TYPE, null).stringValue.trim();

    const data = {};
    data.name = xp('/html/head/title');
    data.cost = xp('//*[@id="section-content-1-1"]//p[contains(text(),"Price") or contains(text(),"Cost")]/strong');
    data.gameNumber = xp('//*[@id="section-content-1-1"]//p[contains(text(),"Game")]/strong');
    data.overallOdds = xp('//*[@id="section-content-1-1"]//p[contains(text(),"Overall Odds")]/strong');
    data.cashOdds = xp('//*[@id="section-content-1-1"]//p[contains(text(),"Cash Odds")]/strong');

    const base = '//*[@id="section-content-1-3"]/div/div[2]/table/tbody';
    const prizes = [];
    for (let i = 2; i <= 11; i++) {
      const prize = xp(`${base}/tr[${i}]/td[1]`);
      if (!prize) break;
      const odds = xp(`${base}/tr[${i}]/td[2]`);
      const remaining = xp(`${base}/tr[${i}]/td[3]/span[1]`);
      const initial = xp(`${base}/tr[${i}]/td[3]/span[2]`);
      prizes.push({prize, odds, remaining, initial});
    }

    const num = (s) => parseFloat((s||'0').replace(/[^0-9.]+/g, '')) || 0;
    const ticketCost = num(data.cost);

    let initialWinning = 0, currentWinning = 0;
    prizes.forEach(p => {
      p.value = /ticket/i.test(p.prize) ? ticketCost : num(p.prize);
      p.remaining = num(p.remaining);
      p.initial = num(p.initial);
      initialWinning += p.initial;
      currentWinning += p.remaining;
    });

    const overall = parseFloat((data.overallOdds.match(/[0-9.]+/)||['0'])[0]);
    const totalInitial = initialWinning * overall;
    const initialLosing = totalInitial - initialWinning;
    const currentLosing = initialLosing * (currentWinning / initialWinning);
    const totalRemaining = currentWinning + currentLosing;

    let evPrize = 0;
    prizes.forEach(p => { evPrize += (p.remaining / totalRemaining) * p.value; });

    data.expectedValue = (evPrize - ticketCost).toFixed(4);
    let out = `Name: ${data.name}\nCost: ${data.cost}\nGame Number: ${data.gameNumber}\nOverall Odds: ${data.overallOdds}\nCash Odds: ${data.cashOdds}\nExpected Ticket Value: ${data.expectedValue}`;
    document.getElementById('results').textContent = out;
  } catch (err) {
    document.getElementById('results').textContent = 'Error: ' + err.message;
  }
}

document.getElementById('calc').addEventListener('click', fetchTicket);
const select = document.getElementById('ticketSelect');
if (select) {
  const input = document.getElementById('ticketUrl');
  input.value = select.value;
  select.addEventListener('change', () => {
    input.value = select.value;
  });
}
