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

Rode de novo sempre que mudar o endereço do site ou o arquivo dados/segundo-turno.json.
"""
import html
import json
import re
import shutil
import subprocess
import sys
import urllib.parse
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

    # Prévia da página principal (bloco entre os marcadores og:inicio e og:fim do index.html)
    idx = SITE / "index.html"
    s = idx.read_text(encoding="utf-8")
    bloco = tags_og(site, site, "2º turno · Eleições 2026 · Placar da Apuração",
                    "Presidente e Governador no 2º turno de 25 de outubro: quem disputa em cada estado, o resultado do 1º turno e as propostas oficiais de cada candidato.",
                    "img/compartilhar.png", "Placar da Apuração 2026 · 2º turno em 25 de outubro")
    novo, n = re.subn(r"(<!-- og:inicio -->\n).*?(\n<!-- og:fim -->)", lambda m: m.group(1) + bloco + m.group(2), s, flags=re.S)
    if not n:
        raise SystemExit("Marcadores <!-- og:inicio --> / <!-- og:fim --> não encontrados no index.html")
    idx.write_text(novo, encoding="utf-8")

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
    for pasta, titulo, descricao, destino, img in paginas:
        arquivo = pasta_img / f"{pasta}.png"
        if exe:
            gerar_imagem(exe, arquivo, img)
        imagem = f"img/compartilhar/{pasta}.png" if arquivo.exists() else "img/compartilhar.png"
        (SITE / pasta).mkdir(exist_ok=True)
        (SITE / pasta / "index.html").write_text(pagina(site, pasta, titulo, descricao, destino, imagem, f"{img['h']} · {img['s']}"), encoding="utf-8")
        print(f"{site}{pasta}/  ->  {titulo}")
    (SITE / "dados" / "paginas.json").write_text(json.dumps({"site": site, "paginas": [p[0] for p in paginas]}), encoding="utf-8")
    print(f"\n{len(paginas)} páginas geradas. index.html com prévia para {site}")


if __name__ == "__main__":
    main()
