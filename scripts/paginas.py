"""Gera as páginas de compartilhamento por estado e acerta as tags de prévia do index.html.

O WhatsApp e as redes sociais não rodam JavaScript: leem só as tags <meta> da página. Um link com
?uf=RJ mostraria sempre a prévia genérica. Este script cria uma página pequena por estado
(ex.: <site>/rj/) com título, descrição e imagem próprios, que redireciona para a tela certa:

  - estado com 2º turno para Governador -> Governador no estado
  - estado decidido no 1º turno         -> Presidente no estado (2º turno)
  - <site>/presidente/                  -> Presidente · Brasil

Uso (na raiz do projeto, depois de scripts/segundo_turno.py):
  python scripts/paginas.py https://seu-projeto.pages.dev
  python scripts/paginas.py https://seu-projeto.pages.dev --imagens   (também gera as imagens, com o Edge ou o Chrome)

Também grava no index.html o título, a descrição e os dados estruturados (Schema.org em JSON-LD, que o Google
lê para entender o site), gera public/robots.txt e public/sitemap.xml e a página do simulador
(<site>/simulador/: o mesmo app do index.html, com título, prévia, dados estruturados e texto próprios).

Rode de novo sempre que mudar o endereço do site ou o arquivo dados/segundo-turno.json.
"""
import html
import json
import re
import shutil
import subprocess
import sys
import urllib.parse
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SITE = RAIZ / "public"   # pasta publicada do site
UFS = {"ac":"Acre","al":"Alagoas","ap":"Amapá","am":"Amazonas","ba":"Bahia","ce":"Ceará","df":"Distrito Federal","es":"Espírito Santo",
       "go":"Goiás","ma":"Maranhão","mt":"Mato Grosso","ms":"Mato Grosso do Sul","mg":"Minas Gerais","pa":"Pará","pb":"Paraíba","pr":"Paraná",
       "pe":"Pernambuco","pi":"Piauí","rj":"Rio de Janeiro","rn":"Rio Grande do Norte","rs":"Rio Grande do Sul","ro":"Rondônia","rr":"Roraima",
       "sc":"Santa Catarina","sp":"São Paulo","se":"Sergipe","to":"Tocantins"}
NAVEGADORES = [r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
               r"C:\Program Files\Google\Chrome\Application\chrome.exe", "msedge", "google-chrome", "chromium", "chrome"]
MINUSCULAS = {"de", "da", "do", "das", "dos", "e"}
# Artigo de cada estado, para "no Piauí", "na Bahia", "em São Paulo"
ARTIGO = {"ac":"o","ap":"o","am":"o","ba":"a","ce":"o","df":"o","es":"o","ma":"o","pa":"o","pb":"a","pr":"o","pi":"o","rj":"o","rn":"o","rs":"o","to":"o"}
em = lambda uf: {"o": "no ", "a": "na "}.get(ARTIGO.get(uf), "em ") + UFS[uf]
artigo = lambda uf, maiuscula=False: ((ARTIGO[uf].upper() if maiuscula else ARTIGO[uf]) + " " if uf in ARTIGO else "") + UFS[uf]


def nome(n):
    """FLAVIO BOLSONARO -> Flavio Bolsonaro (o TSE publica o nome de urna em maiúsculas)."""
    partes = n.lower().split()
    return " ".join(p if i and p in MINUSCULAS else p[:1].upper() + p[1:] for i, p in enumerate(partes))


def duelo(cands):
    a, b = sorted(cands, key=lambda c: c["nome"])   # ordem alfabética: nenhum candidato aparece primeiro por estar na frente
    return f"{nome(a['nome'])} ({a['partido']}) × {nome(b['nome'])} ({b['partido']})", f"{nome(a['nome'])} × {nome(b['nome'])}"


def tags_og(site, url, titulo, descricao, imagem, alt):
    e = lambda s: html.escape(s, quote=True)
    return f"""<link rel="canonical" href="{e(url)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="Placar da Apuração 2026">
<meta property="og:title" content="{e(titulo)}">
<meta property="og:description" content="{e(descricao)}">
<meta property="og:url" content="{e(url)}">
<meta property="og:image" content="{e(site + imagem)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{e(alt)}">
<meta name="twitter:card" content="summary_large_image">"""


NOME = "Placar da Apuração 2026"
TITULO = "Simulador do 2º turno 2026, propostas e apuração ao vivo · Placar da Apuração"   # igual ao de js/main.js (visão geral)
AUTOR = {"@type": "Person", "name": "Luiz Carlos Porto", "url": "https://luizcporto.github.io/"}
TSE = {"@type": "GovernmentOrganization", "name": "Tribunal Superior Eleitoral (TSE)", "url": "https://www.tse.jus.br/"}


def schema(site, t2):
    """Dados estruturados da página principal: o site, o aplicativo (SoftwareApplication) e o autor.
    Sem nota de avaliação (aggregateRating): só entra quando houver avaliações reais de usuários."""
    a, b = sorted(t2["presidente"]["cands"], key=lambda c: c["nome"])
    finalistas = f"{nome(a['nome'])} e {nome(b['nome'])}"
    n_gov = sum(1 for g in t2["governador"].values() if g["turno2"])
    grafo = [
        {"@type": "WebSite", "@id": site + "#site", "url": site, "name": NOME, "alternateName": "Placar da Apuração",
         "inLanguage": "pt-BR", "publisher": {"@id": site + "#autor"}},
        {**AUTOR, "@id": site + "#autor"},
        {"@type": "SoftwareApplication", "@id": site + "#app", "name": NOME,
         "alternateName": ["Simulador do 2º turno 2026", "Simulador de segundo turno 2026", "Placar da Apuração"],
         "url": site, "isPartOf": {"@id": site + "#site"},
         "description": (f"Simulador gratuito do 2º turno das Eleições 2026: escolha para onde vão os votos de cada candidato do 1º turno "
                         f"e veja como ficaria a disputa entre {finalistas}. Compare os planos de governo oficiais dos finalistas a "
                         f"Presidente e Governador e acompanhe a apuração ao vivo com os dados oficiais do TSE."),
         "applicationCategory": "ReferenceApplication", "applicationSubCategory": "Eleições",
         "operatingSystem": "Qualquer sistema com navegador (Android, iOS, Windows, macOS, Linux)",
         "browserRequirements": "Requer JavaScript", "inLanguage": "pt-BR", "isAccessibleForFree": True,
         "offers": {"@type": "Offer", "price": "0", "priceCurrency": "BRL"},
         "featureList": [
             f"Simulador do 2º turno para Presidente: distribua entre {finalistas} os votos de cada candidato do 1º turno, dos brancos e nulos e de quem não votou, e veja o resultado na hora",
             "Compartilhamento da simulação como imagem (WhatsApp, Instagram) ou como link",
             "Comparativo dos planos de governo: propostas oficiais registradas no TSE pelos finalistas a Presidente e Governador",
             "Resumo lado a lado dos dois planos de governo para Presidente, nos mesmos 10 temas",
             f"Visão geral do 2º turno: Presidente e Governador em {n_gov} estados, com o resultado do 1º turno e os governadores eleitos no 1º turno",
             "Apuração ao vivo com dados oficiais do TSE, atualizada a cada 30 segundos",
             "Resultados do 1º turno para Presidente, Governador, Senador, Deputado Federal e Deputado Estadual ou Distrital em todos os estados",
             "Mapa do Brasil com quem está na frente em cada estado",
             "Gráfico da evolução da apuração, com estimativa por estado e comparativo com 2022",
             "Resultado por região e onde ainda faltam votos a apurar",
             "Busca de qualquer candidato em todos os cargos e estados",
             "Patrimônio declarado pelos candidatos ao TSE",
             "Favoritos para acompanhar disputas específicas",
             "Contagem regressiva e orientações para votar no 2º turno",
             "Continua funcionando se o TSE ficar fora do ar, com o último dado salvo",
         ],
         "keywords": (f"simulador 2º turno, simulador segundo turno 2026, eleições 2026, apuração 2026, resultado eleição 2026, "
                      f"{nome(a['nome'])}, {nome(b['nome'])}, planos de governo, propostas de governo, TSE"),
         "screenshot": site + "img/compartilhar.png", "image": site + "img/compartilhar.png",
         "author": {"@id": site + "#autor"}, "publisher": {"@id": site + "#autor"},
         "datePublished": "2026-10-04", "dateModified": date.today().isoformat(),
         # Evento: sem "offers" (votar não tem ingresso) nem "performer" (não há atração); o Google aponta
         # os dois só como melhoria opcional
         "about": {"@type": "Event", "name": "Eleições Gerais 2026 · 2º turno",
                   "description": (f"2º turno das Eleições Gerais 2026: votação para Presidente ({finalistas}) em todo o país "
                                   f"e para Governador em {n_gov} estados, das 8h às 17h (horário de Brasília)."),
                   "image": site + "img/compartilhar.png",
                   "startDate": "2026-10-25T08:00:00-03:00", "endDate": "2026-10-25T17:00:00-03:00",
                   "eventStatus": "https://schema.org/EventScheduled",
                   "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
                   "location": {"@type": "Place", "name": "Brasil", "address": {"@type": "PostalAddress", "addressCountry": "BR"}},
                   "organizer": TSE},
         # Fontes como CreativeWork (não Dataset): o site não publica os conjuntos de dados, só os usa; marcados como
         # Dataset, o Google os trata como candidatos à busca de conjuntos de dados e cobra campos que não cabem aqui
         "isBasedOn": [
             {"@type": "CreativeWork", "name": "Resultados oficiais das Eleições 2026", "url": "https://resultados.tse.jus.br/", "publisher": TSE},
             {"@type": "CreativeWork", "name": "Dados abertos do TSE: candidaturas, bens declarados e propostas de governo",
              "url": "https://dadosabertos.tse.jus.br/", "publisher": TSE},
         ]},
    ]
    corpo = json.dumps({"@context": "https://schema.org", "@graph": grafo}, ensure_ascii=False, indent=1).replace("</", "<\\/")
    return f'<script type="application/ld+json">\n{corpo}\n</script>'


fmt = lambda n: f"{n:,}".replace(",", ".")
pct = lambda x: f"{x:.2f}".replace(".", ",")
milhoes = lambda n: f"{n / 1e6:.1f}".replace(".", ",").removesuffix(",0") + " milhões"


def titulo_simulador(t2):
    a, b = sorted(t2["presidente"]["cands"], key=lambda c: c["nome"])
    return f"Simulador do 2º turno 2026: {nome(a['nome'])} × {nome(b['nome'])} · Placar da Apuração"   # igual ao tituloSim() de js/main.js


def sobre_simulador(t2):
    """Texto fixo da página simulador/ (o Google lê sem depender do JavaScript): como funciona, 1º turno e perguntas."""
    e = lambda s: html.escape(str(s))
    t1, cands = t2["presidente"]["t1"], t2["presidente"]["cands"]
    a, b = sorted(cands, key=lambda c: c["nome"])
    na, nb = nome(a["nome"]), nome(b["nome"])
    ids = {a["id"], b["id"]}
    outros = [c for c in t1["cands"] if c["id"] not in ids]
    v_outros, bn = sum(c["votos"] for c in outros), t1["brancos"] + t1["nulos"]
    n_gov = sum(1 for g in t2["governador"].values() if g["turno2"])
    # Divisão dos válidos só entre os dois (ponto de partida do simulador)
    pa, pb = (100 * c["votos"] / (a["votos"] + b["votos"]) for c in (a, b))

    linhas = "".join(f"<tr><td>{e(nome(c['nome']))}</td><td>{e(c['partido'])}</td><td>{fmt(c['votos'])}</td><td>{pct(c['pct'])}%</td></tr>"
                     for c in t1["cands"])
    linhas += (f"<tr><td>Brancos</td><td></td><td>{fmt(t1['brancos'])}</td><td></td></tr>"
               f"<tr><td>Nulos</td><td></td><td>{fmt(t1['nulos'])}</td><td></td></tr>"
               f"<tr><td>Não foram votar (abstenção)</td><td></td><td>{fmt(t1['abstencao'])}</td><td></td></tr>")
    faq = [
        ("O que é o simulador do 2º turno?",
         f"Uma ferramenta gratuita para montar o seu cenário do 2º turno para Presidente. Para cada grupo de eleitores do 1º turno, "
         f"você decide quantos por cento votariam em {na}, em {nb} ou em nenhum dos dois, e vê o resultado na hora."),
        ("O simulador é uma pesquisa eleitoral?",
         "Não. Ele mostra só o cenário que você montou: não é pesquisa nem previsão. O site não envia, não guarda e não soma as simulações das pessoas."),
        ("Por que, sem mexer em nada, os percentuais não são os do 1º turno?",
         f"No 1º turno, {na} teve {pct(a['pct'])}% e {nb} teve {pct(b['pct'])}% dos votos válidos; o resto foi para os outros candidatos. "
         f"No 2º turno os votos válidos se dividem só entre os dois. Com cada um só com os próprios votos, isso dá {pct(pa)}% × {pct(pb)}%. "
         f"O resultado muda conforme você distribui os outros eleitores."),
        ("De onde vêm os números?",
         f"Do resultado oficial do 1º turno de 4 de outubro publicado pelo TSE (resultados.tse.jus.br), com os votos do Brasil e do exterior: "
         f"{fmt(t1['eleitores'])} eleitores, {fmt(t1['comparecimento'])} votaram e {fmt(t1['validos'])} votos válidos."),
        ("Como compartilhar a minha simulação?",
         "Use “Compartilhar imagem” ou “Baixar imagem” para gerar uma imagem pronta para o WhatsApp e o Instagram, "
         "ou “Copiar link da simulação” para mandar um link que abre exatamente a mesma simulação."),
        ("Quando é o 2º turno?",
         f"Domingo, 25 de outubro de 2026, das 8h às 17h (horário de Brasília). O país inteiro vota para Presidente, e {n_gov} estados "
         f"também votam para Governador. Quem faltou no 1º turno pode votar normalmente no 2º."),
    ]
    perguntas = "".join(f"<div><h3>{e(q)}</h3><p>{e(r)}</p></div>" for q, r in faq)
    return f"""<section class="bloco sim-sobre" id="simSobre">
        <h2>Como funciona o simulador do 2º turno</h2>
        <p>No 1º turno, em 4 de outubro, {e(na)} ({e(a['partido'])}) teve {pct(a['pct'])}% dos votos válidos e {e(nb)} ({e(b['partido'])}) teve {pct(b['pct'])}%.
        Os outros {len(outros)} candidatos somaram {milhoes(v_outros)} de votos, {milhoes(bn)} de eleitores votaram branco ou nulo e {milhoes(t1['abstencao'])} não foram votar.
        No simulador, você decide em quem cada um desses grupos vota no 2º turno, em 25 de outubro, e vê como ficaria a disputa entre {e(na)} e {e(nb)}.</p>
        <h3>Resultado do 1º turno para Presidente</h3>
        <div class="tabela-wrap"><table class="ev-tabela"><thead><tr><th>Candidato</th><th>Partido</th><th>Votos</th><th>% válidos</th></tr></thead><tbody>{linhas}</tbody></table></div>
        <p class="ev-nota">Fonte: TSE, resultado oficial do 1º turno (Brasil e exterior).</p>
        <h3>Perguntas frequentes</h3>
        <div class="sim-faq">{perguntas}</div>
      </section>"""


def schema_simulador(site, t2):
    a, b = sorted(t2["presidente"]["cands"], key=lambda c: c["nome"])
    finalistas = f"{nome(a['nome'])} e {nome(b['nome'])}"
    url = site + "simulador/"
    grafo = [
        {"@type": "WebSite", "@id": site + "#site", "url": site, "name": NOME, "inLanguage": "pt-BR", "publisher": {"@id": site + "#autor"}},
        {**AUTOR, "@id": site + "#autor"},
        {"@type": "SoftwareApplication", "@id": url + "#app", "name": "Simulador do 2º turno 2026",
         "alternateName": ["Simulador de segundo turno 2026", "Simulador do 2º turno para Presidente"],
         "url": url, "isPartOf": {"@id": site + "#site"},
         "description": (f"Simulador gratuito do 2º turno para Presidente: decida para onde vão os votos de cada candidato do 1º turno, "
                         f"dos brancos e nulos e de quem não votou, e veja como ficaria a disputa entre {finalistas}. "
                         f"Usa o resultado oficial do 1º turno (TSE). Não é pesquisa nem previsão."),
         "applicationCategory": "ReferenceApplication", "applicationSubCategory": "Eleições",
         "operatingSystem": "Qualquer sistema com navegador (Android, iOS, Windows, macOS, Linux)",
         "browserRequirements": "Requer JavaScript", "inLanguage": "pt-BR", "isAccessibleForFree": True,
         "offers": {"@type": "Offer", "price": "0", "priceCurrency": "BRL"},
         "featureList": [
             f"Distribua entre {finalistas} os votos de cada candidato do 1º turno, dos brancos e nulos e de quem não votou",
             "Resultado na hora, em votos e em percentual dos votos válidos",
             "Compartilhamento da simulação como imagem (WhatsApp, Instagram) ou como link",
             "Ponto de partida no resultado oficial do 1º turno (TSE)",
         ],
         "image": site + "img/compartilhar/simulador.png", "screenshot": site + "img/compartilhar/simulador.png",
         "author": {"@id": site + "#autor"}, "publisher": {"@id": site + "#autor"},
         "datePublished": "2026-10-06", "dateModified": date.today().isoformat(),
         "isBasedOn": {"@type": "CreativeWork", "name": "Resultados oficiais das Eleições 2026", "url": "https://resultados.tse.jus.br/", "publisher": TSE}},
    ]
    corpo = json.dumps({"@context": "https://schema.org", "@graph": grafo}, ensure_ascii=False, indent=1).replace("</", "<\\/")
    return f'<script type="application/ld+json">\n{corpo}\n</script>'


def pagina_simulador(site, t2, index_html, imagem):
    """simulador/index.html: o mesmo app do index.html (com <base href="../">), com título, prévia, Schema e texto próprios."""
    e = lambda x: html.escape(x, quote=True)
    a, b = sorted(t2["presidente"]["cands"], key=lambda c: c["nome"])
    duelo_txt = f"{nome(a['nome'])} × {nome(b['nome'])}"
    titulo = titulo_simulador(t2)
    descricao = (f"Simule o 2º turno 2026 para Presidente: decida para onde vão os votos do 1º turno e veja como ficaria {duelo_txt}. "
                 f"Grátis, com dados oficiais do TSE.")
    og = tags_og(site, site + "simulador/", f"Simulador do 2º turno 2026 · {duelo_txt}",
                 "Para onde vão os votos? Monte o seu cenário do 2º turno com o resultado oficial do 1º turno e compartilhe.",
                 imagem, f"Simulador do 2º turno · {duelo_txt}") + "\n" + schema_simulador(site, t2)
    trocas = [
        (r"<!doctype html>", lambda m: "<!doctype html>\n<!-- Gerado por scripts/paginas.py a partir de index.html: não edite aqui -->"),
        (r'<base href="\./">', lambda m: '<base href="../">'),
        (r"<title>.*?</title>", lambda m: f"<title>{e(titulo)}</title>"),
        (r'<meta name="description" content="[^"]*">', lambda m: f'<meta name="description" content="{e(descricao)}">'),
        (r"(<!-- og:inicio -->\n).*?(\n<!-- og:fim -->)", lambda m: m.group(1) + og + m.group(2)),
        (r'<h1 id="title">.*?</h1>', lambda m: '<h1 id="title">Simulador do 2º turno</h1>'),
        (r'<section class="bloco sim-sobre" id="simSobre" hidden></section>', lambda m: sobre_simulador(t2)),
    ]
    s = index_html
    for padrao, troca in trocas:
        s, n = re.subn(padrao, troca, s, count=1, flags=re.S)
        if not n:
            raise SystemExit(f"Não encontrei {padrao!r} no index.html")
    return s


def pagina(site, pasta, titulo, descricao, destino, imagem, alt):
    url = f"{site}{pasta}/"
    e = lambda s: html.escape(s, quote=True)
    return f"""<!doctype html>
<!-- Gerado por scripts/paginas.py: página de compartilhamento (prévia no WhatsApp) que leva para a tela do site -->
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(titulo)}</title>
<meta name="description" content="{e(descricao)}">
{tags_og(site, url, titulo, descricao, imagem, alt)}
<link rel="icon" type="image/svg+xml" href="../img/favicon.svg">
<meta http-equiv="refresh" content="0; url={e(destino)}">
<script>location.replace({json.dumps(destino)} + location.hash);</script>
</head>
<body style="background:#070b17;color:#eef0f7;font:16px system-ui,sans-serif;padding:24px">
<p>Abrindo o placar… <a href="{e(destino)}" style="color:#e8b84a">Continuar</a></p>
</body>
</html>
"""


def navegador():
    for n in NAVEGADORES:
        caminho = n if Path(n).exists() else shutil.which(n)
        if caminho:
            return caminho
    return None


def gerar_imagem(exe, destino, params):
    modelo = (RAIZ / "scripts" / "imagem-compartilhar.html").as_uri()
    alvo = modelo + ("?" + urllib.parse.urlencode(params) if params else "")
    perfil = RAIZ / "scripts" / ".perfil-navegador"
    subprocess.run([exe, "--headless=old", "--disable-gpu", "--hide-scrollbars", f"--user-data-dir={perfil}", "--virtual-time-budget=5000",
                    "--window-size=1200,630", f"--screenshot={destino}", alvo], capture_output=True, timeout=120)
    shutil.rmtree(perfil, ignore_errors=True)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args or not args[0].startswith("http"):
        raise SystemExit("Informe o endereço do site, ex.: python scripts/paginas.py https://seu-projeto.pages.dev")
    site = args[0].rstrip("/") + "/"
    com_imagens = "--imagens" in sys.argv
    t2 = json.loads((SITE / "dados" / "segundo-turno.json").read_text(encoding="utf-8"))
    pres_longo, pres_curto = duelo(t2["presidente"]["cands"])

    # Página principal: título, descrição, prévia (bloco entre og:inicio e og:fim) e dados estruturados
    idx = SITE / "index.html"
    s = idx.read_text(encoding="utf-8")
    descricao = (f"Simulador gratuito do 2º turno das Eleições 2026: escolha para onde vão os votos e veja como ficaria {pres_curto}. "
                 f"Compare os planos de governo dos candidatos e acompanhe a apuração ao vivo com dados do TSE.")
    bloco = tags_og(site, site, "Simulador do 2º turno 2026 · Placar da Apuração", descricao,
                    "img/compartilhar.png", "Placar da Apuração 2026 · 2º turno em 25 de outubro") + "\n" + schema(site, t2)
    e = lambda x: html.escape(x, quote=True)
    trocas = [(r"(<!-- og:inicio -->\n).*?(\n<!-- og:fim -->)", lambda m: m.group(1) + bloco + m.group(2)),
              (r"<title>.*?</title>", lambda m: f"<title>{e(TITULO)}</title>"),
              (r'<meta name="description" content="[^"]*">', lambda m: f'<meta name="description" content="{e(descricao)}">')]
    for padrao, troca in trocas:
        s, n = re.subn(padrao, troca, s, count=1, flags=re.S)
        if not n:
            raise SystemExit(f"Não encontrei {padrao!r} no index.html")
    idx.write_text(s, encoding="utf-8")

    # Para o Google: o que pode ser rastreado e onde está a página principal
    (SITE / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {site}sitemap.xml\n", encoding="utf-8")
    (SITE / "sitemap.xml").write_text(f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>{e(site)}</loc><lastmod>{date.today().isoformat()}</lastmod></url>
  <url><loc>{e(site)}simulador/</loc><lastmod>{date.today().isoformat()}</lastmod></url>
</urlset>
""", encoding="utf-8")

    paginas = [("presidente", f"Presidente · 2º turno · {pres_curto}",
                f"{pres_longo} no 2º turno de 25 de outubro. Resultado do 1º turno por estado, propostas oficiais dos candidatos e apuração ao vivo com dados do TSE.",
                "../?turno=2&cargo=presidente",
                {"e": "Eleições 2026 · 2º turno · 25 de outubro", "h": "Presidente", "s": pres_curto, "p": "Resultado do 1º turno por estado · propostas oficiais · apuração ao vivo"})]
    for uf, est in UFS.items():
        g = t2["governador"][uf]
        if g["turno2"]:
            longo, curto = duelo(g["cands"])
            paginas.append((uf, f"Governador · {est} · 2º turno · {curto}",
                            f"{longo} no 2º turno de 25 de outubro. Resultado do 1º turno, propostas oficiais e apuração ao vivo. No mesmo dia, {artigo(uf)} também vota para Presidente.",
                            f"../?turno=2&cargo=governador&uf={uf.upper()}",
                            {"e": "Eleições 2026 · 2º turno · 25 de outubro", "h": est, "s": f"Governador: {curto}", "p": "Resultado do 1º turno · propostas oficiais · apuração ao vivo"}))
        else:
            el = g["eleito"]
            paginas.append((uf, f"2º turno {em(uf)} · Presidente · {pres_curto}",
                            f"{artigo(uf, True)} elegeu {nome(el['nome'])} ({el['partido']}) governador(a) no 1º turno. Em 25 de outubro o estado vota para Presidente: {pres_longo}. Resultado do 1º turno no estado e propostas oficiais.",
                            f"../?turno=2&cargo=presidente&uf={uf.upper()}",
                            {"e": "Eleições 2026 · 2º turno · 25 de outubro", "h": est, "s": f"Presidente: {pres_curto}", "p": "Resultado do 1º turno no estado · propostas oficiais · apuração ao vivo"}))

    exe = navegador() if com_imagens else None
    if com_imagens and not exe:
        print("Edge/Chrome não encontrado: as páginas usam a imagem genérica.")
    pasta_img = SITE / "img" / "compartilhar"
    pasta_img.mkdir(exist_ok=True)
    if exe:
        gerar_imagem(exe, SITE / "img" / "compartilhar.png", None)
        gerar_imagem(exe, pasta_img / "simulador.png",
                     {"e": "Eleições 2026 · 2º turno · 25 de outubro", "h": "Simulador do 2º turno",
                      "s": f"{pres_curto}: para onde vão os votos?", "p": "Monte o seu cenário com o resultado oficial do 1º turno e compartilhe"})
    for pasta, titulo, descricao, destino, img in paginas:
        arquivo = pasta_img / f"{pasta}.png"
        if exe:
            gerar_imagem(exe, arquivo, img)
        imagem = f"img/compartilhar/{pasta}.png" if arquivo.exists() else "img/compartilhar.png"
        (SITE / pasta).mkdir(exist_ok=True)
        (SITE / pasta / "index.html").write_text(pagina(site, pasta, titulo, descricao, destino, imagem, f"{img['h']} · {img['s']}"), encoding="utf-8")
        print(f"{site}{pasta}/  ->  {titulo}")
    # Página do simulador, montada a partir do index.html já atualizado
    img_sim = "img/compartilhar/simulador.png" if (pasta_img / "simulador.png").exists() else "img/compartilhar.png"
    (SITE / "simulador").mkdir(exist_ok=True)
    (SITE / "simulador" / "index.html").write_text(pagina_simulador(site, t2, s, img_sim), encoding="utf-8")
    print(f"{site}simulador/  ->  {titulo_simulador(t2)}")

    (SITE / "dados" / "paginas.json").write_text(json.dumps({"site": site, "paginas": [p[0] for p in paginas]}), encoding="utf-8")
    print(f"\n{len(paginas)} páginas geradas. index.html com prévia para {site}")


if __name__ == "__main__":
    main()
