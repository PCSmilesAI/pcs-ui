#!/bin/bash

# COMPREHENSIVE SYSTEM AUDIT TEST RUNNER
# Runs all test suites and generates a comprehensive report

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║   COMPREHENSIVE SYSTEM AUDIT - FULL TEST SUITE            ║"
echo "║   Testing all system components and workflows              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

TOTAL_PASSED=0
TOTAL_FAILED=0
TESTS_RUN=0

# Function to run a test and track results
run_test() {
  local test_name=$1
  local test_script=$2
  
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Running: $test_name"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  if node "$test_script" 2>&1 | tee /tmp/test_output.txt; then
    # Extract results from output
    RESULTS=$(grep "RESULTS:" /tmp/test_output.txt || echo "")
    echo "$RESULTS"
    
    # Parse passed/failed counts
    PASSED=$(echo "$RESULTS" | grep -oP '\d+(?= passed)' || echo "0")
    FAILED=$(echo "$RESULTS" | grep -oP '\d+(?= failed)' || echo "0")
    
    TOTAL_PASSED=$((TOTAL_PASSED + PASSED))
    TOTAL_FAILED=$((TOTAL_FAILED + FAILED))
    TESTS_RUN=$((TESTS_RUN + 1))
  else
    echo "❌ Test script failed to run"
    TOTAL_FAILED=$((TOTAL_FAILED + 1))
    TESTS_RUN=$((TESTS_RUN + 1))
  fi
  
  echo ""
}

# Run all test suites
run_test "Database Layer Tests" "scripts/test-database-layer.js"
run_test "Email Ingestion Tests" "scripts/test-email-ingestion.js"
run_test "Vendor Parser Tests" "scripts/test-vendor-parsers.js"
run_test "API Endpoint Tests" "scripts/test-api-comprehensive.js"
run_test "Security Layer Tests" "scripts/test-security-layer.js"

# Print summary
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    AUDIT SUMMARY                           ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Test Suites Run:     $TESTS_RUN"
echo "Total Tests Passed:  $TOTAL_PASSED ✅"
echo "Total Tests Failed:  $TOTAL_FAILED ❌"
echo ""

if [ $TOTAL_FAILED -eq 0 ]; then
  echo "🎉 ALL TESTS PASSED! System is healthy."
  exit 0
else
  echo "⚠️  SOME TESTS FAILED. Review output above for details."
  exit 1
fi

