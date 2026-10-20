# Radar

App desktop de carreira e prospecção com IA, que roda inteiro no seu PC. Acha vagas no mundo todo, avalia cada uma com IA, prepara candidaturas (carta, CV adaptado, follow-up), lê as respostas dos recrutadores e encontra clientes (leads) no mapa, no Google Maps, no Instagram e no TikTok.

Sem servidor, sem login, sem conta na nuvem: banco, coleta e IA rodam aqui. A IA usa a sua própria assinatura (Claude Code logado, por padrão).

## Instalar

1. Baixe o `Radar_1.0.0_x64-setup.exe` na página de [Releases](../../releases) e instale (não precisa de administrador).
2. Tenha uma IA logada no PC. Recomendado: [Claude Code](https://docs.claude.com/claude-code) (`claude auth login`). Também dá pra usar o ChatGPT pelo Codex CLI (`codex login`) ou uma chave de API (OpenRouter, DeepSeek ou compatível com OpenAI), escolhendo em Config. da conta.
3. Abra o Radar pelo menu Iniciar. Na primeira vez ele baixa o Python e as dependências sozinho (alguns minutos) e abre a configuração inicial: função, currículo, cargos, países e visto, salário e modo de candidatura.

Os dados ficam em `%APPDATA%\com.murillo.radar` (banco, senhas cifradas, logs). Atualizar ou desinstalar o app não apaga esses dados.

## O que faz

- **Funções:** um painel para cada tipo de vaga (ex.: Artista 3D, Editor de Vídeo), com currículo, países, buscas, funil e leads próprios.
- **Vagas do mundo todo:** mais de 1.100 fontes (Gupy, Greenhouse, Lever, Ashby, Workable, Recruitee, Personio, Get on Board, Working Nomads, Dribbble, ArtStation, InfoJobs, Vagas.com e outros). Empresas novas entram sozinhas quando uma vaga aponta para um sistema de vagas aberto. LinkedIn, Indeed e Google Vagas via Apify (opcional, com os seus créditos e teto diário).
- **Busca escrita:** descreva a vaga com suas palavras e a IA vira isso em cargos em português e inglês.
- **Candidatura automática:** revisão rápida (um cartão por vaga com o porquê, correspondências e lacunas), tabela "Suas vagas" e os modos Revisão, Híbrido e Automático, com limite diário.
- **Kits de candidatura:** carta, CV adaptado em PDF e e-mail de follow-up, de qualquer vaga, até colando a descrição.
- **Entrada:** lê as respostas no seu e-mail (IMAP), etiqueta (entrevista, rejeição...) e move o funil.
- **Preparar entrevista:** pesquisa da empresa, pretensão salarial, roteiro STAR, pitch e perguntas, só o que você marcar; simulador de entrevista no chat.
- **Chat com contexto:** como o app do Claude, mas já conhecendo seu currículo, funil, vagas e leads. Anexos e áudio (transcrição local).
- **Leads:** OpenStreetMap (grátis), Google Maps, Instagram e TikTok (Apify) ou IA pesquisando na web; site de cada empresa lido no PC; dossiê e mensagens de abordagem.

## Estrutura

```
apps/panel/        PocketBase: banco, API, regras (pb_hooks), migrações e interface (pb_public)
services/scout/    coletor de vagas (Python + Scrapy), catálogo de fontes em catalog/
services/brain/    worker de IA: Claude Code / Codex / API, SMTP e IMAP, leads, Whisper
desktop/           app Tauri: sobe tudo, abre a janela; stage.py monta o pacote do instalador
```

## Desenvolver

Precisa de [uv](https://docs.astral.sh/uv/), Rust e Node.

- Rodar: `INICIAR.bat` (navegador) ou o app em `desktop/src-tauri` (`cargo build --release`).
- Testes: `uv run --group dev pytest` em `services/brain` e `services/scout`.
- Instalador: em `desktop/src-tauri`, `npx @tauri-apps/cli@2 build` (gera `target/release/bundle/nsis/Radar_<versão>_x64-setup.exe`).

Regras do projeto em [CLAUDE.md](CLAUDE.md), próximos passos em [BACKLOG.md](BACKLOG.md), histórico em [CHANGELOG.md](CHANGELOG.md).
