# CLAUDE.md · Radar

Radar é um app desktop pessoal de prospecção e carreira com IA. Ele nasce do **ujob** (agregador de vagas do Dudu) e soma:
candidatura automática, inbox, prospecção de clientes multi-segmento, CRM, "Mente" (memória do usuário),
simulador de reunião com professor de inglês e conselheiro sincero.

Plano completo: doc "Planejamento: App de Prospecção Inteligente com IA". Este arquivo é a regra do repositório.

## Regras de ouro

1. **Construir em cima do ujob, nunca do lado.** Antes de criar algo, procure se o ujob já faz. Reaproveite padrões, visual e helpers.
2. **IA só onde precisa.** Tudo que dá para fazer com regra, SQL, regex ou biblioteca local é feito sem IA. IA entra para julgar, escrever e interpretar.
3. **Claude primeiro.** Provedor padrão = Claude Code logado na máquina (`claude -p`). Alternativas pelo mesmo adapter: Codex CLI, Anthropic API, OpenRouter, DeepSeek, Ollama.
4. **Nada sai sem o usuário saber.** Envio externo (e-mail, formulário) respeita o modo do perfil (Revisão, Híbrido, Auto), teto diário e fica registrado em `audit`.
5. **Sem DM automática** em Instagram, WhatsApp, LinkedIn ou X. O app gera o texto e abre o link; o usuário envia.
6. **Sem inventar.** Carta, CV e mensagem só usam fatos do CV mestre, da Mente ou da fonte. Nunca experiência ou skill inventada.
7. **Honestidade no Conselheiro.** Sem bajulação, nota por critério, fonte e data em toda afirmação de mercado.
8. **Textos de interface em PT-BR**, tom do ujob (direto, leve). Não usar travessão (—) em textos de interface nem em prompts gerados.

## Estrutura

```
apps/panel/            PocketBase (Go, SQLite): banco, API, auth, realtime
  pb_migrations/       schema (JS). Nunca editar migração antiga: criar nova com timestamp maior
  pb_hooks/            rotas e regras (*.pb.js carregam sozinhos, *.js são módulos)
    guard.pb.js        ALLOWLIST da API. Rota ou coleção nova = adicionar aqui, senão responde 404
  pb_public/           interface: HTML + JS puro (ES modules) + CSS
    scripts/app.js     ROUTES e sidebar. Tela nova = view em scripts/views + linha em ROUTES
    scripts/core/      api, router, realtime, dom (h()), match, letter, places, sentence...
    styles/tokens.css  tokens de cor e tipo. Usar tokens, nunca cor solta
services/scout/        coletor Python 3.12 + Scrapy (ujob)
  ujob_scout/sources/  um arquivo por tipo de fonte, classe com @register("tipo")
  catalog/*.json       acervo de fontes
  ujob_scout/panel.py  cliente da API /api/scout/* (conta "bots", só manda vagas)
services/brain/        NOVO. Worker Python de IA: consome ai_tasks, chama provedores, grava resultado
services/hands/        NOVO (F2). Playwright + IMAP/SMTP: formulários ATS, envio e leitura de e-mail
services/mcp/          NOVO (F2). Servidor MCP expondo o Radar para o Claude
desktop/               NOVO. Shell Tauri: janela do painel + sobe PocketBase, scout, brain, hands
infra/                 docker-compose e Caddy (ujob), mantidos para rodar em servidor
```

## Como rodar (Windows, local)

```
copy .env.example .env        # preencher SCOUT_PASSWORD e BRAIN_PASSWORD
cd apps/panel && pocketbase.exe superuser upsert EMAIL SENHA && pocketbase.exe serve --http=127.0.0.1:8095
cd services/scout && uv sync && uv run python -m ujob_scout.scheduler
cd services/brain && uv sync && uv run python -m brain.worker
```
Abrir http://127.0.0.1:8095. Testes: `uv run --group dev pytest` em cada serviço Python.

## Padrões do código

**Backend (PocketBase)**
- Coleções novas via migração. Campos com limites (`max`, `maxSize`) como o ujob já faz.
- Rotas próprias em `pb_hooks/*.pb.js` com prefixo `/api/radar/`. Adicionar o prefixo no `OPEN_API` do guard.
- Serviços (scout, brain, hands) usam contas próprias na coleção auth `bots` com permissões mínimas.
- Jobs periódicos com `cronAdd`, nomes `radar-*`.

**Interface**
- JS puro com `h()` de `core/dom.js`. Sem framework, sem bundler, sem CDN (CSP é `script-src 'self'`).
- Uma view por tela: `export default async function nome(root, { params, query, signal })`, igual às existentes. Usar `header()` e o bloco `.empty.card` para estado vazio.
- Tempo real via `core/realtime.js`. Estados vazios, carregando e erro em toda tela nova.
- Atalhos de teclado seguem o padrão do ujob (J/K navega, A candidata, S salva).

**Python**
- Python 3.12, `uv`, type hints, funções pequenas. `requests` para HTTP simples, Scrapy só no scout.
- Fonte nova no scout: classe em `sources/`, entrada no `catalog/`, teste em `tests/`.

**IA (services/brain)**
- Toda chamada passa por `brain/providers.py` (`AIProvider.complete(task, prompt, schema)`).
- Saída sempre JSON validado (pydantic). Falhou a validação: 1 nova tentativa com o erro, depois marca a tarefa como `failed`.
- Prompts em `brain/prompts/*.md`, versionados, com variáveis explícitas. Nada de prompt espalhado no código.
- Roteamento: tarefas pesadas (dossiê, conselheiro, simulador, carta) no melhor modelo; extração em lote (Mente, classificação) no mais barato.
- Registrar provedor, modelo, tokens, custo e latência em `ai_log`.
- Contexto da Mente montado por `brain/mind.py` com limite de tokens.

## Coleções (alvo)

Do ujob: `sources`, `jobs`, `runs`, `applications`, `searches`, `profile`, `bots`, `honeypot_hits`.
Novas: `profiles`, `segment_packs`, `campaigns`, `leads`, `lead_signals`, `dossiers`, `messages`, `inbox`,
`proposals`, `projects`, `events`, `simulations`, `language_errors`, `mind_facts`, `mind_vectors`,
`ai_tasks`, `ai_log`, `answers_library`, `audit`.

## Segurança e dados

- Nunca commitar `.env`, `pb_data/`, `.venv/`, `*.pyc`. Verificar `.gitignore` antes de todo commit.
- Segredos de provedores (API keys, senha IMAP) no cofre do sistema via Tauri, nunca no banco em texto puro.
- Leads: guardar só dado profissional e público, com `origem`. Botão "esquecer lead" apaga de verdade.
- Respeitar robots.txt e o ritmo de coleta do scout. Não coletar LinkedIn, Indeed, Catho.

## Definição de pronto

Uma tarefa só está pronta quando: funciona na interface real, tem estado vazio e de erro, passa nos testes,
não quebra o fluxo atual do ujob (busca, vagas, funil, fontes) e foi usada pelo Murillo pelo menos uma vez.
