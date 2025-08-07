#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const INVOICE_NUMBER = process.argv[2];
const NEW_STATUS = process.argv[3];
const NEW_APPROVED = process.argv[4] === 'true';

if (!INVOICE_NUMBER || !NEW_STATUS) {
  console.log('Usage: node update_invoice_status.js <invoice_number> <status> [approved]');
  console.log('Example: node update_invoice_status.js 44007187 approved true');
  console.log('Example: node update_invoice_status.js 44007187 completed true');
  process.exit(1);
}

try {
  // Read current queue
  const queuePath = path.join(process.cwd(), 'public', 'invoice_queue.json');
  const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));

  // Find and update the specific invoice
  let found = false;
  const updatedQueue = queue.map(inv => {
    if (inv.invoice_number === INVOICE_NUMBER) {
      found = true;
      const updated = {
        ...inv,
        status: NEW_STATUS,
        ...(NEW_APPROVED !== null && { approved: NEW_APPROVED }),
        timestamp: new Date().toISOString()
      };
      console.log('Updated invoice:', updated);
      return updated;
    }
    return inv;
  });

  if (!found) {
    console.error('Invoice not found:', INVOICE_NUMBER);
    process.exit(1);
  }

  // Save updated queue
  fs.writeFileSync(queuePath, JSON.stringify(updatedQueue, null, 2));
  console.log('Queue updated successfully');

  // Also update the root directory version if it exists
  const rootQueuePath = path.join(process.cwd(), 'invoice_queue.json');
  if (fs.existsSync(rootQueuePath)) {
    fs.writeFileSync(rootQueuePath, JSON.stringify(updatedQueue, null, 2));
    console.log('Root queue also updated');
  }

  console.log(`✅ Invoice ${INVOICE_NUMBER} status updated to ${NEW_STATUS}`);

} catch (error) {
  console.error('Error updating invoice status:', error);
  process.exit(1);
} 