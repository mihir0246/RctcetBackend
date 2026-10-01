import axios from 'axios';

const OLD_MEMBERS_SPREADSHEET_ID = '1SuwWpn2sUDohCIpnHLKYgWHxbhyo2cexnMJj0r2f0uE';

async function fetchFromSheet(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${OLD_MEMBERS_SPREADSHEET_ID}/gviz/tq?sheet=${encodeURIComponent(sheetName)}&tq=select%20*`;
  const response = await axios.get(url);
  const data = JSON.parse(response.data.substr(47).slice(0, -2));
  if (!data.table.rows.length) return [];
  const headers = data.table.cols.map(c => c.label);
  return data.table.rows.map((row) => {
    const record = {};
    headers.forEach((h, i) => { if (h) record[h.trim()] = row.c[i]?.v || ''; });
    return record;
  });
}

async function run() {
  const sheetMembers = await fetchFromSheet('Members');
  const tiya = sheetMembers.filter(r => {
     const first = r['First Name'] || r['Name'] || r.name || '';
     const last = r['Last Name'] || '';
     const full = `${first} ${last}`.trim().toLowerCase();
     return full.includes('tiya') && full.includes('agarwal');
  });
  console.log("FROM SHEET directly:");
  console.log(JSON.stringify(tiya, null, 2));
}
run().catch(console.error);
