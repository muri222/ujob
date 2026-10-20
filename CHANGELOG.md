# Changelog

## 1.1.6 (2026-10-20)

- Revisão de responsividade: avaliação do Claude com itens longos quebra linha em vez de alargar a gaveta (Candidatura automática, Candidaturas, vaga). Filtros e tabela da Candidatura automática não alargam mais a página no celular. CV adaptado cabe no cartão em Prontas para enviar.
- CV adaptado no idioma da vaga: títulos (Summary, Experience, Education...), "present", idiomas e nome dos cursos traduzidos, item por item, sem acrescentar nada.
- Baixar PDF avisa que salvou em Downloads.

## 1.1.5 (2026-10-20)

- Prontas para enviar: botão "Baixar PDF" no CV adaptado.
- Círculo da nota não amassa mais na gaveta da candidatura (aba Compatibilidade).

## 1.1.4 (2026-10-20)

- Biblioteca de respostas: botão "Preencher com IA". Preenche só as perguntas vazias com o currículo, as preferências, o PDF enviado e o que a Mente aprendeu. O que não está lá fica vazio pra você completar (nada inventado).

## 1.1.3 (2026-10-20)

- Vários lugares de uma vez: no seletor de lugar, cada clique marca ou desmarca um país ou estado (ex.: Portugal, Espanha, São Paulo e Rio de Janeiro). "Qualquer lugar" limpa. Vale na lista de vagas, nos chips de país e nas buscas nos portais.

## 1.1.2 (2026-10-20)

- Tirar estado da busca: botão direito num estado do Brasil também deixa ele vermelho ("Brasil, menos São Paulo, Minas Gerais"), na lista de vagas e nas buscas nos portais.

## 1.1.1 (2026-10-20)

- Tirar país da busca: no seletor de lugar, botão direito num país deixa ele vermelho e as vagas de lá somem ("qualquer lugar, menos Brasil"). Vale na lista de vagas e nas buscas nos portais. Tirar o Brasil também esconde as fontes só brasileiras que vêm sem local (Gupy, Trampos...).

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
