"""Gera public/dados/urnas-1t/: os votos do 1º turno, seção por seção, dos dois finalistas de cada disputa do 2º turno.

O site usa esses arquivos para comparar o 2º turno com o 1º "nas mesmas urnas": soma o 1º turno só das seções
que o TSE já apurou no 2º turno (lista de urnas do TSE em arquivo-urna/<pleito>/config/<uf>/<uf>-p<pleito>-cs.json).

Fonte: dados abertos do TSE, votação por seção (cdn.tse.jus.br/estatistica/sead/odsele/votacao_secao/):
votacao_secao_2026_BR.zip para Presidente e votacao_secao_2026_<UF>.zip para Governador. Os zips são grandes
(cerca de 160 MB o de Presidente) e ficam fora do projeto, numa pasta temporária, para não irem para o repositório.

Saída: um arquivo por cargo e estado, ex. urnas-1t/pres-sp.json e urnas-1t/gov-rj.json, no formato
  {"cands": [id do 1º finalista, id do 2º], "secoes": {"<município>": {"<zona>": {"<seção>": [votos 1º, votos 2º, válidos]}}}}
Os códigos de município, zona e seção vão sem zeros à esquerda (o site faz o mesmo com os da lista de urnas).

Uso (na raiz do projeto):  python scripts/mesmas_urnas.py [pasta_dos_zips]
Rode depois de scripts/segundo_turno.py (usa os finalistas de public/dados/segundo-turno.json).
Só usa a biblioteca padrão do Python.
"""
import csv
import io
import json
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "public" / "dados" / "urnas-1t"
FONTE = "https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_secao/votacao_secao_2026_{}.zip"
RESULTADO = "https://resultados.tse.jus.br/oficial/ele2026/{ele}/dados/{uf}/{uf}-c000{cd}-e00{ele}-u.json"
CARGOS = {"1": "pres", "3": "gov"}
ELEICAO = {"1": "6257", "3": "6259"}   # 1º turno: federal (Presidente) e estadual


def validos(cargo, uf):
    """Números cujos votos são válidos e o total de válidos, segundo o resultado do TSE. Fica de fora quem teve
    o registro anulado depois da eleição: no CSV o voto continua com o número, mas o TSE passa a contar como nulo."""
    url = RESULTADO.format(ele=ELEICAO[cargo], uf=uf, cd=cargo)
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "placar-apuracao/1.0"}), timeout=30) as r:
        j = json.load(r)
    nums = {c["n"] for carg in j["carg"] for agr in carg["agr"] for par in agr["par"] for c in par["cand"]
            if c.get("dvt", "").startswith("Válido")}
    return nums, int(j["v"]["vv"])


def zip_de(pasta, nome):
    """Baixa o zip do TSE se ainda não estiver na pasta."""
    destino = pasta / f"votacao_secao_2026_{nome}.zip"
    if not destino.exists():
        print(f"Baixando {destino.name}…")
        req = urllib.request.Request(FONTE.format(nome), headers={"User-Agent": "placar-apuracao/1.0"})
        with urllib.request.urlopen(req, timeout=60) as r, open(destino.with_suffix(".part"), "wb") as f:
            while bloco := r.read(1 << 20):
                f.write(bloco)
        destino.with_suffix(".part").rename(destino)
    return destino


def ler(zip_path, cargo, numeros, por_uf, nums_validos):
    """Soma os votos do 1º turno por seção. numeros: {uf: [nº do 1º finalista, nº do 2º]}.
    Devolve {uf: {mun: {zona: {secao: [a, b, validos]}}}}."""
    out = {uf: {} for uf in numeros}
    with zipfile.ZipFile(zip_path) as z:
        nome = next(n for n in z.namelist() if n.lower().endswith(".csv"))
        with z.open(nome) as bruto:
            linhas = csv.reader(io.TextIOWrapper(bruto, encoding="latin-1", newline=""), delimiter=";")
            cab = next(linhas)
            i = {k: cab.index(k) for k in ("NR_TURNO", "SG_UF", "CD_MUNICIPIO", "NR_ZONA", "NR_SECAO", "CD_CARGO", "NR_VOTAVEL", "QT_VOTOS")}
            for row in linhas:
                if row[i["CD_CARGO"]] != cargo or row[i["NR_TURNO"]] != "1":
                    continue
                uf = row[i["SG_UF"]].lower() if por_uf else next(iter(numeros))
                if uf not in numeros:
                    continue
                sec = (out[uf].setdefault(str(int(row[i["CD_MUNICIPIO"]])), {})
                              .setdefault(str(int(row[i["NR_ZONA"]])), {})
                              .setdefault(str(int(row[i["NR_SECAO"]])), [0, 0, 0]))
                nr, votos = row[i["NR_VOTAVEL"]], int(row[i["QT_VOTOS"]])
                if nr not in nums_validos:   # branco (95), nulo (96), anulado (97) ou candidato com registro anulado
                    continue
                sec[2] += votos
                if nr == numeros[uf][0]:
                    sec[0] += votos
                elif nr == numeros[uf][1]:
                    sec[1] += votos
    return out


def somas(secoes):
    """[votos do 1º finalista, do 2º, válidos] somados em todas as seções."""
    return [sum(s[k] for z in secoes.values() for zz in z.values() for s in zz.values()) for k in (0, 1, 2)]


def gravar(cargo, uf, cands, secoes, esperado):
    """esperado: [votos do 1º finalista, do 2º, válidos] segundo o TSE, para conferir (None: não confere)."""
    arq = SAIDA / f"{CARGOS[cargo]}-{uf}.json"
    arq.write_text(json.dumps({"cands": [c["id"] for c in cands], "secoes": secoes}, separators=(",", ":")), encoding="utf-8")
    soma = somas(secoes)
    n = sum(len(zz) for z in secoes.values() for zz in z.values())
    confere = "" if esperado is None else ("  confere com o TSE" if soma == esperado else f"  ATENÇÃO: TSE tem {esperado}")
    print(f"  {arq.name}: {n} seções, {arq.stat().st_size // 1024} KB, votos e válidos {soma}{confere}")


def main():
    pasta = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.gettempdir()) / "votacao_secao_2026"
    pasta.mkdir(parents=True, exist_ok=True)
    SAIDA.mkdir(parents=True, exist_ok=True)
    t2 = json.loads((RAIZ / "public" / "dados" / "segundo-turno.json").read_text(encoding="utf-8"))

    # Presidente: um zip nacional, separado por UF (inclui o exterior, zz)
    pres = t2["presidente"]["cands"]
    ufs = list(t2["presidente"]["porUf"].keys() - {"br"})
    print("Presidente")
    nums, vv = validos("1", "br")
    dados = ler(zip_de(pasta, "BR"), "1", {uf: [c["n"] for c in pres] for uf in ufs}, True, nums)
    for uf in sorted(ufs):
        gravar("1", uf, pres, dados[uf], None)
    total = [sum(x) for x in zip(*(somas(d) for d in dados.values()))]
    esperado = [c["votos"] for c in pres] + [vv]
    print(f"  Brasil: votos e válidos {total}" + ("  confere com o TSE" if total == esperado else f"  ATENÇÃO: TSE tem {esperado}"))

    # Governador: um zip por estado com 2º turno
    print("Governador")
    for uf, g in sorted(t2["governador"].items()):
        if not g.get("turno2"):
            continue
        cands = g["cands"]
        nums, vv = validos("3", uf)
        dados = ler(zip_de(pasta, uf.upper()), "3", {uf: [c["n"] for c in cands]}, False, nums)
        gravar("3", uf, cands, dados[uf], [c["votos"] for c in cands] + [vv])


if __name__ == "__main__":
    main()
