# Etapa 2.2 — integração de coletores Windows/Linux

## Entrega

- Página **Gestão → Agentes e Coletores** com organização autorizada, filtros de servidor, SO, ambiente e estado; atualização a cada 15 segundos.
- Assistente para registrar servidor, selecionar fontes/canais e chave válida, gerar configuração Fluent Bit **5.0.7**, testar URL publicada e enviar uma linha real; edição de fontes e associação da chave disponível nos detalhes.
- Indicadores, heartbeat, entrega e último evento separados; eventos por hora, respostas da API, estado da chave e versão informada pelo agente.
- Adaptador Python **3.10+** local, sem dependências externas, para converter arrays Fluent Bit em envelopes da API existente. Fila SQLite durável, divisão em 1.000 eventos/1 MB, persistência de offsets, rotação, Java multilinha e retentativas.
- Credenciais não são incluídas nos arquivos gerados. Testes de URL passam por função autenticada, somente para origens HTTPS deste projeto; redirects não são seguidos pelo adaptador. RLS e verificação administrativa protegem as configurações.
- Dados, autenticação, upload, parsers e páginas anteriores preservados. Alertas da API usam as regras já existentes.

## Componentes e armazenamento

Novos módulos: `src/lib/collectors/`, `src/lib/api/collectors.functions.ts`, `src/components/app/CollectorWizard.tsx`, `src/routes/_authenticated/collectors.tsx`, `public/collectors/bridge.py`, testes TypeScript/Python e guia de instalação. Modificados: menu/largura da aplicação, ingestão, configurações legadas, README e metadados das páginas.

Mudanças aditivas: `0002_collector_management.sql` e `0003_collector_alerts_and_reported_version.sql`. Tabelas `collectors` e `collector_audit`; associação de lotes e chamadas ao coletor; versão informada; contadores atômicos via função restrita e agregação por hora com verificação de organização. Não há API Key completa armazenada. Configurações administrativas são auditadas.

## Endpoints e instalação

Mantidos `POST /api/v1/logs/ingest`, `/api/v1/logs/batch` e aliases `/api/public/v1/logs/ingest|batch`. Heartbeat autenticado é uma mensagem validada pelo mesmo handler; não é uma API com segurança alternativa. Health: `/api/public/v1/ingestion/health`.

O assistente confirmou URL HTTPS publicada e credencial com uma chamada real, sem criar evento/heartbeat. Isso não confirma que todas as versões de código já estejam publicadas; publique as mudanças antes de instalar em produção.

Consulte o [guia Windows/Linux](../public/collectors/INSTALL.md): instalação, contas de serviço, grupos/ACLs, canais Event Log, offsets, SQLite, serviços, proteção da chave, teste de saúde e confirmação no Explorer.

## Testes executados

- **Fluent Bit 5.0.7 real em Linux:** leitura contínua de arquivos de teste Apache/Nginx/Java, parsing e stack trace, transporte pelo adaptador, persistência e leitura pelo Log Explorer da organização de teste; rotação rename/create e reinício real do agente com offsets.
- Recuperação da fila após interrupção controlada de transporte (503 induzido no harness, não uma queda física da rede). O registro pendente sobreviveu à recriação do adaptador e foi entregue.
- Esse teste de agente utilizou a API local da prévia em HTTP, apenas no harness isolado; o adaptador distribuído exige HTTPS. **Agente remoto → publicação por HTTPS ainda não foi validado ponta a ponta.**
- **12 testes multi-tenant novamente executados contra o backend:** sete tabelas anteriores, leitura/escrita/remoção estrangeiras e quatro RPCs protegidas, mais associação do usuário.
- **10 testes novos de integração real:** chave expirada/revogada, hostname não autorizado, SO incompatível, 429 com Retry-After, aliases, replay, organização/coletor/fonte não autorizados, 1 MB/1.000 eventos e acesso aos novos dados/agregado.
- **5 testes anteriores da API** também executados com chave real.
- **45 testes regulares TypeScript:** parsers (20), ingestão (13), coletores (10), histórico (1), roteamento (1). Total de **72 testes TypeScript aprovados** nas rodadas executadas; as suítes opt-in ficam desativadas sem suas credenciais de fixture.
- **6 testes Python:** limites, recuperação/reinício de fila, quarentena parcial, W3C e Event Logs com fixtures, bloqueio de redirect de credenciais.
- Página e assistente verificados autenticados em 1280×1800, 607×891 e 390×844, sem excesso de largura da página; tabela tem rolagem horizontal. Verificação de edição e URL/chave também concluída.
- Último resultado automático da prévia: **build OK**. Não foi executado um build de produção manual; aprovação de produção permanece não verificada.

## Não executados / limitações

- **Agente real em Windows**, canais Security/PowerShell, permissões e recuperação de Event Logs: requer máquina Windows; testes de W3C/Event Logs usam fixtures e não substituem esse cenário.
- Journald real, Docker real, ProFTPD/Pure-FTPd e formatos personalizados: exigem logs/ambientes correspondentes. FTP personalizado usa texto/JSON; não há parser dedicado inventando campos.
- Durabilidade sob disco esgotado, corrupção, energia interrompida, copytruncate e grandes volumes concorrentes não comprovada. Não há garantia de entrega exatamente uma vez.
- Heartbeat confirma saúde do processo consultado pelo adaptador, não acesso a todas as fontes. Um agente autorizado pode enviar um heartbeat; não há atestação criptográfica da máquina.
- Falhas de autorização anteriores à leitura do payload podem aparecer no histórico da chave, sem identificar o coletor. Erros locais de leitura/permissão exigem consulta aos registros do agente/adaptador.
- Rate limit é contagem por janela, não quota rígida atômica distribuída sob concorrência. Buffer Fluent Bit é limitado por saída; chunks podem ser descartados quando o limite for atingido. Fila do adaptador recusa novos registros quando cheia.
- Rejeições parciais/permanentes ficam bloqueadas para inspeção; veja o procedimento de recuperação no guia. Registros genéricos usam horário de coleta, explicitamente marcado; parsers específicos mantêm o horário da fonte.
- Logs/spool podem conter informações pessoais ou segredos da aplicação. Exigem ACLs, proteção de disco, retenção e redaction na origem. Não envie a chave em URLs, argumentos ou arquivos compartilhados.

## Próximos passos

Publicar e validar o mesmo fluxo em HTTPS com um agente remoto; validar Windows e fontes adicionais em seus respectivos servidores; realizar testes de volume/durabilidade. **Etapa 2.3 não iniciada.**