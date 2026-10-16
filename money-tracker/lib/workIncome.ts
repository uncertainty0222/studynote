export interface WorkTour {
  name: string;
  people: string;
  settle: number | null;
  payout: number | null;
  tip: number | null;
  extraPlus: number | null;
  extraMinus: number | null;
  note: string;
}
export interface WorkMonth { month: number; total: number; tours: WorkTour[]; }
export interface WorkYear { year: number; total: number; months: WorkMonth[]; }

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += c;
  }
  if (cur !== '' || row.length > 0) { row.push(cur); rows.push(row); }
  return rows;
}

function money(s: string | undefined): number | null {
  if (!s) return null;
  const neg = s.includes('-');
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  if (isNaN(n)) return null;
  return neg ? -n : n;
}

// Layout of the "workandlife" tab: col A label, B 인원, E 결산, F 정산, G 팁, H 그외(+), I 그외(-), J 비고.
// Rows go: year ("2025") → month ("3월"/"03월") → one row per tour, until "총결산".
export function parseWorkSheet(text: string): WorkYear[] {
  const years: WorkYear[] = [];
  let year: WorkYear | null = null;
  let month: WorkMonth | null = null;

  for (const r of parseCsv(text)) {
    const label = (r[0] ?? '').trim();
    if (!label) continue;
    if (label.startsWith('총결산')) break;

    const ym = label.match(/^(\d{4})(년)?$/);
    if (ym) {
      year = { year: Number(ym[1]), total: money(r[4]) ?? 0, months: [] };
      years.push(year);
      month = null;
      continue;
    }
    const mm = label.match(/^0?(\d{1,2})\s*월$/);
    if (mm && year) {
      month = { month: Number(mm[1]), total: money(r[4]) ?? 0, tours: [] };
      year.months.push(month);
      continue;
    }
    const settle = money(r[4]);
    if (month) {
      month.tours.push({
        name: label,
        people: (r[1] ?? '').trim(),
        settle,
        payout: money(r[5]),
        tip: money(r[6]),
        extraPlus: money(r[7]),
        extraMinus: money(r[8]),
        note: (r[9] ?? '').trim(),
      });
    }
  }

  for (const y of years) {
    for (const m of y.months) {
      if (!m.total && m.tours.length) m.total = m.tours.reduce((s, t) => s + (t.settle ?? 0), 0);
    }
    if (!y.total) y.total = y.months.reduce((s, m) => s + m.total, 0);
  }
  return years;
}

export function isPublishedSheetCsvUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && u.hostname === 'docs.google.com'
      && u.pathname.startsWith('/spreadsheets/') && u.searchParams.get('output') === 'csv';
  } catch {
    return false;
  }
}
