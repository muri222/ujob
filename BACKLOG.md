# Backlog · F0 e F1

Ordem de execução de cima para baixo. Cada item vira uma issue e uma branch. Critério de aceite = o que precisa ser verdade para fechar.

## F0 · Fundação (semana 1)

**Saída da fase:** perfil "Artista 3D" criado, uma vaga real avaliada pelo Claude com nota e justificativa salvas no banco.

### F0.1 Repositório limpo
- Importar o ujob num repo novo (`radar`), sem `.env`, `pb_data`, `.venv`, `__pycache__`, `.panel.*`, `.scout.*`.
- `.gitignore` cobrindo esses itens. Adicionar `CLAUDE.md` e `BACKLOG.md`.
- Trocar a senha do coletor (a do zip vazou).
- **Aceite:** clone limpo roda pelo README do ujob e o painel abre com vagas coletadas.

### F0.2 Multi-perfil
- Migração: coleção `profiles` (nome, tipo: pessoa/estúdio/cliente, skills, portfólio, idiomas, países, modo de envio, limiar, teto diário) e campo `profile` nas coleções que dependem do usuário (`applications`, `searches`).
- Migrar o registro único de `profile` para o primeiro item de `profiles`.
- Seletor de perfil no topo da sidebar, guardado na sessão.
- **Aceite:** dois perfis com funis separados; trocar de perfil troca vagas salvas, buscas e notas.

### F0.3 Fila de tarefas de IA
- Migração: `ai_tasks` (tipo, perfil, referência, payload, status queued/running/done/failed, resultado, erro, tentativas) e `ai_log`.
- Conta de serviço `brain` em `bots`, com acesso só a `ai_tasks`, `ai_log` e leitura do que precisar.
- Rotas `/api/radar/tasks/next` e `/api/radar/tasks/:id/result`, liberadas no guard.
- **Aceite:** criar tarefa pela API, o worker pega, devolve resultado, realtime atualiza a tela.

### F0.4 Serviço brain: Claude do usuário
- `services/brain` com uv. `brain/claude.py`: só o Claude Code logado no PC (`claude -p --output-format json --json-schema`), na assinatura de quem instalou. Sem outros provedores.
- Detectar se o Claude Code está instalado e logado; se não, avisar na interface e segurar as tarefas na fila até voltar.
- Validação com pydantic, 1 retry com o erro, registro em `ai_log`.
- **Aceite:** teste que roda um prompt real no Claude e valida o schema.

### F0.5 Nota real de vaga (substitui a 93% fixa)
- Tarefa `job_fit`: entra CV mestre + vaga, sai `{score, por_que, atende[], parcial[], falta[], vale_aplicar, motivo}`.
- `match.js` continua como pré-filtro grátis (só vagas com regra acima de 50 vão para a IA).
- Card da vaga mostra a nota da IA quando existir, com selo "avaliada pelo Claude".
- **Aceite:** 20 vagas avaliadas com notas variadas e justificativas que você concorda em pelo menos 15.

### F0.6 Shell desktop
- `desktop/` com Tauri 2: janela abrindo 127.0.0.1, sobe e derruba PocketBase, scout e brain junto com o app, ícone na bandeja. Sem login: primeira execução cria o `.env` e o dono local sozinhos.
- **Aceite:** um duplo clique abre tudo; fechar o app encerra os processos.

## F1 · MVP de prospecção (semanas 2 a 4)

**Saída da fase:** 50 leads reais contatados e candidaturas por e-mail saindo pelo endereço dedicado, tudo pelo app.

### F1.1 CV mestre e Mente v0
- CV mestre estruturado (JSON) a partir do `resume` do ujob + importação de PDF/site via brain.
- `mind_facts` com origem, confiança e validade. Painel "O que a Mente aprendeu" com aprovar/corrigir/apagar.
- Recusa de vaga com motivo (chips do AI Apply + texto livre) grava fato e ajusta pesos.

### F1.2 Fontes internacionais de vagas
- Greenhouse/Lever/Ashby de estúdios e agências gringos (lista curada de games, VFX, publicidade), ArtStation Jobs, quadros remotos extras.
- Campo de país e moeda nas vagas; filtro "fora do Brasil".

### F1.3 Candidatura por e-mail (modo Revisão)
- Endereço dedicado no domínio do usuário. SPF, DKIM e DMARC configurados.
- Tarefas `cover_letter` (carta por empresa, idioma da vaga) e `cv_tailor` (reordena e destaca, nunca inventa). PDF por vaga.
- Fila "Prontas para enviar" com prévia; enviar só com clique. Teto diário e registro em `audit`.

### F1.4 Leads e campanhas
- Coleções `segment_packs`, `campaigns`, `leads`, `lead_signals`. 3 pacotes de fábrica para começar (Marcas de cosméticos, Bebidas, Estúdios de games).
- Fonte Google Places (API oficial) + raspador do site da empresa (e-mail, redes, carreiras).
- Dedupe por domínio/handle/telefone.

### F1.5 Dossiê e abordagem
- Tarefa `lead_dossier`: diagnóstico, dor provável, serviço recomendado, ideia de work preview no estilo do cliente, "merece projeto gratuito?" com motivo.
- Tarefa `outreach`: DM de até 5 linhas e e-mail frio, PT/EN, 2 variações. Botões copiar, abrir perfil, abrir wa.me.
- Triagem em cards (reuso da Maratona) para leads.

### F1.6 Plano do dia
- Visão geral ganha "Hoje": N vagas para revisar, N leads para contatar, follow-ups vencidos, reuniões. Um clique leva a cada fila.

## Feito depois da F1 (2026-10-19)

- **Fase A · Personalização:** busca de vagas descrita em texto livre (Haiku vira termos PT/EN), segmento de leads personalizado com IA, 6 paletas em claro/escuro/sistema, menu por fluxo, página Como usar.
- **Aba Claude:** chat estilo app do Claude com contexto do Radar a cada resposta, streaming, anexos (Read só na pasta da conversa), busca na web, áudio com Whisper local, modelos Haiku/Sonnet/Opus, fixar/renomear/arquivar/apagar.
- **Paridade AiApply:** Auto Apply (Revisão/Híbrido/Automático, cron de 30 min), simulador de entrevista (modo do chat, avaliação por critério), Scanner ATS, Tradutor de CV com PDF.

## Feito em 2026-10-19 (tarde)

- **Funções:** painéis por área (Artista 3D, Editor de Vídeo...), cada um com CV, preferências, buscas, funil e painel próprios.
- **Preferências em abas** igual AiApply e **Config. da conta** separada.
- **Fontes:** Workable (global + por empresa), Recruitee, Personio, LinkedIn/Indeed/Google Vagas via Apify (opcional, com teto), descoberta automática de empresas, Adzuna/Jooble no app, +28 empresas.
- **Candidatura automática** (Revisão rápida + Suas vagas), **Kits de candidatura**, **Visão geral** com Sua semana.
- **F2.1 Entrada** feita: IMAP sem IA, etiqueta por regra, ligação ao funil, resumo e resposta com Claude. Falta testar com e-mail real (precisa da senha de app).

## Feito em 2026-10-19 (noite)

- **Radar global:** países por função (com autorização de trabalho/visto), "mundo todo (remoto)", busca por país em Workable, Adzuna, LinkedIn, Indeed e Google; portais só-Brasil saem quando a busca não inclui o Brasil; filtro por país nas Vagas e na frase de busca.
- **Configuração inicial em 6 passos** (igual AiApply) na primeira vez e em cada função nova: contato, currículo (PDF/site), cargos (Claude sugere), países e visto, salário, modo. Termina com a primeira busca salva.
- **Leads no mundo todo** (país, região, cidade) e segmentos em cartões com editar/excluir.

## Próximos (F2)

### F2.1 Inbox de respostas (feito, ver acima)
- IMAP do e-mail já configurado: lê respostas das candidaturas e e-mails frios, liga à mensagem enviada, move o funil (Entrevista, Recusada) com confirmação.
- Claude resume cada resposta e sugere a réplica (no chat ou em Prontas para enviar).

### F2.2 Formulários ATS (hands)
- Playwright pra Gupy, Greenhouse, Lever, Ashby: preenche o formulário com o CV adaptado, para antes do envio pra revisão (ou envia no modo Automático).

### F2.3 Interview Buddy (ao vivo)
- Captura do áudio da chamada (loopback do Windows), transcrição local em tempo real e sugestões do Claude numa janela flutuante. Avaliar viabilidade e ética (avisar quando for usar).

### F2.4 MCP do Radar
- Servidor MCP expondo vagas, funil, leads e Mente pro Claude Code/Desktop do usuário.

### F2.5 Ações pelo chat
- O Claude do chat pode propor ações com confirmação: salvar vaga, criar busca, gerar candidatura, criar campanha de leads.
