// Test script to debug invoice detail loading
const fetch = require('node-fetch');

async function testInvoiceDetail() {
    console.log('Testing invoice detail loading...');
    
    try {
        // Test API endpoint first
        console.log('1. Testing API endpoint...');
        const apiResponse = await fetch('http://159.65.181.148:3000/api/invoice-queue?limit=5');
        const apiData = await apiResponse.json();
        console.log('API working:', !!apiData.ok);
        console.log('Invoice count:', apiData.count);
        console.log('First invoice:', {
            id: apiData.invoices[0]?.id,
            invoice_number: apiData.invoices[0]?.invoice_number,
            vendor_name: apiData.invoices[0]?.vendor_name
        });
        
        // Test specific invoice lookup
        console.log('\n2. Testing specific invoice lookup...');
        const searchResponse = await fetch('http://159.65.181.148:3000/api/invoice-queue?search=44134561');
        const searchData = await searchResponse.json();
        console.log('Search working:', !!searchData.ok);
        console.log('Search results count:', searchData.count);
        if (searchData.invoices && searchData.invoices.length > 0) {
            console.log('Found invoice:', {
                id: searchData.invoices[0].id,
                invoice_number: searchData.invoices[0].invoice_number,
                vendor_name: searchData.invoices[0].vendor_name
            });
        }
        
        // Test invoice detail page
        console.log('\n3. Testing invoice detail page...');
        const pageResponse = await fetch('http://159.65.181.148:3000/InvoiceDetailPage?invoice=44134561');
        const pageHtml = await pageResponse.text();
        console.log('Page status:', pageResponse.status);
        console.log('Page contains "Invoice not found":', pageHtml.includes('Invoice not found'));
        console.log('Page contains "Loading invoice":', pageHtml.includes('Loading invoice'));
        console.log('Page size:', pageHtml.length, 'chars');
        
    } catch (error) {
        console.error('Error:', error);
    }
}

testInvoiceDetail();
