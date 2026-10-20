# Changelog

## 1.1.0 (2026-10-20)

- Novo nome: **uJob** (janela, instalador, menu Iniciar e textos). Os dados continuam na mesma pasta, `%APPDATA%\com.murillo.radar`.
- Tour da primeira vez: depois da configuração inicial, passa por Config. da conta (IA e e-mail), Currículo, Preferências, Buscar, Vagas, Candidatura automática, Candidaturas, Leads, Chat e Suas funções, dizendo o que configurar em cada uma. Pode rever pelo Ctrl K ou em Como usar.

## 1.0.0 (2026-10-20)

Primeira versão oficial, com instalador para Windows.

**Instalação**
- Instalador NSIS por usuário (sem administrador). Leva painel, serviços e o `uv`, que baixa o Python na primeira vez.
- Dados em `%APPDATA%\com.murillo.radar`, separados do app: atualizar não apaga nada.

**Vagas**
- Funções (painéis por área) com configuração inicial em 6 passos: contato, currículo, cargos, países e autorização de trabalho, salário, modo.
- Busca no mundo todo por país, com "mundo todo (remoto)".
- Mais de 1.100 fontes; descoberta automática de empresas em Greenhouse, Lever, Ashby, Workable, Recruitee e Personio.
- LinkedIn, Indeed e Google Vagas via Apify (opcional, teto diário).
- Busca escrita com IA, filtro por país, Maratona, funil com gaveta em abas (Candidatura, Preparação, Vaga, Compatibilidade).

**Candidaturas**
- Candidatura automática (Revisão rápida e Suas vagas), modos Revisão, Híbrido e Automático.
- Kits de candidatura (carta, CV adaptado em PDF, follow-up), Scanner ATS e Tradutor de CV.
- Entrada: respostas dos recrutadores via IMAP, com etiqueta e ligação ao funil.
- Preparar entrevista com IA (empresa, salário, roteiro, pitch, perguntas) e simulador no chat.
- Preferências em abas (igual AiApply): biblioteca de respostas, motivos de rejeição, autoidentificação opcional.

**Leads**
- OpenStreetMap, Google Maps, Instagram (busca e hashtags), TikTok e IA na web, em qualquer país.
- Segmentos com IA, editar, arquivar e excluir; dossiê e mensagens de abordagem.

**IA**
- Claude Code logado por padrão; opção de ChatGPT (Codex CLI), OpenRouter, DeepSeek ou API compatível com OpenAI.
- Chat com contexto do Radar, anexos e áudio com transcrição local.
