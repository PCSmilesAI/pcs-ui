# PCS AI Audit Exit Criteria

## Performance Thresholds

### API Response Times
- **P95 Latency**: < 500ms for all API endpoints
- **P99 Latency**: < 1000ms for all API endpoints
- **Database Queries**: < 100ms for indexed queries
- **External API Calls**: < 2000ms (Stripe, QuickBooks)

### Error Rates
- **API Error Rate**: < 0.1% (excluding 4xx client errors)
- **5xx Errors**: < 0.01%
- **Webhook Processing Errors**: < 0.05%
- **Email Ingestion Errors**: < 0.1%

### Throughput
- **Concurrent Invoice Processing**: Support 100+ concurrent operations
- **API Requests per Second**: Handle 50+ RPS sustained
- **Webhook Processing**: Process 100+ webhooks/minute

## Security Thresholds

### Vulnerabilities
- **Critical Vulnerabilities**: 0 (must fix before launch)
- **High Vulnerabilities**: 0 (must fix before launch)
- **Moderate Vulnerabilities**: < 5 (documented and accepted risk)
- **Low Vulnerabilities**: Documented in security report

### Authentication & Authorization
- **RBAC Coverage**: 100% of state-changing endpoints
- **Session Security**: All cookies HttpOnly, Secure, SameSite=Strict
- **CSRF Protection**: Enabled on all state-changing operations
- **API Key Rotation**: Documented procedure, keys rotated quarterly

### Data Protection
- **PII Scrubbing**: 100% of logs scrubbed for PII
- **Encryption**: All secrets encrypted at rest
- **Backup Frequency**: Daily backups with 30-day retention
- **Restore Testing**: Successful restore tested monthly

## Data Integrity Thresholds

### Invoice Processing
- **Data Loss**: 0% (no invoices lost during processing)
- **Duplicate Prevention**: 100% idempotency on webhooks and API calls
- **State Consistency**: 100% (no invalid state transitions)
- **Audit Trail**: 100% of state changes logged

### Database Integrity
- **Foreign Key Constraints**: 100% coverage
- **Uniqueness Constraints**: All critical fields have uniqueness
- **Check Constraints**: Amounts positive, enums valid
- **Transaction Safety**: All multi-step operations use transactions

## Reliability Thresholds

### Uptime
- **Target Uptime**: 99.9% (8.76 hours downtime/year)
- **MTTR**: < 30 minutes for critical issues
- **Graceful Degradation**: System degrades gracefully when external APIs fail

### Failure Recovery
- **Cold Restart**: No data loss on restart
- **Chaos Test Results**: Pass all chaos tests (worker kill, DB disconnect, restart during ingest)
- **Circuit Breaker**: Prevents cascading failures

## Observability Thresholds

### Logging
- **Structured Logging**: 100% JSON format
- **Correlation IDs**: 100% of requests have correlation IDs
- **Log Retention**: 90 days

### Monitoring
- **Metrics Coverage**: All critical paths instrumented
- **Alert Response**: < 5 minutes for critical alerts
- **Dashboard Availability**: Real-time dashboards for all services

## Test Coverage Thresholds

### Unit Tests
- **Code Coverage**: > 80% for critical business logic
- **State Machine Coverage**: 100% of transitions tested

### Integration Tests
- **API Coverage**: 100% of public endpoints tested
- **Database Operations**: All CRUD operations tested
- **External Integrations**: Stripe and QBO mocked and tested

### E2E Tests
- **Happy Path**: Invoice ingest → approve → paid flow tested
- **Error Paths**: All error scenarios tested
- **Load Tests**: Pass load tests at 3× expected peak

## Go/No-Go Decision Criteria

### Must Pass (Blockers)
- ✅ Zero critical security vulnerabilities
- ✅ Zero high security vulnerabilities
- ✅ All chaos tests pass
- ✅ Data integrity tests pass
- ✅ Performance meets P95/P99 thresholds
- ✅ All critical E2E tests pass

### Should Pass (Risks)
- ⚠️ < 5 moderate security vulnerabilities (documented)
- ⚠️ Test coverage > 80%
- ⚠️ All runbooks documented
- ⚠️ Backup/restore tested successfully

### Nice to Have (Non-Blockers)
- 📝 Architecture diagrams complete
- 📝 API documentation complete
- 📝 Load tests at 5× peak (stretch goal)

## Sign-off Process

1. **Technical Lead Review**: All must-pass criteria verified
2. **Security Review**: Security audit completed and approved
3. **Performance Review**: Load tests completed and approved
4. **Operations Review**: Runbooks reviewed and tested
5. **Final Go/No-Go Meeting**: All stakeholders approve launch

## Risk Register

### High Risk Items
- External API dependencies (Stripe, QuickBooks) - mitigated with circuit breakers
- Data loss during processing - mitigated with transactions and idempotency
- Security vulnerabilities - mitigated with SAST scans and fixes

### Medium Risk Items
- Performance under load - mitigated with load testing
- Webhook processing failures - mitigated with retry logic and DLQ
- Email ingestion failures - mitigated with deduplication and tombstone checks

### Low Risk Items
- Documentation gaps - mitigated with documentation sprint
- Test coverage gaps - mitigated with test suite expansion

## Audit Completion Criteria

- [ ] All phases 0-20 completed
- [ ] All must-pass criteria met
- [ ] All blockers resolved
- [ ] Risk register reviewed and accepted
- [ ] Sign-off meeting completed
- [ ] Release tagged: `prelaunch-audit-v1-complete`

