import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { invoice_number, status, approved } = req.body;

    if (!invoice_number || !status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Read current queue
    const queuePath = path.join(process.cwd(), 'invoice_queue.json');
    const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));

    // Find and update the specific invoice
    const updatedQueue = queue.map(inv => {
      if (inv.invoice_number === invoice_number) {
        return {
          ...inv,
          status: status,
          ...(approved !== null && approved !== undefined && { approved: approved }),
          timestamp: new Date().toISOString()
        };
      }
      return inv;
    });

    // Save updated queue
    fs.writeFileSync(queuePath, JSON.stringify(updatedQueue, null, 2));

    // Also update the public version
    const publicQueuePath = path.join(process.cwd(), 'public', 'invoice_queue.json');
    fs.writeFileSync(publicQueuePath, JSON.stringify(updatedQueue, null, 2));

    res.status(200).json({ 
      success: true, 
      message: `Invoice ${invoice_number} status updated to ${status}` 
    });

  } catch (error) {
    console.error('Error updating invoice status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
} 