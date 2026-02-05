const prizeBody = document.getElementById('examplePrizeBody');
const results = document.getElementById('results');
const mathSection = document.getElementById('exampleMath');
const calcButton = document.getElementById('exampleCalc');
const ticketNameInput = document.getElementById('ticketName');
const ticketPriceInput = document.getElementById('ticketPrice');
const includeSmallToggle = document.getElementById('includeSmallPrizesExample');
const applyTaxToggle = document.getElementById('applyTaxExample');
const taxRateInput = document.getElementById('taxRateExample');
const mathText = document.getElementById('exampleMathText');
const mathTable = document.getElementById('exampleMathTable');

const defaultPrizeTiers = [
  { prize: 'Ticket', odds: '1 in 6.00', remaining: 1200, total: 3000 },
  { prize: '$10', odds: '1 in 12.00', remaining: 600, total: 1500 },
  { prize: '$25', odds: '1 in 60.00', remaining: 110, total: 300 },
  { prize: '$50', odds: '1 in 250.00', remaining: 30, total: 90 },
  { prize: '$500', odds: '1 in 2000.00', remaining: 4, total: 12 },
  { prize: '$10,000', odds: '1 in 20000.00', remaining: 1, total: 3 },
];

const formatNumber = (value) => {
  if (!Number.isFinite(value)) return 'n/a';
  return value.toLocaleString('en-US', { maximumFractionDigits: 6 });
};

const formatCurrency = (value) => {
  if (!Number.isFinite(value)) return 'n/a';
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4,
  });
};

const parseOddsValue = (text) => {
  if (!text) return 0;
  const match = text.match(/1\s*in\s*([0-9.,]+)/i);
  if (match) {
    return parseFloat(match[1].replace(/,/g, '')) || 0;
  }
  return parseFloat(text.replace(/[^0-9.]+/g, '')) || 0;
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

const num = (value) => parseFloat(String(value).replace(/[^0-9.]+/g, '')) || 0;

const renderRows = () => {
  if (!prizeBody) return;
  prizeBody.innerHTML = defaultPrizeTiers
    .map(
      (tier, index) => `<tr>
        <td><input type="text" data-field="prize" data-index="${index}" value="${tier.prize}" /></td>
        <td><input type="text" data-field="odds" data-index="${index}" value="${tier.odds}" /></td>
        <td><input type="number" data-field="remaining" data-index="${index}" value="${tier.remaining}" /></td>
        <td><input type="number" data-field="total" data-index="${index}" value="${tier.total}" /></td>
      </tr>`
    )
    .join('');
};

const readRows = () => {
  const rows = [];
  prizeBody.querySelectorAll('tr').forEach((row) => {
    const prize = row.querySelector('[data-field="prize"]').value;
    const odds = row.querySelector('[data-field="odds"]').value;
    const remaining = num(row.querySelector('[data-field="remaining"]').value);
    const total = num(row.querySelector('[data-field="total"]').value);
    rows.push({ prize, odds, remaining, total });
  });
  return rows;
};

const renderBreakdown = ({
  ticketCost,
  includeSmall,
  applyTax,
  taxRate,
  totalRemainingTickets,
  evPrize,
  expectedValue,
  prizes,
}) => {
  if (mathText) {
    const lines = prizes
      .map((p) => {
        const excludedText = p.excludedUnder500 ? ' (excluded under $500 rule)' : '';
        const taxText = p.taxApplied ? ` then tax-adjusted to ${formatCurrency(p.valueAdjusted)}` : '';
        return `${p.prize}: probability = ${formatNumber(p.remaining)} ÷ ${formatNumber(
          totalRemainingTickets
        )} = ${formatNumber(p.probability)}; contribution = ${formatNumber(
          p.probability
        )} × ${formatCurrency(p.valueAdjusted)} = ${formatCurrency(p.contribution)}${excludedText}${taxText}.`;
      })
      .join(' ');

    mathText.textContent =
      `Step 1) Estimate remaining ticket pool. ` +
      `Total remaining tickets = ${formatNumber(totalRemainingTickets)}. ` +
      `Step 2) For each prize, calculate probability = remaining prizes / remaining tickets and multiply by adjusted prize value. ` +
      `Step 3) Sum all prize contributions = ${formatCurrency(evPrize)}. ` +
      `Step 4) Net EV = gross EV (${formatCurrency(evPrize)}) - ticket cost (${formatCurrency(
        ticketCost
      )}) = ${formatCurrency(expectedValue)}. ` +
      `Current toggles: ${includeSmall ? 'including' : 'excluding'} prizes under $500, ` +
      `${applyTax ? `tax applied at ${formatNumber(taxRate * 100)}%` : 'no tax adjustment'}. ` +
      lines;
  }

  if (mathTable) {
    const rows = prizes
      .map(
        (p) => `<tr>
          <td>${p.prize}</td>
          <td>${formatNumber(p.remaining)}</td>
          <td>${formatNumber(totalRemainingTickets)}</td>
          <td>${formatNumber(p.probability)}</td>
          <td>${formatCurrency(p.valueAdjusted)}</td>
          <td>${formatCurrency(p.contribution)}</td>
        </tr>`
      )
      .join('');
    mathTable.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Prize</th>
            <th>Remaining</th>
            <th>Remaining Tickets</th>
            <th>Probability</th>
            <th>Adjusted Prize Value</th>
            <th>EV Contribution</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }
};

const calculateExample = () => {
  const ticketName = ticketNameInput?.value || 'Example Ticket';
  const ticketCost = num(ticketPriceInput?.value || '0');
  const includeSmall = includeSmallToggle?.checked ?? true;
  const applyTax = applyTaxToggle?.checked ?? false;
  const taxRate = parseFloat(taxRateInput?.value || '0') / 100 || 0;

  const prizes = readRows();
  let totalRemainingTickets = 0;

  prizes.forEach((p) => {
    p.value = /ticket/i.test(p.prize) ? ticketCost : num(p.prize);
    p.oddsValue = parseOddsValue(p.odds);
    p.totalTicketsEstimate = p.remaining && p.oddsValue ? p.remaining * p.oddsValue : 0;
  });

  const ticketTier = prizes.find((p) => /ticket/i.test(p.prize));
  if (ticketTier && ticketTier.total && ticketTier.oddsValue) {
    const initialTotalTickets = ticketTier.total * ticketTier.oddsValue;
    const remainingRatio = ticketTier.remaining / ticketTier.total;
    totalRemainingTickets = initialTotalTickets * remainingRatio;
  }
  if (!totalRemainingTickets) {
    totalRemainingTickets = median(prizes.map((p) => p.totalTicketsEstimate));
  }

  let evPrize = 0;
  prizes.forEach((p) => {
    p.excludedUnder500 = !includeSmall && p.value > 0 && p.value < 500;
    if (p.excludedUnder500) {
      p.valueAdjusted = 0;
    } else {
      p.valueAdjusted = p.value;
    }
    p.taxApplied = false;
    if (applyTax && p.valueAdjusted > 0 && !/ticket/i.test(p.prize)) {
      p.valueAdjusted = p.valueAdjusted * (1 - taxRate);
      p.taxApplied = true;
    }
    p.probability = totalRemainingTickets ? p.remaining / totalRemainingTickets : 0;
    p.contribution = p.probability * p.valueAdjusted;
    evPrize += p.contribution;
  });

  const expectedValue = evPrize - ticketCost;
  results.textContent = `Name: ${ticketName}\nTicket cost: ${formatCurrency(
    ticketCost
  )}\nExpected value: ${formatCurrency(expectedValue)}\nGross expected return: ${formatCurrency(
    evPrize
  )}\nTotal remaining tickets: ${formatNumber(totalRemainingTickets)}`;
  mathSection.textContent = `Adjustments: ${includeSmall ? 'include' : 'exclude'} prizes under $500; ${
    applyTax ? `apply ${formatNumber(taxRate * 100)}% tax` : 'no tax applied'
  }.`;

  renderBreakdown({
    ticketCost,
    includeSmall,
    applyTax,
    taxRate,
    totalRemainingTickets,
    evPrize,
    expectedValue,
    prizes,
  });
};

calcButton.addEventListener('click', calculateExample);
document.addEventListener('input', (event) => {
  if (
    event.target?.closest('#examplePrizeBody') ||
    event.target?.id?.includes('Example') ||
    event.target?.id === 'ticketName' ||
    event.target?.id === 'ticketPrice'
  ) {
    calculateExample();
  }
});

renderRows();
calculateExample();
