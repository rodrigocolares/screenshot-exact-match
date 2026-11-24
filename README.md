# LogSentinel AI

Plataforma de centralização, análise e investigação de logs com inteligência artificial, voltada para times de infraestrutura, NOC/SOC e desenvolvimento. O LogSentinel AI coleta logs de servidores Windows e Linux, detecta automaticamente o formato, deduplica eventos, dispara alertas e permite investigar incidentes com apoio de IA — tudo em português e com isolamento total entre organizações (multi-tenant).

## Funcionalidades

- **Dashboard** com visão geral de eventos, severidades e tendências.
- **Visões por sistema operacional** (Windows e Linux) com estatísticas dedicadas.
- **Ingestão de logs** por upload manual (até 5 MB) com detecção automática de formato, pré-visualização e deduplicação por hash.
- **Log Explorer** para busca e filtragem de eventos por host, severidade, período e texto.
- **Alertas** baseados em regras avaliadas a cada ingestão.
- **Investigação com IA** que analisa um evento e sugere causa provável e ações.
- **Inventário de servidores** com hostname, SO, ambiente, serviços e responsável.
- **Dados de demonstração** fictícios e isolados, removíveis sem afetar dados reais.
- **Multi-tenant**: cada organização enxerga apenas os próprios dados (RLS no banco).
- **API de ingestão automática** (`POST /api/v1/logs/ingest`) para envio de logs por HTTPS, com autenticação por chave de API, lotes de até 1.000 eventos (máx. 1 MB), deduplicação e resposta idempotente.
- **Gerenciamento de chaves de API**: criação, validade, revogação e rotação, vinculadas à organização e, opcionalmente, a um servidor; a chave completa aparece apenas uma vez e nunca é armazenada (apenas o hash).
- **Agentes e Coletores**: cadastro Windows/Linux, fontes configuráveis, assistente Fluent Bit 5.0.7, indicadores e detalhes atualizados a cada 15 s; separação entre heartbeat real, envio de logs, atraso, erro e ausência de eventos/comunicação.
- **Adaptador local Python**: transforma a saída do Fluent Bit para a API existente, divide lotes dentro dos limites, mantém fila em disco e retenta falhas sem expor a chave nas configurações.

### Formatos de log suportados

| Formato | Sistema |
| --- | --- |
| IIS W3C (acesso) | Windows |
| IIS FTP (W3C) | Windows |
| Apache Access (Common/Combined) | Linux |
| Apache Error | Linux |
| Nginx Access | Linux |
| Nginx Error | Linux |
| Java (Logback / Log4j / Spring, multilinha) | Qualquer |
| Linux auth.log / secure (SSH, sudo) | Linux |
| Syslog | Linux |
| vsftpd (FTP) | Linux |
| JSON por linha | Qualquer |
| Texto genérico | Qualquer |

## Tecnologias

- **Frontend**: React 19, TanStack Start (SSR) e TanStack Router/Query, Tailwind CSS v4, shadcn/ui, Lucide.
- **Backend**: Lovable Cloud (banco Postgres com Row Level Security, autenticação por e-mail/senha e Google, funções server-side).
- **IA**: Lovable AI Gateway (modelo `openai/gpt-6-astra`) para investigação de eventos.
- **Parsers**: TypeScript puro, testados com Vitest, executados no servidor na ingestão e no navegador apenas para pré-visualização.
- **Testes**: Vitest (parsers, roteamento, histórico de upload e isolamento multi-tenant).

## Como instalar a coleta de logs

A coleta pode ser feita de duas formas: **upload manual** pela interface (arquivos compactados `.gz`/`.zip` ou binários `.evtx` precisam ser extraídos/convertidos para texto antes do envio) ou **envio automático pela API de ingestão**, indicada para coletores e automações.

### 1. Cadastre o servidor

1. Acesse **Servidores** no menu lateral e clique em **Novo servidor**.
2. Informe hostname, sistema operacional, endereço, ambiente, serviços e responsável.
3. O cadastro permite associar os eventos importados ao servidor correto.

### 2. Colete os logs no servidor

**Linux (syslog, auth, Apache, Nginx, vsftpd):**

```bash
# Exemplos de arquivos comuns
/var/log/syslog
/var/log/auth.log            # Debian/Ubuntu
/var/log/secure              # RHEL/CentOS
/var/log/apache2/access.log  # ou /var/log/httpd/access_log
/var/log/nginx/access.log
/var/log/vsftpd.log
```

Copie o arquivo (ou um recorte com `tail -n 10000 arquivo > recorte.log`) para a sua estação.

**Windows (IIS):**

```text
C:\inetpub\logs\LogFiles\W3SVC1\u_ex*.log   # IIS W3C (acesso)
C:\inetpub\logs\LogFiles\FTPSVC*\u_ex*.log # IIS FTP
```

**Windows (Event Viewer):** exporte para texto/JSON antes do upload, por exemplo:

```powershell
Get-WinEvent -LogName Security -MaxEvents 5000 | ConvertTo-Json | Out-File eventos.json
```

**Aplicações Java:** envie o arquivo de saída do Logback/Log4j (ex.: `application.log`); stack traces multilinha são agrupados automaticamente.

### 3. Envie pela plataforma

1. Acesse **Ingestão de logs**.
2. Selecione o sistema operacional, o servidor (opcional) e o tipo de log — ou deixe em **Detectar automaticamente**.
3. Escolha o arquivo (`.log`, `.txt`, `.csv`, `.json`, `.xml`, `.out`, máx. 5 MB).
4. Confira a **pré-visualização** (formato detectado, eventos válidos e rejeitados) e clique em **Importar**.
5. O resultado mostra eventos importados, duplicados (ignorados por hash) e rejeitados; o **histórico de importações** é atualizado na hora.

### 4. Envio automático pela API (coletores e automações)

1. Acesse **Chaves de API** (menu Administração, apenas administradores) e clique em **Nova chave**. Defina nome, validade, limite de chamadas por minuto e, opcionalmente, o servidor vinculado.
2. **Copie a chave no momento da criação** (começa com `lsk_`): ela não aparece novamente e não é armazenada.
3. Envie eventos com `curl` ou pelo seu coletor:

```bash
curl -X POST https://pixel-perfect-recreation-2056.lovable.app/api/v1/logs/ingest \
  -H "Authorization: Bearer lsk_SUA_CHAVE" -H "Content-Type: application/json" \
  -d '{"hostname":"SRV-WEB-01","operating_system":"linux","source_type":"generic",
       "events":[{"severity":"ERROR","message":"Falha de teste via API"}]}'
```

- A resposta `202` informa eventos aceitos, duplicados e rejeitados; reenviar o mesmo lote (`batch_id`) não cria duplicatas.
- A organização é definida pela chave — envios que tentam indicar outra organização são recusados. Chaves vinculadas a um servidor só aceitam logs dele; servidores novos são cadastrados automaticamente (informe `operating_system`).
- Endpoints: `POST /api/v1/logs/ingest` (principal), `POST /api/v1/logs/batch` (lotes) e `GET /api/v1/ingestion/health` (status). Se o site publicado for privado, use os equivalentes em `/api/public/v1/...`.
- Logo após criar a chave, o botão **Enviar evento de teste** valida o envio sem sair da página.

### 5. Coleta contínua Windows/Linux — Etapa 2.2

1. Abra **Gestão → Agentes e Coletores → Adicionar Coletor**.
2. Escolha Windows/Linux, servidor existente ou novo, ambiente, fontes, caminhos/canais e uma chave válida da organização.
3. Confirme a URL HTTPS publicada com a chave completa (usada apenas em memória). O teste de endereço não confirma o agente remoto.
4. Baixe os arquivos gerados e o adaptador. Instale Fluent Bit **5.0.7** e Python **3.10+** no servidor. A chave é passada somente por `LOGSENTINEL_API_KEY`, nunca embutida nos arquivos.
5. Siga o [guia completo de instalação Windows/Linux](public/collectors/INSTALL.md), incluindo permissões, serviços, offsets, buffer, retentativas e riscos de perda.
6. Gere uma linha real na fonte escolhida, confira HTTP 202 do backend e encontre o evento no Log Explorer da organização correta. Só então considere a coleta daquela fonte validada.

Fluent Bit envia seu JSON ao adaptador em loopback; este usa a mesma API autenticada. O heartbeat só é enviado após verificar a saúde real do processo Fluent Bit. Não presumimos conexão pelo cadastro de um servidor. Windows requer validação em máquina Windows; consulte o [relatório da etapa](docs/ETAPA-2.2.md) para os testes efetivamente executados.

## Como usar

1. **Criar conta**: acesse a página de autenticação e cadastre-se com e-mail/senha (confirmação por e-mail) ou entre com Google. A organização é criada automaticamente no primeiro acesso.
2. **Dados de demonstração**: em **Configurações**, carregue os dados fictícios para explorar dashboards, alertas e o explorer sem enviar logs reais. Eles são marcados como fictícios e podem ser removidos a qualquer momento.
3. **Dashboard**: acompanhe o volume de eventos, distribuição por severidade e servidores sem comunicação.
4. **Windows / Linux**: páginas dedicadas com estatísticas por sistema operacional.
5. **Log Explorer**: filtre por período, host, severidade e texto; clique em um evento para ver detalhes e abrir a **investigação com IA**.
6. **Alertas**: veja ocorrências disparadas pelas regras avaliadas a cada ingestão.
7. **Servidores**: mantenha o inventário atualizado; servidores sem comunicação há mais de 1 hora são destacados.
8. **Chaves de API**: crie, rotacione e revogue chaves para a ingestão automática, e acompanhe o histórico de chamadas de cada chave.
9. **Configurações**: gerencie a organização e os dados de demonstração.
10. **Agentes e Coletores**: filtre por organização autorizada, servidor, SO, ambiente e estado; acompanhe fontes, versão informada, comunicações, eventos por hora e respostas da API.

## Desenvolvimento local

```sh
git clone <este-repositório>
cd <pasta-do-projeto>
npm i
npm run dev
```

Testes:

```sh
npx vitest run
```

---

Este projeto foi construído com [Lovable](https://lovable.dev). Continue o desenvolvimento no [editor Lovable](https://lovable.dev/projects/ad665671-fa22-492f-89a7-2436ca487828).
