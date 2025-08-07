import express from 'express';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// API endpoint for updating invoice status
app.post('/update-invoice-status', async (req, res) => {
  try {
    const { invoice_number, status, approved } = req.body;

    if (!invoice_number || !status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log('Updating invoice:', { invoice_number, status, approved });

    // Read current queue from the public directory
    const queuePath = path.join(__dirname, 'public', 'invoice_queue.json');
    
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
    const rootQueuePath = path.join(__dirname, 'invoice_queue.json');
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
});

app.listen(PORT, () => {
  console.log(`Development API server running on http://localhost:${PORT}`);
}); 