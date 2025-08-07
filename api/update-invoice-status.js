import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  // Enable CORS for Vercel
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { invoice_number, status, approved } = req.body;

    if (!invoice_number || !status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log('Updating invoice:', { invoice_number, status, approved });

    // Read current queue from the public directory (accessible in Vercel)
    const queuePath = path.join(process.cwd(), 'public', 'invoice_queue.json');
    
    if (!fs.existsSync(queuePath)) {
      console.error('Queue file not found:', queuePath);
      return res.status(404).json({ error: 'Invoice queue not found' });
    }

    const queueData = fs.readFileSync(queuePath, 'utf8');
    const queue = JSON.parse(queueData);

    console.log('Current queue length:', queue.length);

    // Find and update the specific invoice
    let found = false;
    const updatedQueue = queue.map(inv => {
      if (inv.invoice_number === invoice_number) {
        found = true;
        const updated = {
          ...inv,
          status: status,
          ...(approved !== null && approved !== undefined && { approved: approved }),
          timestamp: new Date().toISOString()
        };
        console.log('Updated invoice:', updated);
        return updated;
      }
      return inv;
    });

    if (!found) {
      console.error('Invoice not found:', invoice_number);
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Save updated queue to public directory
    fs.writeFileSync(queuePath, JSON.stringify(updatedQueue, null, 2));
    console.log('Queue updated successfully');

    // Also update the root directory version if it exists
    const rootQueuePath = path.join(process.cwd(), 'invoice_queue.json');
    if (fs.existsSync(rootQueuePath)) {
      fs.writeFileSync(rootQueuePath, JSON.stringify(updatedQueue, null, 2));
      console.log('Root queue also updated');
    }

    res.status(200).json({ 
      success: true, 
      message: `Invoice ${invoice_number} status updated to ${status}`,
      updated_invoice: updatedQueue.find(inv => inv.invoice_number === invoice_number)
    });

  } catch (error) {
    console.error('Error updating invoice status:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
} 