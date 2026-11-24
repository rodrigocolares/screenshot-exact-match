# LogSentinel AI — instalação dos coletores

## Arquitetura e compatibilidade

Fluent Bit **5.0.7** → adaptador Python local → API HTTPS existente → parsers → eventos, dashboards e alertas.
Python **3.10 ou superior**, somente biblioteca padrão. A saída JSON do Fluent Bit é um array, não o envelope da API. O adaptador transforma os registros, separa lotes em até **1.000 eventos e 1.048.576 bytes**, mantém fila SQLite e encaminha ao mesmo endpoint autenticado. Não existe uma segunda API de ingestão externa.

Cadastre o coletor em **Gestão → Agentes e Coletores → Adicionar Coletor**. Selecione o servidor, fontes e caminhos/canais, associe uma chave válida e confirme a URL publicada antes de baixar os arquivos. A verificação de URL envia um lote vazio e espera a recusa por validação depois de autenticar; não cria logs ou heartbeat e não testa o servidor remoto.

Baixe `fluent-bit.conf`, `multiline.conf`, `collector.json`, `bridge.py` e este guia. **Nenhum desses arquivos contém a API Key.** Configure a chave apenas no ambiente do processo do adaptador, em uma conta de serviço restrita. Não a cole em comandos que fiquem no histórico, arquivos compartilhados, URLs ou tickets. Preferencialmente, use uma chave vinculada ao servidor, com expiração e limite compatível com o volume. Rotacione pela página de chaves e atualize a associação do coletor e o ambiente antes de reiniciar.

## Linux

1. Instale Fluent Bit 5.0.7 pelo pacote oficial da sua distribuição e confira `fluent-bit --version`. Não execute instaladores remotos sem inspeção. Instale Python 3.10+ pelo gerenciador de pacotes da distribuição.
2. Coloque os cinco arquivos em `/etc/logsentinel`. Crie uma conta `logsentinel` sem login, com acesso somente às fontes selecionadas. Logs de sistema podem exigir associação ao grupo `adm` ou `systemd-journal`; não conceda `root` por padrão.
3. Crie os diretórios persistentes e confira permissões:

```sh
sudo install -d -o logsentinel -g logsentinel -m 0700 /var/lib/logsentinel /var/lib/logsentinel/buffer /var/lib/logsentinel/spool
sudo chmod 0600 /etc/logsentinel/collector.json
sudo chown -R logsentinel:logsentinel /etc/logsentinel
```

4. Configure `LOGSENTINEL_API_KEY` no gerenciador de segredos/ambiente da conta de serviço. Em um teste interativo, sem eco ou histórico:

```sh
read -rs -p 'API Key: ' LOGSENTINEL_API_KEY; echo
export LOGSENTINEL_API_KEY
python3 /etc/logsentinel/bridge.py --config /etc/logsentinel/collector.json --state /var/lib/logsentinel/spool
```

5. Em outro terminal, com a mesma conta de serviço:

```sh
cd /etc/logsentinel
fluent-bit -c fluent-bit.conf
```

6. Para execução contínua, crie dois serviços systemd, ambos com `User=logsentinel`, `Restart=on-failure` e `WorkingDirectory=/etc/logsentinel`: um para o adaptador e outro para Fluent Bit. Só o adaptador precisa da chave. Um arquivo de ambiente, se necessário, deve ser propriedade da conta de serviço e ter modo `0600`, nunca ser versionado. Ajuste os caminhos do executável ao pacote instalado. Verifique `systemctl status` e os registros dos dois serviços.

Os caminhos são configuráveis: Apache Common/Combined; Nginx access/error com latência somente quando presente; Java com stack traces; auth.log/secure, syslog, journald; vsftpd; JSON de aplicações/Docker; texto personalizado. ProFTPD/Pure-FTPd e formatos customizados não possuem parser dedicado: selecione texto ou JSON; não serão inventados campos FTP/HTTP ausentes. Journald exige arquivos de journal válidos e acesso de leitura; exportações de texto não são uma fonte `systemd`.

## Windows

1. Instale a versão oficial Fluent Bit 5.0.7 para Windows e Python 3.10+. Confira `fluent-bit.exe --version` e `python --version`.
2. Copie os arquivos para `C:\ProgramData\LogSentinel`. Crie `buffer` e `spool` nesse diretório.
3. Aplique ACLs restritas à conta de serviço e aos administradores. Conceda leitura somente aos diretórios IIS/aplicações e aos canais necessários. `Security` e `Microsoft-Windows-PowerShell/Operational` podem requerer permissões adicionais; canais desabilitados precisam ser habilitados pelo administrador do servidor.
4. Confira os caminhos gerados. IIS Access: `C:/inetpub/logs/LogFiles/W3SVC*/u_ex*.log`; IIS FTP: `FTPSVC*`. O adaptador lê **o cabeçalho real #Fields do arquivo**, inclusive após reinício/rotação. Não adivinha a ordem dos campos. Arquivos removidos antes da leitura do cabeçalho podem ficar pendentes.
5. Windows Event Logs usa `winevtlog`, renderização textual, canais separados por vírgulas (Application, System, Security e PowerShell Operational, se autorizado). São preservados Event ID, Provider, Level, Timestamp, Computer, Message e Event Record ID quando o agente os fornece; registros sem mensagem renderizada não são fabricados.
6. Defina a chave na conta de serviço. Para teste interativo sem eco:

```powershell
$secure = Read-Host 'API Key' -AsSecureString
$env:LOGSENTINEL_API_KEY = [System.Net.NetworkCredential]::new('', $secure).Password
Set-Location C:\ProgramData\LogSentinel
python bridge.py --config collector.json --state C:\ProgramData\LogSentinel\spool
```

Em outro terminal:

```powershell
Set-Location C:\ProgramData\LogSentinel
& 'C:\Program Files\fluent-bit\bin\fluent-bit.exe' -c fluent-bit.conf
```

Use o serviço Windows fornecido pelo pacote ou um gerenciador de serviços aprovado para os dois processos, com reinício em caso de falha. Configure a chave somente na conta do adaptador. Os caminhos do executável variam com o instalador. Não registre a chave em argumentos de linha de comando. `.NET`, ASP.NET e arquivos personalizados podem usar texto/JSON; Java utiliza o parser multilinha. A validação real em Windows depende de um servidor Windows disponível.

## Confirmação e diagnóstico

- O adaptador escuta somente em `127.0.0.1:9880`. O Fluent Bit expõe saúde local em `127.0.0.1:2020`; nenhum desses serviços deve ser exposto na rede.
- `curl http://127.0.0.1:2020/api/v1/health` verifica o processo Fluent Bit. O adaptador envia heartbeat a cada 60 s **somente se essa verificação real passar e a versão for informada pelo agente**. Heartbeat não garante que todos os arquivos/canais estejam acessíveis.
- Acrescente uma linha válida a uma fonte selecionada. Confirme **HTTP 202 do backend**, contagens aceitas e presença no Log Explorer, no hostname e organização corretos. `202` do adaptador significa apenas persistência na fila local.
- A página atualiza a cada 15 s. Diferencia heartbeat, somente entrega de logs, comunicação atrasada (>5 min), sem eventos na última hora, erro e ausência de comunicação. Cadastro sozinho não significa conexão.
- Use Testar Conectividade nos detalhes para verificar o serviço da página. O resultado não testa a máquina remota; execute a verificação de saúde e consulte a fila/logs no próprio servidor.
- A API aceita `/api/v1/logs/ingest` e `/api/v1/logs/batch`; aliases `/api/public/v1/logs/ingest|batch` atendem sites publicados privados. Confirme a URL funcional no assistente. Não confunda localhost do teste com o endereço HTTPS do seu ambiente publicado.

## Buffer, recuperação e limitações

Fluent Bit: offsets SQLite por fonte, `DB.Sync Full` (tail), armazenamento filesystem com checksum e sync full, espera de rotação 30 s, backoff 5–300 s, limite 512 MB **por saída** e memória de backlog 16 MB. Leituras tail iniciam do começo no primeiro cadastro; os canais Windows/journald começam no final. Linhas acima de 32 KB interrompem o tail em vez de serem ignoradas silenciosamente; ajuste a fonte ou divida os registros. Stack traces muito grandes também podem exceder o limite por evento.

Adaptador: SQLite WAL + synchronous FULL; fila de corpos limitada a 512 MB (banco/WAL também consomem espaço, reserve folga). Confirma localmente somente depois do commit. Após reinício, mantém o mesmo batch_id; reenvios são deduplicados pelo backend. Não remova bancos de offsets, spool ou buffer em reinícios normais.

- **401:** mantém o lote para nova tentativa após corrigir chave expirada/revogada; espera mínima de 60 s.
- **403/400/413/422 ou rejeição parcial:** mantém lote bloqueado para inspeção, sem descarte automático. Corrija configuração/dados e marque `state='pending'` via SQLite com o adaptador parado; se houve rejeição parcial, use novo batch_id para reenviar apenas os eventos rejeitados (o lote original já foi processado). Não copie os registros para locais públicos.
- **429:** respeita Retry-After (mínimo 60 s), sem rajada de reenvios.
- **5xx/rede:** retenta com backoff limitado a 300 s. Falha não é sucesso e nenhum evento é removido da fila sem confirmação.
- Fila local cheia: responde 503 e Fluent Bit retenta. O limite de buffer do Fluent Bit pode descartar chunks antigos; disco esgotado, corrupção, remoção prematura de arquivos rotacionados, truncamento/copytruncate, falha entre captura e commit, reset de canais Event Log ou offset e ausência de permissões podem perder eventos. **Entrega exatamente uma vez não é prometida.** Use rotação rename/create e mantenha arquivos até confirmar recebimento.
- JSON Docker multilinha encapsulado e formatos personalizados exigem validação do formato efetivo; não é integração automática com a API do Docker. Generic usa horário da coleta, identificado em atributos; parsers específicos mantêm o horário real da fonte.
- O rate limit atual da API é por chave/janela de 60 s; não é um mecanismo distribuído de quota rígida sob chamadas simultâneas. Dimensione as chaves e monitore 429 e armazenamento.
- Logs podem conter dados pessoais e credenciais de aplicações: configure redaction na origem e ACLs/retention do spool conforme suas políticas. A chave LogSentinel não é salva, mas os eventos em fila contêm os logs.

## Testes reproduzíveis

```sh
bunx vitest run
python3 -m unittest discover -s tests/collectors -v
```

As suítes opt-in de isolamento/ingestão requerem sessão, organização de teste separada e chave real. Nunca aponte fixtures de alteração/exclusão para dados de produção. O relatório `docs/ETAPA-2.2.md` distingue testes com agente real de fixtures e pendências Windows.