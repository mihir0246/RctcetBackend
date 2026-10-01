import axios from 'axios';

const OLD_MEMBERS_SPREADSHEET_ID = '1SuwWpn2sUDohCIpnHLKYgWHxbhyo2cexnMJj0r2f0uE';

async function run() {
  const url = `https://docs.google.com/spreadsheets/d/${OLD_MEMBERS_SPREADSHEET_ID}/gviz/tq?sheet=${encodeURIComponent('Members')}&tq=select%20*`;
  const response = await axios.get(url);
  const data = JSON.parse(response.data.substr(47).slice(0, -2));
  
  const headers = data.table.cols.map(c => c.label);
  console.log("HEADERS:", headers);

  for (const row of data.table.rows) {
      const first = row.c[5]?.v || '';
      if (typeof first === 'string' && first.toLowerCase().includes('tiya')) {
          console.log("RAW ROW C for Tiya:");
          console.log(JSON.stringify(row.c, null, 2));
      }
  }
}
run().catch(console.error);
