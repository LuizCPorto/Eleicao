"""Gera public/dados/segundo-turno.json a partir do resultado do 1º turno publicado pelo TSE.

O arquivo diz quem disputa o 2º turno (Presidente e Governador), com o percentual de cada um
no 1º turno, e quem já foi eleito no 1º turno. O site usa esse arquivo na tela do 2º turno
antes de o TSE publicar os dados da nova votação, e para mostrar "no 1º turno: X%".
Também guarda o resultado nacional completo de Presidente (todos os candidatos, brancos, nulos
e abstenção), ponto de partida do simulador do 2º turno.

Uso (na raiz do projeto):  python scripts/segundo_turno.py
Só usa a biblioteca padrão do Python.
"""
import json
import urllib.request
from datetime import datetime
from pathlib import Path

BASE = "https://resultados.tse.jus.br/oficial/ele2026"
ELE_PRES, ELE_EST = "6257", "6259"   # códigos do 1º turno (2º turno: 6258 e 6260)
UFS = "ac al ap am ba ce df es go ma mt ms mg pa pb pr pe pi rj rn rs ro rr sc sp se to".split()
SAIDA = Path(__file__).resolve().parent.parent / "public" / "dados" / "segundo-turno.json"


def baixar(url):
    req = urllib.request.Request(url, headers={"User-Agent": "placar-apuracao/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def num(s):
    return float(str(s or "0").replace(",", "."))


def candidatos(j):
    out = []
    for cargo in j.get("carg", []):
        for agr in cargo.get("agr", []):
            for par in agr.get("par", []):
                for c in par.get("cand", []):
                    out.append({
                        "id": c["sqcand"], "nome": c.get("nmu") or c["nm"], "n": c["n"], "partido": par["sg"],
                        "votos": int(c.get("vap") or 0), "pct": num(c.get("pvap")), "st": c.get("st") or "",
                    })
    return sorted(out, key=lambda c: (-c["votos"], c["nome"]))


def enxuto(c):
    return {k: c[k] for k in ("id", "nome", "n", "partido", "votos", "pct")}


def situacao(j):
    """Devolve ("2t", [dois finalistas]) ou ("eleito", candidato)."""
    cands = candidatos(j)
    finalistas = [c for c in cands if "2º turno" in c["st"]]
    if len(finalistas) == 2:
        return "2t", finalistas
    eleito = next((c for c in cands if c["st"].lower().startswith("eleito")), None)
    if eleito:
        return "eleito", eleito
    # O TSE ainda não marcou a situação (aconteceu com Presidente na manhã seguinte ao 1º turno):
    # sem ninguém acima de 50% dos válidos, os dois mais votados vão ao 2º turno
    if cands and cands[0]["pct"] > 50:
        return "eleito", cands[0]
    return "2t", cands[:2]


def main():
    pres_br = baixar(f"{BASE}/{ELE_PRES}/dados/br/br-c0001-e00{ELE_PRES}-u.json")
    sit, pres = situacao(pres_br)
    if sit != "2t":
        raise SystemExit("Presidente decidido no 1º turno: este script supõe 2º turno para Presidente.")
    ids = [c["id"] for c in pres]

    # Percentual de cada finalista em cada UF (e no exterior), para comparar com o 2º turno estado a estado
    por_uf = {}
    for uf in UFS + ["zz"]:
        cs = {c["id"]: c["pct"] for c in candidatos(baixar(f"{BASE}/{ELE_PRES}/dados/{uf}/{uf}-c0001-e00{ELE_PRES}-u.json"))}
        por_uf[uf] = {i: cs.get(i, 0) for i in ids}
    por_uf["br"] = {c["id"]: c["pct"] for c in pres}

    # Resultado nacional completo do 1º turno, para o simulador
    v, e = pres_br["v"], pres_br["e"]
    t1 = {
        "eleitores": int(e["te"]), "comparecimento": int(e["c"]), "abstencao": int(e["a"]),
        "validos": int(v["vv"]), "brancos": int(v["vb"]), "nulos": int(v["tvn"]),
        "cands": [enxuto(c) for c in candidatos(pres_br)],
    }

    gov = {}
    for uf in UFS:
        j = baixar(f"{BASE}/{ELE_EST}/dados/{uf}/{uf}-c0003-e00{ELE_EST}-u.json")
        sit, quem = situacao(j)
        gov[uf] = {"turno2": True, "cands": [enxuto(c) for c in quem]} if sit == "2t" else {"turno2": False, "eleito": enxuto(quem)}
        print(uf, "2º turno" if sit == "2t" else "eleito no 1º turno")

    saida = {
        "gerado": datetime.now().strftime("%d/%m/%Y %H:%M"),
        "fonte": "Resultado do 1º turno (TSE, resultados.tse.jus.br)",
        "presidente": {"cands": [enxuto(c) for c in pres], "porUf": por_uf, "t1": t1},
        "governador": gov,
    }
    SAIDA.write_text(json.dumps(saida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    n = sum(1 for g in gov.values() if g["turno2"])
    print(f"\nPresidente: {pres[0]['nome']} x {pres[1]['nome']} · Governador: 2º turno em {n} estados")
    print(f"Gravado em {SAIDA}")


if __name__ == "__main__":
    main()
