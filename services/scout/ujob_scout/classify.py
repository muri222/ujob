import re

from .text import fold

CATEGORIES = [
    ("tecnologia", "seguranca da informacao|ciberseguranca|cyber|security engineer|application security|appsec|desenvolvedor|developer|programador|software|front ?end|back ?end|"
                   "full ?stack|devops|\\bsre\\b|cloud|nuvem|analista de sistemas|tecnologia da informacao|\\bti\\b|\\bit\\b|\\bqa\\b|quality assurance|tester|test (and|&) validation|"
                   "mobile|android|\\bios\\b|flutter|react|java|python|\\bphp\\b|\\.net|node|golang|ruby|\\bsap\\b|abap|salesforce|redes|network|sysadmin|\\bdba\\b|tech lead|"
                   "help ?desk|service desk|suporte tecnico|tecnico de suporte|technical support|infraestrutura|platform engineer|system architect|solutions? architect|"
                   "engineering manager|web development|\\bfde\\b|site reliability|computer vision|ai engineer|ml engineer|\\bai\\b.*engineer"),
    ("dados", "dados|\\bdata\\b|analytics|\\bbi\\b|business intelligence|power bi|machine learning|\\bml\\b|\\bia\\b|\\bai\\b|inteligencia artificial|estatistic|scientist|cientista"),
    ("produto", "product manager|product owner|product system|gerente de produto|\\bpo\\b|scrum|agilista|agile coach|produtos e operacoes"),
    ("design", "designer|\\bux\\b|\\bui\\b|design|diretor de arte|motion|ilustrador"),
    ("marketing", "marketing|social media|conteudo|content|copywriter|redator|\\bseo\\b|midia|media|trafego|growth|comunicacao|publicidade|branding|brand|influenc|jornalista|"
                  "assessoria de imprensa|creative|criativo|programmatic|strategist|community|social"),
    ("juridico", "juridico|advogad|paralegal|compliance|direito|\\blegal\\b|contracts? specialist|contratos"),
    ("rh", "recursos humanos|\\brh\\b|\\bhr\\b|recrutamento|recrutador|recruit|talent acquisition|departamento pessoal|\\bdp\\b|\\bpeople\\b|gente e gestao|treinamento e desenvolvimento|"
           "folha de pagamento|beneficios|personal|entgelt|payroll"),
    ("financeiro", "financeir|financas|finance|financial|contabil|contador|accounting|accountant|buchhalt|fiscal(?! de loja)|tributari|\\btax\\b|controladoria|controller|tesouraria|treasury|"
                   "contas a (pagar|receber)|cobranca|collections|credito|credit|auditor|audit|bancari|banker|banking|investiment|investor|renda (fixa|variavel)|economista|pricing|"
                   "fp&a|actuar|insurance|seguros|chargeback|fraud|\\baml\\b|billing|faturamento|payments?|fiduciari|wealth|structured products|cambio"),
    ("saude", "enfermeir|enfermagem|nurse|medic[oa]|medical|farmaceutic|pharma|fisioterap|physio|nutricionista|psicolog|dentista|odonto|saude|health|hospital|clinica|clinical|"
              "cuidador|biomedic|radiolog|laboratorio|instrumentador|fonoaudiolog|veterinari|terapeuta|socorrista|maqueiro|masseur|massag"),
    ("educacao", "professor|docente|pedagog|educador|educacao|education|teacher|monitor(?:a)? de|tutor|instrutor|escola|ensino|auxiliar de classe|bibliotec|bolsista"),
    ("seguranca", "vigilante|seguranca patrimonial|porteir|controlador de acesso|monitoramento|bombeiro|brigadista|seguranca do trabalho|security officer|vigia"),
    ("construcao", "pedreiro|servente de obra|\\bobras?\\b|construcao|construction|mestre de obras|carpinteiro|armador|pintor|encanador|azulejista|topograf|arquitet|"
                   "engenheiro civil|serralheir|eletricista predial"),
    ("agro", "agronom|agricola|\\bagro|rural|fazenda|tratorista|colheit|zootecn|agropecuari|pecuari|safra|florestal|irrigacao|renewables|renovaveis"),
    ("alimentacao", "cozinh|\\bchef\\b|garcom|garconete|padeir|confeiteir|acougueir|barista|pizzaiolo|restaurante|lanchonete|chapeiro|copeir|sushi|crew|alimentos"),
    ("varejo", "operador de caixa|\\bcaixa\\b|repositor|fiscal de loja|\\bloja\\b|lojas|varejo|retail|\\bstore\\b|\\bshop\\b|balconista|gerente de loja|merchandis|supermercado|"
               "atacad|frentista|beleza|perfumaria|\\bextra\\b|category manager"),
    ("vendas", "vendedor|vendas|vendedora|comercial|commercial|\\bsales\\b|\\bsdr\\b|\\bbdr\\b|account (executive|manager)|executivo de contas|gerente de contas|representante|"
               "consultor de vendas|promotor|corretor|broker|key account|pre-?vendas|inside sales|negocios|business development|hunter|channel partner|partnerships?"),
    ("atendimento", "atendente|atendimento|\\bsac\\b|call center|telemarketing|recepcionista|recepcao|customer|client success|\\bcx\\b|\\bcs\\b|suporte ao cliente|"
                    "support representative|relacionamento|ouvidoria|kundenberater|agente de"),
    ("logistica", "motorista|entregador|logistic|estoquista|estoque|almoxarif|armazem|warehouse|conferente|expedicao|separador|empilhadeira|motoboy|transporte|frota|"
                  "supply chain|supply|procurement|carga e descarga|carregador|descarregador|empacotador|ajudante de carga|caminhao|portuari|disponent|materialwirtschaft|"
                  "rigger|sinaleiro"),
    ("industria", "operador de (maquina|producao|empilhadeira)|producao|production|industri|manufactur|montador|soldador|torneiro|mecanic|mechanic\\b|eletricista|manutencao|"
                  "maintenance|ferramenteiro|caldeireiro|metalurg|usinagem|injetora|qualidade|quality|costureir|frigorific|desoss|automacao|automation|instrumentation|"
                  "inspetor|borracheir|tecnico de automacao"),
    ("engenharia", "engenheir|engenharia|engineer|ingenieur|projetista|desenhista|cadista|autocad|eletrotecnic|scheduler|kaltetechnik|simulation|flight"),
    ("servicos", "limpeza|faxin|zelador|camareir|governanta|jardineir|lavador|manicure|cabeleireir|esteticista|barbeir|diarista|servicos gerais|lavanderia|baba|ajudante geral"),
    ("administrativo", "administrativ|administracao|secretari|escritorio|office|back ?office|documentacao|comprador|compras|assistente|auxiliar|analista|analyst|"
                       "specialist|especialista|operations|operacoes|operacional|project manager|projektleiter|planejamento|planning|coordenador|coordinator|"
                       "gerente|manager|diretor|director|\\bhead\\b|encarregad|supervisor|associate|executive|lider|lead"),
]
SENIORITY = [
    ("estagio", "estagi|intern(ship)?\\b"),
    ("lideranca", "gerente|coordenador|supervisor|\\bhead\\b|diretor|director|lider|\\blead\\b|manager|chefe|encarregad|\\bvp\\b|\\bc[etf]o\\b"),
    ("especialista", "especialista|specialist|\\bstaff\\b|principal"),
    ("senior", "senior|\\bsr\\.?\\b|\\biii\\b"),
    ("pleno", "pleno|\\bpl\\b|mid[- ]level|\\bii\\b"),
    ("junior", "junior|\\bjr\\.?\\b|entry[- ]level|\\bi\\b|trainee"),
]
CONTRACTS = [
    ("estagio", "estagi|internship"),
    ("aprendiz", "aprendiz|apprentice"),
    ("trainee", "trainee"),
    ("temporario", "temporari|temporary|safra"),
    ("freelancer", "freela|freelancer|autonomo"),
    ("pj", "\\bpj\\b|pessoa juridica|contractor"),
    ("talentos", "banco de talentos|talent pool"),
    ("clt", "\\bclt\\b|efetiv|full[- ]time|tempo integral"),
]
WORKPLACES = [
    ("hibrido", "hibrid|hybrid"),
    ("remoto", "remot|home ?office|anywhere|teletrabalho|telecommute|trabalho a distancia"),
    ("presencial", "presencial|on-?site|in-?office"),
]

_compiled = {name: [(key, re.compile(pattern)) for key, pattern in rules] for name, rules in
             {"category": CATEGORIES, "seniority": SENIORITY, "contract": CONTRACTS, "workplace": WORKPLACES}.items()}


def _first(kind: str, *texts: str) -> str:
    for text in texts:
        folded = fold(text)
        if not folded:
            continue
        for key, pattern in _compiled[kind]:
            if pattern.search(folded):
                return key
    return ""


def category(title: str, hints: str = "") -> str:
    return _first("category", title, hints) or "outros"


def seniority(title: str, hints: str = "") -> str:
    return _first("seniority", title, hints)


def contract(title: str, hints: str = "") -> str:
    return _first("contract", title, hints)


def workplace(*texts: str) -> str:
    return _first("workplace", *texts)
