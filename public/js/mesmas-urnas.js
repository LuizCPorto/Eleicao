// 2º turno comparado com o 1º "nas mesmas urnas": soma o 1º turno só nas seções que o TSE já apurou no 2º turno.
// Seções apuradas: lista de urnas do TSE (arquivo-urna/<pleito>/config/<uf>/<uf>-p<pleito>-cs.json), em que cada seção
// ganha data e hora ("da", "ha") quando é apurada. Votos do 1º turno por seção: dados/urnas-1t/ (scripts/mesmas_urnas.py).
// Só baixa com o quadro aberto: em Presidente · Brasil são as listas dos 27 estados e do exterior (alguns MB).
import {BASE, PLEITOS, REGIOES, UFS} from "./config.js";
import {$, el, fmt, pctFmt, hora, corPartido, cabecalho} from "./util.js";
import {getJson, local} from "./dados.js";

const P = PLEITOS[2];
const urlLista = uf => `${BASE}/arquivo-urna/${P}/config/${uf}/${uf}-p${P.padStart(6, "0")}-cs.json`;

function ufsDe(cargo, uf, reg){
  if (cargo === "gov") return [uf];
  if (uf === "br") return UFS.map(u => u[0]).filter(u => u !== "br");
  if (uf === "reg") return REGIOES[reg].ufs;
  return [uf];
}

// "25/10/2026" + "18:42:07" -> "20261025184207", para achar a lista mais antiga
const chaveHora = (d, h) => d.split("/").reverse().join("") + h.replace(/:/g, "");

async function somarT1(cargo, ufs){
  const partes = await Promise.all(ufs.map(uf => Promise.all([getJson(urlLista(uf)), local(`urnas-1t/${cargo}-${uf}`)])));
  const r = {secoes:0, semT1:0, validos:0, votos:{}, lista:null, cache:null};
  for (const id of partes[0][1].cands) r.votos[id] = 0;
  for (const [lista, t1] of partes){
    const [a, b] = t1.cands;
    if (lista.dg && lista.hg){ const k = chaveHora(lista.dg, lista.hg); if (!r.lista || k < r.lista.k) r.lista = {k, hg:lista.hg}; }
    if (lista.__cache) r.cache = Math.min(r.cache ?? Infinity, lista.__cache);
    for (const abr of lista.abr || []) for (const mu of abr.mu || []){
      const m = t1.secoes[+mu.cd] || {};
      for (const z of mu.zon || []){
        const zona = m[+z.cd] || {};
        for (const s of z.sec || []){
          if (!s.da) continue;   // ainda não apurada no 2º turno
          r.secoes++;
          // Seções agregadas (nsa) votam na mesma urna. No 1º turno os votos delas já estão na seção principal;
          // se alguma teve urna própria no 1º turno e foi agregada só agora, os votos dela entram também.
          const vs = [s.ns, ...(s.nsa || [])].map(n => zona[+n]).filter(Boolean);
          if (!vs.length){ r.semT1++; continue; }
          for (const v of vs){ r.votos[a] += v[0]; r.votos[b] += v[1]; r.validos += v[2]; }
        }
      }
    }
  }
  return r;
}

/* ---------- Quadro ---------- */
let atual = null, conta = null, emCurso = null;   // atual: disputa na tela; conta: última soma {k, t, r}; emCurso: soma baixando
const chave = a => a.cargo + "|" + a.uf + "|" + a.reg;
// Sinal só quando o número arredondado não é zero (evita "+0,00")
const sinal = (n, f, casas = 0) => { const r = Math.round(n * 10**casas) / 10**casas; return (r > 0 ? "+" : r < 0 ? "−" : "") + f(Math.abs(r)); };
const secoes = n => `${fmt(n)} ${n === 1 ? "seção" : "seções"}`;

export function esconderMesmas(){ atual = null; $("mesmas").hidden = true; }

// d = placar do 2º turno na tela; cands = os dois finalistas
export function atualizarMesmas(cargo, uf, reg, d, cands){
  atual = {cargo, uf, reg, d, cands, ufs:ufsDe(cargo, uf, reg)};
  $("mesmas").hidden = false;
  $("mesmasPeso").textContent = atual.ufs.length > 1 ? " · baixa alguns MB" : "";
  if ($("mesmas").open) calcular();
}

$("mesmas").addEventListener("toggle", () => { if ($("mesmas").open && atual) calcular(); });

async function calcular(){
  const a = atual, k = chave(a);
  // A lista do TSE fica 45 s em cache; com vários estados (alguns MB), confere a cada 2 minutos
  const intervalo = a.ufs.length > 1 ? 120000 : 60000;
  if (conta && conta.k === k && Date.now() - conta.t < intervalo) return desenhar(conta.r, a);
  if (emCurso === k) return;
  if (!conta || conta.k !== k) $("mesmasCorpo").replaceChildren(el("p", "ev-nota", "Somando o 1º turno nas seções já apuradas…"));
  emCurso = k;
  try {
    const r = await somarT1(a.cargo, a.ufs);
    conta = {k, t:Date.now(), r};
    if (atual && chave(atual) === k) desenhar(r, atual);
  } catch (err){
    if (atual && chave(atual) === k) $("mesmasCorpo").replaceChildren(el("p", "ev-nota", err.status === 404
      ? "O TSE ainda não publicou a lista de urnas do 2º turno."
      : "Não consegui baixar a lista de urnas do TSE agora. Tento de novo na próxima atualização."));
  } finally { if (emCurso === k) emCurso = null; }
}

function desenhar(r, {d, cands}){
  const corpo = $("mesmasCorpo");
  corpo.replaceChildren();
  if (!r.secoes){
    corpo.appendChild(el("p", "ev-nota", "A lista de urnas do TSE ainda não tem seções apuradas no 2º turno. Ela costuma chegar alguns minutos depois do placar."));
    return;
  }
  const ordem = [...cands].sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR"));
  const p1 = c => r.validos ? r.votos[c.id] / r.validos * 100 : 0;
  const v2 = c => d.cands.find(x => x.id === c.id) || {votos:0, pct:0};

  const t = el("table", "ev-tabela");
  cabecalho(t, [{txt:""}, ...ordem.map(c => ({txt:c.nome, cor:corPartido(c.partido)}))]);
  const tb = el("tbody");
  const linha = (rotulo, celula) => {
    const tr = el("tr");
    tr.appendChild(el("td", null, rotulo));
    for (const c of ordem){ const [p, v] = celula(c); const td = el("td"); td.append(el("b", null, p), el("small", null, v)); tr.appendChild(td); }
    tb.appendChild(tr);
  };
  linha("1º turno, nestas seções", c => [pctFmt(p1(c)) + "%", fmt(r.votos[c.id]) + " votos"]);
  linha("2º turno, agora", c => [pctFmt(v2(c).pct) + "%", fmt(v2(c).votos) + " votos"]);
  linha("Diferença", c => [sinal(v2(c).pct - p1(c), pctFmt, 2) + " pontos", sinal(v2(c).votos - r.votos[c.id], fmt) + " votos"]);
  t.appendChild(tb);
  const wrap = el("div", "tabela-wrap"); wrap.appendChild(t);

  const resumo = el("p", "ev-resumo");
  const quando = r.lista ? ` (lista de urnas do TSE das ${r.lista.hg.slice(0, 5).replace(":", "h")})` : "";
  resumo.append("Votos do 1º turno somados nas ", el("b", null, secoes(r.secoes - r.semT1)), ` que o TSE já apurou no 2º turno${quando}.`);
  const notas = ["No 1º turno o percentual é sobre os votos válidos de todos os candidatos nessas seções; no 2º turno, só sobre os dois."];
  // Placar e lista de urnas são atualizados em momentos diferentes. No fim do 1º turno sobraram 41 seções do exterior
  // fora da lista (0,008% do Brasil), por isso o aviso só aparece acima de 0,1%.
  if (Math.abs(d.st - r.secoes) > d.st * 0.001)
    notas.push(`O placar do 2º turno soma ${secoes(d.st)} e a lista de urnas do TSE, ${secoes(r.secoes)}: as duas são atualizadas em momentos diferentes, então a comparação ainda não cobre exatamente as mesmas seções.`);
  if (r.semT1) notas.push(r.semT1 === 1 ? "1 seção apurada no 2º turno não existia no 1º e ficou fora da soma."
                                         : `${fmt(r.semT1)} seções apuradas no 2º turno não existiam no 1º e ficaram fora da soma.`);
  if (r.cache) notas.push(`O TSE não respondeu agora: lista de urnas salva neste navegador às ${hora(r.cache)}.`);
  corpo.append(wrap, resumo, ...notas.map(n => el("p", "ev-nota", n)));
}
