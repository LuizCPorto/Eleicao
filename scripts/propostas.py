"""Copia as propostas de governo (PDF) dos finalistas do 2º turno a partir dos dados abertos do TSE.

Todo candidato registra a proposta de governo junto com a candidatura. O TSE publica os PDFs em
pacotes por UF nos dados abertos (cdn.tse.jus.br). Este script baixa só os pacotes necessários
(Brasil e os estados com 2º turno para Governador), extrai os PDFs dos finalistas para a pasta
public/propostas/ e grava public/dados/propostas.json com o tamanho de cada arquivo.

Rode depois de scripts/segundo_turno.py:  python scripts/propostas.py
Só usa a biblioteca padrão do Python.
"""
import io
import json
import urllib.request
import zipfile
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent / "public"   # pasta publicada do site
CDN = "https://cdn.tse.jus.br/estatistica/sead/odsele/proposta_governo/proposta_governo_2026_{uf}.zip"


def baixar(url):
    req = urllib.request.Request(url, headers={"User-Agent": "placar-apuracao/1.0"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read()


def main():
    t2 = json.loads((RAIZ / "dados" / "segundo-turno.json").read_text(encoding="utf-8"))
    pacotes = {"BR": [c["id"] for c in t2["presidente"]["cands"]]}
    for uf, g in t2["governador"].items():
        if g["turno2"]:
            pacotes[uf.upper()] = [c["id"] for c in g["cands"]]

    pasta = RAIZ / "propostas"
    pasta.mkdir(exist_ok=True)
    indice = {}
    for uf, ids in pacotes.items():
        print(f"Baixando pacote {uf}…")
        z = zipfile.ZipFile(io.BytesIO(baixar(CDN.format(uf=uf))))
        for sq in ids:
            # Os arquivos vêm como <UF>/2026<UF><sqcand>_01.pdf (um candidato pode ter mais de um arquivo)
            arquivos = sorted(n for n in z.namelist() if sq in n and n.lower().endswith(".pdf"))
            if not arquivos:
                print(f"  {sq}: sem proposta no pacote")
                continue
            lista = []
            for i, nome in enumerate(arquivos, 1):
                destino = f"{sq}.pdf" if i == 1 else f"{sq}_{i}.pdf"
                dados = z.read(nome)
                (pasta / destino).write_bytes(dados)
                lista.append({"arquivo": f"propostas/{destino}", "bytes": len(dados), "original": nome})
            indice[sq] = lista
            print(f"  {sq}: {len(lista)} arquivo(s)")

    saida = {"gerado": datetime.now().strftime("%d/%m/%Y"), "fonte": "Dados abertos do TSE · proposta_governo_2026", "cands": indice}
    (RAIZ / "dados" / "propostas.json").write_text(json.dumps(saida, ensure_ascii=False, indent=1), encoding="utf-8")
    print("Gravado em dados/propostas.json")


if __name__ == "__main__":
    main()
