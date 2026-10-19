UJOB
Painel de vagas de emprego para qualquer area. O cliente escolhe o segmento,
a regiao e os filtros, e o ujob vasculha os portais na hora. Uma base leve
com as vagas mais recentes roda sozinha o tempo todo.


O QUE TEM AQUI

apps/panel        PocketBase com o painel (pb_public), regras e rotas (pb_hooks)
                  e a estrutura do banco (pb_migrations)
services/scout    Coletor feito em Scrapy. Le os portais e manda as vagas pro painel
services/scout/catalog   Lista de todas as fontes (o acervo)
services/scout/tools     discover_gupy.py, que descobre empresas novas na Gupy
infra             docker-compose e Caddy para colocar no ar


DE ONDE VEM AS VAGAS (1.042 fontes)

Portais gerais, com busca por cargo e regiao
  Vagas.com, InfoJobs, BNE, Empregos.com.br, Gupy (portal geral),
  Trampos, Programathor. Adzuna e Jooble entram se tiver chave.

Gupy por estado
  27 fontes, uma por estado, sempre com as vagas mais novas de cada lugar.

Empresas e agencias (paginas oficiais de carreira)
  962 empresas na Gupy (943 empresas e 19 agencias de RH), como
  McDonald's, Assai, Rede D'Or, Lojas Renner, Solar Coca-Cola, Selpe.
  Ficam pausadas ate o cliente clicar em Seguir, para nao pesar.
  Mais 23 quadros diretos: Nubank, Stone, Inter, C6, BTG, XP, QuintoAndar,
  CI&T, VTEX, EBANX, Wellhub, Cabify, Thoughtworks e outras.

Comunidades
  15 repositorios abertos onde as empresas publicam vagas (backend-br,
  frontendbr, react-brasil, qa-brasil, uxbrasil e outros).

Remoto
  Remote OK, Himalayas, Jobicy, Arbeitnow e We Work Remotely.

O coletor respeita o robots.txt de cada site, anda devagar em cada portal
e nao usa LinkedIn, Indeed ou Catho, que proibem coleta.


COMO FUNCIONA

Base leve
  A cada 15 minutos o scout passa nas fontes ativas que ja deram o tempo
  delas (portais, estados, quadros, comunidades, remoto).

Busca sob demanda
  No painel, em Buscar vagas, o cliente monta a frase: area, cargo, lugar,
  modalidade e contrato. O scout vasculha os portais na hora e as vagas
  aparecem enquanto chegam, com o progresso de cada fonte.
  A mesma busca feita de novo em ate 3 horas aparece na hora, sem recoletar.

Buscas salvas
  Marcando "me avisar", a busca roda sozinha no ritmo escolhido e o painel
  mostra quantas vagas novas entraram.

Vaga encerrada
  Se a fonte lista todas as vagas (pagina de empresa), a vaga que sumiu fecha
  na hora. Nas outras, fecha depois de 96 horas sem aparecer.
  Encerradas ficam 120 dias e depois saem. As que estao no funil nunca somem.

Descricao completa
  Ao abrir uma vaga sem descricao, o painel busca o texto completo na fonte
  e extrai e-mail, telefone e WhatsApp quando estiverem no anuncio.


TELAS DO PAINEL

Visao geral     numero de vagas abertas, chegando agora, entrada e saida,
                areas, mapa do Brasil, empresas que mais contratam
Buscar          a busca em forma de frase
Vagas           explorador com filtros (tudo fica no link, da pra mandar)
Ao vivo         cada coleta aparecendo na hora
Empresas        quem esta contratando e quem seguir
Areas e mapa    as 23 areas e as vagas por estado
Candidaturas    funil arrastavel: Salvas, Candidatei, Entrevista, Teste,
                Proposta, Contratado, Encerrada
Buscas salvas   alertas com o numero de vagas novas
De onde vem     todas as fontes, com logo, saude e botao de coletar agora
Historico       cada coleta registrada

Atalhos: Ctrl K abre a busca rapida, B abre Buscar vagas.
Na lista de vagas: J e K navegam, A candidata, S salva, O abre na fonte.


COMO RODAR NO WINDOWS (LOCAL)

1. Copie .env.example para .env e preencha SCOUT_PASSWORD
   (python -c "import secrets; print(secrets.token_urlsafe(24))").
   Para rodar local use PANEL_URL=http://127.0.0.1:8095

2. Painel
   cd apps/panel
   pocketbase.exe superuser upsert seu@email.com SUA_SENHA
   pocketbase.exe serve --http=127.0.0.1:8095
   (as variaveis do .env precisam estar no ambiente do terminal)

3. Scout
   cd services/scout
   uv sync
   uv run python -m ujob_scout.scheduler

   Outros modos:
   uv run python -m ujob_scout.scheduler --sync     so atualiza o catalogo
   uv run python -m ujob_scout.scheduler --once     uma rodada da base
   uv run python -m ujob_scout.scheduler --only gupy-lojasrenner,bne

4. Abra http://127.0.0.1:8095 e entre com o superusuario.
   No primeiro acesso o painel pergunta o segmento e a regiao.

Testes do scout: uv run --group dev pytest


COLOCAR NO AR (SERVIDOR COM DOCKER)

1. Copie o projeto para o servidor e crie o .env (PANEL_DOMAIN, ACME_EMAIL,
   SCOUT_PASSWORD e PANEL_ALLOWED_IPS se quiser travar por IP).
2. Aponte o DNS do dominio para o servidor.
3. cd infra
   docker compose up -d --build
4. Crie o login:
   docker compose exec panel pocketbase superuser upsert seu@email.com SUA_SENHA --dir=/panel/pb_data
5. O banco fica em infra/data/panel. Faca backup dessa pasta.


SEGURANCA

- So o painel do ujob responde. O painel cru do PocketBase (/_/) e rotas de
  ataque comuns (wp-admin, .env, .git) caem numa armadilha, ficam registradas
  e recebem uma resposta engracada.
- API com lista do que pode passar. Todo o resto responde 404.
- Login com campo-armadilha, 5 tentativas e 1 minuto de castigo,
  sessao de 8 horas e saida automatica apos 30 minutos parado.
- O coletor tem conta propria que so manda vagas, sem ver candidaturas.
- Cabecalhos de seguranca e CSP restrita em todas as paginas.
- Descricoes de vaga passam por limpeza antes de aparecer no painel.
- Em producao o Caddy bloqueia as rotas do coletor por fora e pode limitar
  o painel a IPs conhecidos.


VARIAVEIS DO .env

PANEL_URL             endereco do painel visto pelo scout
SCOUT_EMAIL           conta do coletor
SCOUT_PASSWORD        senha do coletor (12 caracteres ou mais)
SCOUT_LOOP_MINUTES    ritmo da base (padrao 15)
SCOUT_DETAIL_BUDGET   quantas paginas de detalhe por fonte por rodada
JOB_STALE_HOURS       horas sem aparecer para fechar a vaga (padrao 96)
JOB_RETENTION_DAYS    dias que encerradas ficam guardadas (padrao 120)
SEARCH_CACHE_MINUTES  tempo que uma busca pronta e reaproveitada (padrao 180)
GITHUB_TOKEN          opcional, aumenta o limite das comunidades
ADZUNA_APP_ID/KEY     opcional, liga a Adzuna
JOOBLE_KEY            opcional, liga a Jooble
PANEL_DOMAIN          dominio do painel em producao
ACME_EMAIL            e-mail para o certificado HTTPS
PANEL_ALLOWED_IPS     IPs liberados (0.0.0.0/0 ::/0 libera geral)
PB_DASHBOARD          1 reabre o painel cru do PocketBase para manutencao
