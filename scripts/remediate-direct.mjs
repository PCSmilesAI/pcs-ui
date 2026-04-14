import fs from 'fs';

const j = JSON.parse(fs.readFileSync('pcs_ai_data/qbo_tokens.json', 'utf8'));
const TOKEN = j.accessToken;
const REALM = j.realmId || '9341454142489772';
const BASE = `https://quickbooks.api.intuit.com/v3/company/${REALM}`;

const APPLY = process.argv.includes('--apply');

async function qboQuery(sql) {
  const url = `${BASE}/query?query=${encodeURIComponent(sql)}&minorversion=70`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`QBO ${r.status}: ${(await r.text()).substring(0, 500)}`);
  return await r.json();
}

async function qboUpdate(entity, body) {
  const url = `${BASE}/${entity}?minorversion=70`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`QBO UPDATE ${r.status}: ${(await r.text()).substring(0, 500)}`);
  return await r.json();
}

(async () => {
  console.log(`[remediate] mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  const acctRes = await qboQuery('SELECT Id, Name, AccountType, AcctNum, FullyQualifiedName FROM Account WHERE Active = true MAXRESULTS 1000');
  const accounts = acctRes.QueryResponse.Account || [];
  const cogsIds = new Set();
  let targetAcct = null;
  for (const a of accounts) {
    if (a.AccountType === 'Cost of Goods Sold') cogsIds.add(a.Id);
    const full = `${a.AcctNum ? a.AcctNum + ' ' : ''}${a.FullyQualifiedName || a.Name}`;
    if ((full.includes('Lab Fees') || full.includes('Dental Lab')) && a.AccountType !== 'Cost of Goods Sold') {
      targetAcct = a;
    }
  }

  console.log('COGS account IDs:', [...cogsIds].join(', '));
  console.log('Target Lab Fees account:', targetAcct ? `${targetAcct.Id} ${targetAcct.FullyQualifiedName} (${targetAcct.AccountType})` : 'NOT FOUND');
  if (!targetAcct) { console.error('No Lab Fees expense account found!'); process.exit(1); }

  const vendorRes = await qboQuery('SELECT Id, DisplayName FROM Vendor WHERE Active = true MAXRESULTS 500');
  const vendors = vendorRes.QueryResponse.Vendor || [];
  const tcVendors = vendors.filter(v => {
    const n = (v.DisplayName || '').toLowerCase();
    return n.includes('tc dental') || n.includes('tcdental') || n.includes('tc_dental');
  });
  console.log('TC Dental vendors:', tcVendors.map(v => `${v.DisplayName} (${v.Id})`).join(', '));
  if (tcVendors.length === 0) { console.log('No TC Dental vendors found'); process.exit(0); }

  let allBills = [];
  for (const v of tcVendors) {
    let start = 1;
    while (true) {
      const sql = `SELECT * FROM Bill WHERE TxnDate >= '2026-03-01' AND VendorRef = '${v.Id}' STARTPOSITION ${start} MAXRESULTS 100`;
      const res = await qboQuery(sql);
      const batch = res.QueryResponse?.Bill || [];
      allBills.push(...batch);
      if (batch.length < 100) break;
      start += 100;
    }
  }
  console.log('Bills found since 2026-03-01:', allBills.length);

  let examined = 0, candidates = 0, fixed = 0, skippedPaid = 0, errors = 0;

  for (const bill of allBills) {
    examined++;
    if (Number(bill.Balance) === 0 && Number(bill.TotalAmt) > 0) {
      skippedPaid++;
      console.log('SKIP paid:', bill.Id, bill.DocNumber, 'TxnDate:', bill.TxnDate);
      continue;
    }

    const lines = Array.isArray(bill.Line) ? bill.Line : [];
    const fixFlags = lines.map(ln => {
      if (ln.DetailType !== 'AccountBasedExpenseLineDetail') return false;
      const aid = ln.AccountBasedExpenseLineDetail?.AccountRef?.value;
      return cogsIds.has(aid);
    });

    if (!fixFlags.some(Boolean)) continue;

    candidates++;
    const badCount = fixFlags.filter(Boolean).length;
    console.log(`FIX: Bill ${bill.Id} Doc:${bill.DocNumber} TxnDate:${bill.TxnDate} Balance:${bill.Balance} BadLines:${badCount}/${lines.length}`);

    for (let i = 0; i < lines.length; i++) {
      if (!fixFlags[i]) continue;
      const ln = lines[i];
      console.log(`  Line ${i}: $${ln.Amount} "${ln.AccountBasedExpenseLineDetail?.AccountRef?.name}" -> "${targetAcct.FullyQualifiedName}"`);
    }

    if (!APPLY) continue;

    const newLines = lines.map((ln, i) => {
      if (!fixFlags[i]) return ln;
      return {
        ...ln,
        AccountBasedExpenseLineDetail: {
          ...ln.AccountBasedExpenseLineDetail,
          AccountRef: { value: targetAcct.Id, name: targetAcct.FullyQualifiedName },
        },
      };
    });

    try {
      await qboUpdate('bill', {
        Id: bill.Id,
        SyncToken: bill.SyncToken,
        sparse: true,
        VendorRef: bill.VendorRef,
        Line: newLines,
      });
      fixed++;
      console.log(`  -> UPDATED bill ${bill.Id}`);
    } catch (e) {
      errors++;
      console.error(`  -> FAILED bill ${bill.Id}:`, e.message);
    }
  }

  console.log('\nSUMMARY:', { examined, candidates, fixed, skippedPaid, errors });
  if (errors > 0) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
