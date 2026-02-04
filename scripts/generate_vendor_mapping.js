#!/usr/bin/env node
/*
  Generate vendor mapping JSON from a QBO Transaction Detail CSV export.
  Input: pcs_qbo_transactions.csv (repo root)
  Output: pcs_ai_data/qbo_vendor_mappings.json
*/

const fs = require('fs');
const path = require('path');

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result.map((s) => s.trim());
}

function findHeaderIndex(lines) {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCsvLine(line);
    const joined = cols.map((c) => c.toLowerCase()).join('|');
    if (joined.includes('vendor') && joined.includes('account full name')) {
      return i;
    }
  }
  return -1;
}

function main() {
  const csvPath = path.resolve(process.cwd(), 'pcs_qbo_transactions.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('CSV not found:', csvPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const headerIdx = findHeaderIndex(lines);
  if (headerIdx === -1) {
    console.error('Could not locate header row containing "Vendor" and "Account full name"');
    process.exit(1);
  }

  const headerCols = parseCsvLine(lines[headerIdx]);
  const colIndex = (name) => headerCols.findIndex((c) => c.toLowerCase() === name.toLowerCase());
  const idxVendor = colIndex('Vendor');
  const idxAccount = colIndex('Account full name');
  const idxClass = colIndex('Class full name');
  const idxNum = colIndex('Num');
  const idxName = colIndex('Name');

  if (idxVendor === -1 || idxAccount === -1) {
    console.error('Required columns missing. Found header:', headerCols);
    process.exit(1);
  }

  const vendors = new Map();

  for (let i = headerIdx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const cols = parseCsvLine(line);

    const vendor = (cols[idxVendor] || '').trim();
    const account = (cols[idxAccount] || '').trim();
    const classFull = idxClass !== -1 ? (cols[idxClass] || '').trim() : '';
    const num = idxNum !== -1 ? (cols[idxNum] || '').trim() : '';
    const name = idxName !== -1 ? (cols[idxName] || '').trim() : '';

    if (!vendor) continue;
    if (!account && !classFull) continue;
    if (/^total/i.test(vendor)) continue;

    if (!vendors.has(vendor)) {
      vendors.set(vendor, {
        accounts: new Map(),
        classes: new Map(),
        samples: new Set(),
        rows: 0,
      });
    }
    const entry = vendors.get(vendor);
    entry.rows += 1;

    if (account) {
      entry.accounts.set(account, (entry.accounts.get(account) || 0) + 1);
    }
    if (classFull) {
      entry.classes.set(classFull, (entry.classes.get(classFull) || 0) + 1);
    }
    const inv = num || name;
    if (inv && entry.samples.size < 10) {
      entry.samples.add(inv);
    }
  }

  function topArray(map, total) {
    const arr = Array.from(map.entries()).map(([name, count]) => ({ name, count }));
    arr.sort((a, b) => b.count - a.count);
    return arr.map((x) => ({
      name: x.name,
      count: x.count,
      ratio: total > 0 ? Number((x.count / total).toFixed(4)) : 0,
    }));
  }

  const output = {};
  for (const [vendor, data] of vendors.entries()) {
    const total = data.rows;
    const topAccounts = topArray(data.accounts, total);
    const topClasses = topArray(data.classes, total);
    output[vendor] = {
      defaultAccount: topAccounts[0]?.name || null,
      defaultClass: topClasses[0]?.name || null,
      accounts: topAccounts,
      classes: topClasses,
      sampleInvoiceIds: Array.from(data.samples),
      sampleCount: total,
    };
  }

  const outDir = path.resolve(process.cwd(), 'pcs_ai_data');
  const outPath = path.join(outDir, 'qbo_vendor_mappings.json');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log('Wrote vendor mapping to', outPath, `(vendors: ${Object.keys(output).length})`);
}

main();


