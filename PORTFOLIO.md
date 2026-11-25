# Integra Hub

**Frase de uma linha:** Uma central que conecta loja virtual, planilhas, banco, transportadora e ERP — e mostra cada pedido do início ao fim.

**Descrição para o card (3–4 linhas):**
Seus sistemas não conversam? O Integra Hub leva os pedidos da loja e das planilhas direto para o ERP, devolve estoque e preço para a loja, concilia os recebimentos do banco e atualiza o rastreio das entregas. Cada item tem linha do tempo, erros explicados em português com correção em um clique e retentativas automáticas. Painel ao vivo, alertas por e-mail e WhatsApp e auditoria completa.

**Demonstração publicada:** https://pedroemerich.github.io/integracao-erp/

**Credenciais de demonstração** (ou use os atalhos de um clique na tela de login):

| Perfil | E-mail | Senha | O que pode fazer |
| --- | --- | --- | --- |
| Administrador | ana.ribeiro@nortex.demo | demo123 | Tudo, inclusive ligar/desligar integrações, credenciais, mapeamentos e regras de alerta |
| Operador | carlos.mendes@nortex.demo | demo123 | Acompanha a fila, sincroniza, corrige e reprocessa; não acessa configurações |

Empresa fictícia: **Nortex Distribuidora** (atacado de materiais elétricos, São Paulo/SP). Todos os dados são fictícios.

## Funcionalidades

- Dashboard com pedidos sincronizados hoje, taxa de sucesso, erros pendentes, tempo médio de sincronização e horas manuais economizadas
- Gráfico de volume por hora e por integração (7 dias e 24 horas) e saúde de cada conector com o último ping
- 5 integrações: Loja → ERP (pedidos), ERP → Loja (estoque e preço), Planilha → ERP, Banco → ERP (conciliação) e Transportadora → Loja (rastreio)
- Liga/desliga, frequência (tempo real, a cada X minutos, horário fixo), credenciais mascaradas e “Sincronizar agora” com barra de progresso
- Fila de execuções com filtros, busca por número do pedido e exportação CSV
- Linha do tempo de cada item (recebido → validado → transformado → enviado → confirmado) com payloads JSON de entrada, saída e resposta
- Erros reais explicados em português: CNPJ inválido, produto sem cadastro no ERP, estoque insuficiente, timeout do ERP, título já baixado
- Correção do dado na hora e reprocessamento, reprocessamento em lote, ignorar com justificativa
- Retentativas automáticas com backoff exponencial, registradas no histórico
- Mapeamento de campos de/para visual, com transformações e pré-visualização ao vivo
- Importação de planilha CSV/XLSX com validação linha a linha, importação só das linhas válidas, relatório e planilha de exemplo
- Conciliação bancária com sugestões automáticas, divergências e conciliação manual
- Regras de alerta com notificações no app e texto pronto de e-mail e WhatsApp
- Logs e auditoria com exportação CSV
- Modo “demonstração ao vivo”: pedidos novos a cada poucos segundos para o painel se mexer na reunião
- Perfis Administrador e Operador, tema claro e escuro, responsivo e acessível (teclado, foco visível, contraste AA)
- Funciona sem servidor: conectores simulados atrás de interfaces, prontos para trocar por integrações reais

## Tecnologias (tags)

`React` `TypeScript` `Vite` `Zustand` `React Router` `Recharts` `SheetJS` `Vitest` `Playwright` `GitHub Actions` `GitHub Pages` `Integração de sistemas` `ERP` `Conciliação bancária` `Automação`

## Capturas de tela (ordem recomendada)

Arquivos em `docs/screenshots/` (1440×900; as de celular em 390×844).

| # | Arquivo | Legenda |
| --- | --- | --- |
| 1 | `01-dashboard.png` | Visão geral: indicadores do dia, volume por integração nos últimos 7 dias e saúde dos conectores. |
| 2 | `03-fila-erro-aberto.png` | Pedido com CNPJ inválido aberto na fila: o erro explicado em português e a correção ali mesmo. |
| 3 | `04-linha-do-tempo.png` | Linha do tempo de um pedido: timeouts do ERP, retentativas com espera crescente e reprocessamento até a confirmação. |
| 4 | `05-mapeamento.png` | Mapeamento de/para visual com transformações e pré-visualização ao vivo do registro convertido para o ERP. |
| 5 | `06-importacao-validacao.png` | Importação de planilha: validação linha a linha, células com erro destacadas e importação só do que está certo. |
| 6 | `07-conciliacao.png` | Conciliação bancária: recebimentos do banco casados automaticamente com os títulos do ERP. |
| 7 | `10-tema-escuro-ao-vivo.png` | Tema escuro com o modo demonstração ao vivo ligado: pedidos novos chegando a cada poucos segundos. |
| 8 | `08-alertas.png` | Regras de alerta e a mensagem de WhatsApp pronta para a equipe. |
| 9 | `02-integracoes.png` | As cinco integrações com frequência, status e “Sincronizar agora”. |
| 10 | `11-celular-dashboard.png` | O painel no celular. |
| 11 | `09-auditoria.png` | Auditoria: quem fez o quê e quando, com exportação CSV. |
| 12 | `00-login.png` | Tela de entrada com os atalhos de demonstração por perfil. |
| 13 | `12-celular-erros.png` | Tratamento de erros no celular. |

Para regenerar: `npm run screenshots`.
