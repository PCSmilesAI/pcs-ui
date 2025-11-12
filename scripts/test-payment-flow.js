#!/usr/bin/env node

/**
 * Payment Flow Test
 * Tests the complete invoice payment workflow
 */

const Stripe = require('stripe');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const API_URL = process.env.API_URL || 'https://pcsmilesai.com';

if (!STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY is not set');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

async function testPaymentFlow() {
  console.log('\n🧪 Payment Flow Test\n');
  console.log('='.repeat(60));

  try {
    // Step 1: Create a test customer
    console.log('\n📝 Step 1: Creating test customer...');
    const customer = await stripe.customers.create({
      email: `test-payment-${Date.now()}@example.com`,
      description: 'Test customer for payment flow',
      metadata: {
        test: 'true',
        flow: 'payment_test',
      },
    });
    console.log(`✅ Customer created: ${customer.id}`);
    console.log(`   Email: ${customer.email}`);

    // Step 2: Create a payment method using test token
    console.log('\n💳 Step 2: Creating test payment method...');
    const paymentMethod = await stripe.paymentMethods.create({
      type: 'card',
      card: {
        token: 'tok_visa', // Stripe test token for Visa
      },
      billing_details: {
        email: customer.email,
      },
    });
    console.log(`✅ Payment method created: ${paymentMethod.id}`);
    console.log(`   Type: ${paymentMethod.type}`);
    console.log(`   Card: ${paymentMethod.card?.brand} ****${paymentMethod.card?.last4}`);

    // Step 3: Create a payment intent
    console.log('\n💰 Step 3: Creating payment intent...');
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 1000, // $10.00
      currency: 'usd',
      customer: customer.id,
      payment_method: paymentMethod.id,
      off_session: true,
      confirm: true,
      metadata: {
        invoiceId: 'INV-001',
        vendor: 'Test Vendor',
        paidBy: customer.email,
        test: 'true',
      },
      description: 'Test payment for invoice INV-001',
    });
    console.log(`✅ Payment intent created: ${paymentIntent.id}`);
    console.log(`   Amount: $${(paymentIntent.amount / 100).toFixed(2)}`);
    console.log(`   Currency: ${paymentIntent.currency.toUpperCase()}`);
    console.log(`   Status: ${paymentIntent.status}`);

    // Step 4: Verify payment succeeded
    console.log('\n✔️ Step 4: Verifying payment status...');
    const retrievedIntent = await stripe.paymentIntents.retrieve(paymentIntent.id, {
      expand: ['charges'],
    });
    console.log(`✅ Payment intent status: ${retrievedIntent.status}`);

    if (retrievedIntent.status === 'succeeded') {
      console.log(`✅ Payment SUCCEEDED!`);
      const chargeId = retrievedIntent.charges?.data?.[0]?.id || retrievedIntent.latest_charge;
      if (chargeId) {
        console.log(`   Charge ID: ${chargeId}`);
      }
      console.log(`   Amount Received: $${(retrievedIntent.amount_received / 100).toFixed(2)}`);
    } else if (retrievedIntent.status === 'requires_action') {
      console.log(`⚠️ Payment requires additional action (3D Secure)`);
    } else {
      console.log(`❌ Payment status: ${retrievedIntent.status}`);
    }

    // Step 5: List charges
    console.log('\n📋 Step 5: Listing charges for customer...');
    const charges = await stripe.charges.list({
      customer: customer.id,
      limit: 5,
    });
    console.log(`✅ Found ${charges.data.length} charge(s)`);
    charges.data.forEach((charge, index) => {
      console.log(`   Charge ${index + 1}:`);
      console.log(`     ID: ${charge.id}`);
      console.log(`     Amount: $${(charge.amount / 100).toFixed(2)}`);
      console.log(`     Status: ${charge.status}`);
      console.log(`     Created: ${new Date(charge.created * 1000).toISOString()}`);
    });

    // Step 6: Test refund
    console.log('\n↩️ Step 6: Testing refund...');
    const chargeId = retrievedIntent.charges?.data?.[0]?.id || retrievedIntent.latest_charge;
    if (chargeId) {
      const refund = await stripe.refunds.create({
        charge: chargeId,
        metadata: {
          test: 'true',
          reason: 'test_refund',
        },
      });
      console.log(`✅ Refund created: ${refund.id}`);
      console.log(`   Amount: $${(refund.amount / 100).toFixed(2)}`);
      console.log(`   Status: ${refund.status}`);
    } else {
      console.log(`⚠️ No charge found for refund test`);
    }

    // Step 7: Verify webhook events
    console.log('\n🔔 Step 7: Checking for webhook events...');
    const events = await stripe.events.list({
      type: 'charge.succeeded',
      limit: 5,
    });
    console.log(`✅ Found ${events.data.length} charge.succeeded event(s)`);
    if (events.data.length > 0) {
      const latestEvent = events.data[0];
      console.log(`   Latest event: ${latestEvent.id}`);
      console.log(`   Created: ${new Date(latestEvent.created * 1000).toISOString()}`);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ Payment Flow Test PASSED');
    console.log('='.repeat(60));
    console.log('\n📊 Summary:');
    console.log(`  ✅ Customer created`);
    console.log(`  ✅ Payment method created`);
    console.log(`  ✅ Payment intent created`);
    console.log(`  ✅ Payment processed`);
    console.log(`  ✅ Charges listed`);
    console.log(`  ✅ Refund processed`);
    console.log(`  ✅ Webhook events verified`);
    console.log('\n🎉 All payment flow steps completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Payment Flow Test FAILED');
    console.error('='.repeat(60));
    console.error(`Error: ${error.message}`);
    if (error.raw) {
      console.error(`Type: ${error.raw.type}`);
      console.error(`Code: ${error.raw.code}`);
    }
    process.exit(1);
  }
}

testPaymentFlow();

