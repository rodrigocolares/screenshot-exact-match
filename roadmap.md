# Requested validation
- [x] Fix immediate upload-history refresh; desktop and phone authenticated uploads verified.
- [x] Confirm hosted Google/email enabled, signup allowed, email confirmation required; invalid password and Google button initiation verified.
- [ ] Complete successful Google and email/password sign-in plus confirmation delivery: Google requires interactive consent; temporary password setup returned an auth-service 500, so successful login remains unverified.
- [x] Test tenant isolation against the backend: 12 tests, seven tables (read/write/delete) and four guarded RPCs.
- [x] Expand parser tests to 20; fix ISO syslog mistaken for a virtual-host access log; add upload-history regression test.
- [x] Write Portuguese README.md: project description, technologies, log-collection setup, and usage guide.
# Fase 2
- [x] Etapa 2.1 — API de ingestão (`/api/public/v1/logs/ingest|batch`, `/ingestion/health`), página Chaves de API (criar, rotacionar, revogar, histórico), 13 testes.
- [ ] Etapa 2.2 — gestão e assistente de coletores, adaptação Fluent Bit, monitoramento real, documentação e testes.
- [ ] Validar agente Linux real, reinício/rotação/reconexão e regressões multi-tenant; registrar dependências de Windows real.
- [ ] Etapas 2.3–2.6 — aguardando nova solicitação.
