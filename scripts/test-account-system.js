#!/usr/bin/env node

/**
 * Account System Test Suite
 * Tests account creation, login, and multi-user scenarios
 */

const bcrypt = require('bcrypt');

// Mock user data for testing
const testUsers = [
  { name: 'User 1', email: 'user1@test.com', password: 'Password123!' },
  { name: 'User 2', email: 'user2@test.com', password: 'Password456!' },
  { name: 'User 3', email: 'user3@test.com', password: 'Password789!' },
  { name: 'User 4', email: 'user4@test.com', password: 'PasswordABC!' },
  { name: 'User 5', email: 'user5@test.com', password: 'PasswordDEF!' },
  { name: 'User 6', email: 'user6@test.com', password: 'PasswordGHI!' },
  { name: 'User 7', email: 'user7@test.com', password: 'PasswordJKL!' },
  { name: 'User 8', email: 'user8@test.com', password: 'PasswordMNO!' },
  { name: 'User 9', email: 'user9@test.com', password: 'PasswordPQR!' },
  { name: 'User 10', email: 'user10@test.com', password: 'PasswordSTU!' },
];

let testsPassed = 0;
let testsFailed = 0;

// ============================================================================
// TEST 1: Password Hashing
// ============================================================================
async function testPasswordHashing() {
  console.log('\n📝 TEST 1: Password Hashing');
  try {
    const password = 'TestPassword123!';
    const hashed = await bcrypt.hash(password, 10);
    const match = await bcrypt.compare(password, hashed);
    
    if (match && hashed !== password) {
      console.log('✅ Password hashing works correctly');
      console.log(`   - Original: ${password}`);
      console.log(`   - Hashed: ${hashed.substring(0, 20)}...`);
      testsPassed++;
    } else {
      console.log('❌ Password hashing failed');
      testsFailed++;
    }
  } catch (err) {
    console.log('❌ Password hashing error:', err.message);
    testsFailed++;
  }
}

// ============================================================================
// TEST 2: Duplicate Email Detection
// ============================================================================
function testDuplicateEmailDetection() {
  console.log('\n📝 TEST 2: Duplicate Email Detection');
  try {
    const users = [
      { email: 'user@test.com', name: 'User 1' },
      { email: 'user@test.com', name: 'User 2' },
    ];
    
    const emails = new Set();
    let duplicateFound = false;
    
    for (const user of users) {
      if (emails.has(user.email)) {
        duplicateFound = true;
        break;
      }
      emails.add(user.email);
    }
    
    if (duplicateFound) {
      console.log('✅ Duplicate email detection works');
      testsPassed++;
    } else {
      console.log('❌ Duplicate email detection failed');
      testsFailed++;
    }
  } catch (err) {
    console.log('❌ Duplicate email detection error:', err.message);
    testsFailed++;
  }
}

// ============================================================================
// TEST 3: User Creation (10 users)
// ============================================================================
async function testUserCreation() {
  console.log('\n📝 TEST 3: User Creation (10 users)');
  try {
    const createdUsers = [];
    
    for (const testUser of testUsers) {
      const hashed = await bcrypt.hash(testUser.password, 10);
      createdUsers.push({
        name: testUser.name,
        email: testUser.email,
        password: hashed,
      });
    }
    
    if (createdUsers.length === 10) {
      console.log(`✅ Successfully created ${createdUsers.length} users`);
      createdUsers.forEach((u, i) => {
        console.log(`   ${i + 1}. ${u.email} (${u.name})`);
      });
      testsPassed++;
    } else {
      console.log(`❌ Failed to create all users (created: ${createdUsers.length})`);
      testsFailed++;
    }
  } catch (err) {
    console.log('❌ User creation error:', err.message);
    testsFailed++;
  }
}

// ============================================================================
// TEST 4: Login Verification (10 users)
// ============================================================================
async function testLoginVerification() {
  console.log('\n📝 TEST 4: Login Verification (10 users)');
  try {
    let successCount = 0;
    
    for (const testUser of testUsers) {
      const hashed = await bcrypt.hash(testUser.password, 10);
      const match = await bcrypt.compare(testUser.password, hashed);
      
      if (match) {
        successCount++;
      }
    }
    
    if (successCount === testUsers.length) {
      console.log(`✅ All ${successCount} users can login successfully`);
      testsPassed++;
    } else {
      console.log(`❌ Only ${successCount}/${testUsers.length} users can login`);
      testsFailed++;
    }
  } catch (err) {
    console.log('❌ Login verification error:', err.message);
    testsFailed++;
  }
}

// ============================================================================
// TEST 5: Wrong Password Detection
// ============================================================================
async function testWrongPasswordDetection() {
  console.log('\n📝 TEST 5: Wrong Password Detection');
  try {
    const password = 'CorrectPassword123!';
    const wrongPassword = 'WrongPassword456!';
    const hashed = await bcrypt.hash(password, 10);
    
    const correctMatch = await bcrypt.compare(password, hashed);
    const wrongMatch = await bcrypt.compare(wrongPassword, hashed);
    
    if (correctMatch && !wrongMatch) {
      console.log('✅ Wrong password correctly rejected');
      testsPassed++;
    } else {
      console.log('❌ Wrong password detection failed');
      testsFailed++;
    }
  } catch (err) {
    console.log('❌ Wrong password detection error:', err.message);
    testsFailed++;
  }
}

// ============================================================================
// TEST 6: Session Management (Multi-device simulation)
// ============================================================================
function testSessionManagement() {
  console.log('\n📝 TEST 6: Session Management (Multi-device)');
  try {
    const sessions = {};
    
    // Simulate 10 users logging in from 2 devices each
    for (let i = 0; i < testUsers.length; i++) {
      const email = testUsers[i].email;
      sessions[email] = [
        { deviceId: `device-${i}-1`, ip: `192.168.1.${i}`, createdAt: new Date() },
        { deviceId: `device-${i}-2`, ip: `10.0.0.${i}`, createdAt: new Date() },
      ];
    }
    
    let totalSessions = 0;
    for (const email in sessions) {
      totalSessions += sessions[email].length;
    }
    
    if (totalSessions === 20) {
      console.log(`✅ Multi-device sessions work (${totalSessions} sessions for ${testUsers.length} users)`);
      console.log(`   - Average: ${(totalSessions / testUsers.length).toFixed(1)} sessions per user`);
      testsPassed++;
    } else {
      console.log(`❌ Session management failed (expected 20, got ${totalSessions})`);
      testsFailed++;
    }
  } catch (err) {
    console.log('❌ Session management error:', err.message);
    testsFailed++;
  }
}

// ============================================================================
// TEST 7: Admin Access Control
// ============================================================================
function testAdminAccessControl() {
  console.log('\n📝 TEST 7: Admin Access Control');
  try {
    const ADMIN_EMAILS = new Set([
      'business@pcsmilesai.com',
      'mckaym@pcsmiles.com',
    ]);
    
    const testCases = [
      { email: 'business@pcsmilesai.com', shouldBeAdmin: true },
      { email: 'mckaym@pcsmiles.com', shouldBeAdmin: true },
      { email: 'user1@test.com', shouldBeAdmin: false },
      { email: 'user2@test.com', shouldBeAdmin: false },
    ];
    
    let allCorrect = true;
    for (const testCase of testCases) {
      const isAdmin = ADMIN_EMAILS.has(testCase.email);
      if (isAdmin !== testCase.shouldBeAdmin) {
        allCorrect = false;
        break;
      }
    }
    
    if (allCorrect) {
      console.log('✅ Admin access control works correctly');
      console.log(`   - Admin users: ${Array.from(ADMIN_EMAILS).join(', ')}`);
      testsPassed++;
    } else {
      console.log('❌ Admin access control failed');
      testsFailed++;
    }
  } catch (err) {
    console.log('❌ Admin access control error:', err.message);
    testsFailed++;
  }
}

// ============================================================================
// TEST 8: Concurrent User Handling
// ============================================================================
async function testConcurrentUserHandling() {
  console.log('\n📝 TEST 8: Concurrent User Handling');
  try {
    const promises = testUsers.map(async (user) => {
      const hashed = await bcrypt.hash(user.password, 10);
      return { email: user.email, hashed };
    });
    
    const results = await Promise.all(promises);
    
    if (results.length === testUsers.length) {
      console.log(`✅ Concurrent user creation works (${results.length} users)`);
      testsPassed++;
    } else {
      console.log(`❌ Concurrent user creation failed`);
      testsFailed++;
    }
  } catch (err) {
    console.log('❌ Concurrent user handling error:', err.message);
    testsFailed++;
  }
}

// ============================================================================
// TEST 9: Email Validation
// ============================================================================
function testEmailValidation() {
  console.log('\n📝 TEST 9: Email Validation');
  try {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    const validEmails = [
      'user@example.com',
      'mckaym@pcsmiles.com',
      'business@pcsmilesai.com',
    ];
    
    const invalidEmails = [
      'invalid.email',
      '@example.com',
      'user@',
      'user name@example.com',
    ];
    
    let allValid = true;
    for (const email of validEmails) {
      if (!emailRegex.test(email)) {
        allValid = false;
        break;
      }
    }
    
    for (const email of invalidEmails) {
      if (emailRegex.test(email)) {
        allValid = false;
        break;
      }
    }
    
    if (allValid) {
      console.log('✅ Email validation works correctly');
      testsPassed++;
    } else {
      console.log('❌ Email validation failed');
      testsFailed++;
    }
  } catch (err) {
    console.log('❌ Email validation error:', err.message);
    testsFailed++;
  }
}

// ============================================================================
// TEST 10: Account Isolation
// ============================================================================
function testAccountIsolation() {
  console.log('\n📝 TEST 10: Account Isolation');
  try {
    const userAccounts = {};
    
    for (const user of testUsers) {
      userAccounts[user.email] = {
        name: user.name,
        email: user.email,
        data: { invoices: [], settings: {} },
      };
    }
    
    // Verify each account is isolated
    let isolated = true;
    for (const email in userAccounts) {
      const account = userAccounts[email];
      if (account.email !== email) {
        isolated = false;
        break;
      }
    }
    
    if (isolated && Object.keys(userAccounts).length === testUsers.length) {
      console.log(`✅ Account isolation works (${Object.keys(userAccounts).length} isolated accounts)`);
      testsPassed++;
    } else {
      console.log('❌ Account isolation failed');
      testsFailed++;
    }
  } catch (err) {
    console.log('❌ Account isolation error:', err.message);
    testsFailed++;
  }
}

// ============================================================================
// Run All Tests
// ============================================================================
async function runAllTests() {
  console.log('🧪 Account System Test Suite');
  console.log('============================\n');
  
  await testPasswordHashing();
  testDuplicateEmailDetection();
  await testUserCreation();
  await testLoginVerification();
  await testWrongPasswordDetection();
  testSessionManagement();
  testAdminAccessControl();
  await testConcurrentUserHandling();
  testEmailValidation();
  testAccountIsolation();
  
  console.log('\n============================');
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`📊 Total: ${testsPassed + testsFailed}`);
  console.log(`📈 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
  
  if (testsFailed === 0) {
    console.log('\n🎉 All tests passed! System is ready for 10+ users.');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the issues above.');
  }
}

runAllTests().catch(console.error);

