// 2º turno comparado com o 1º "nas mesmas urnas": só nos municípios que o TSE já apurou 100% no 2º turno.
// Por que município: a lista de urnas do TSE (arquivo-urna/…-cs.json) sai em lotes e, na noite do 2º turno, ficou cerca de
// 2 horas atrás do placar. Já o progresso por município (<uf>-e<eleição>-ab.json) sai junto com o placar. Num município
// 100% apurado as urnas são as mesmas nos dois turnos (conferido: mesmas 517.179 seções e mesmas agregações).
// 2º turno: resultado oficial de cada município pronto (guardado na memória, não muda mais); estado 100% apurado usa o
// arquivo do estado. 1º turno: soma das seções do município em dados/urnas-1t/ (scripts/mesmas_urnas.py).
// Só baixa com o quadro aberto: em Presidente · Brasil, um arquivo pequeno por município pronto (alguns MB no total).
import {BASE, ELEICOES, CARGOS, REGIOES, UFS, TIMEOUT_MS} from "./config.js";
import {$, el, fmt, pctFmt, corPartido, cabecalho} from "./util.js";
import {ErroTSE, disputa, normalizar, local} from "./dados.js";

const ele2 = cargo => ELEICOES[2][CARGOS[cargo].grupo];
const urlProgresso = (cargo, uf) => `${BASE}/${ele2(cargo)}/dados/${uf}/${uf}-e00${ele2(cargo)}-ab.json`;
const urlMun = (cargo, uf, mu) => `${BASE}/${ele2(cargo)}/dados/${uf}/${uf}${mu}-c${CARGOS[cargo].cd}-e00${ele2(cargo)}-u.json`;

function ufsDe(cargo, uf, reg){
  if (cargo === "gov") return [uf];
  if (uf === "br") return UFS.map(u => u[0]).filter(u => u !== "br");
  if (uf === "reg") return REGIOES[reg].ufs;
  return [uf];
}

// Sem guardar no navegador (são milhares de arquivos pequenos; lotariam o espaço do "último dado salvo")
async function baixar(u){
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(u, {cache:"no-cache", signal:ctl.signal});
    if (!r.ok) throw new ErroTSE("HTTP " + r.status, r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

// Roda fn em cada item, no máximo n de cada vez
async function emLotes(itens, n, fn){
  const fila = [...itens];
  await Promise.all(Array.from({length:Math.min(n, fila.length)}, async () => { while (fila.length) await fn(fila.shift()); }));
}

// 1º turno por município: {município: [votos 1º finalista, votos 2º, válidos]}, somado uma vez por arquivo
const t1Cache = new Map();
function t1PorMun(cargo, uf){
  const k = cargo + "-" + uf;
  if (!t1Cache.has(k)) t1Cache.set(k, local(`urnas-1t/${k}`).then(j => {
    const por = {};
    for (const [mu, zonas] of Object.entries(j.secoes)){
      const s = por[mu] = [0, 0, 0];
      for (const secs of Object.values(zonas)) for (const v of Object.values(secs)){ s[0] += v[0]; s[1] += v[1]; s[2] += v[2]; }
    }
    return {cands:j.cands, por};
  }).catch(err => { t1Cache.delete(k); throw err; }));
  return t1Cache.get(k);
}

// Resultado do 2º turno de um município já 100% apurado: {votos:{id: n}, vv}
const prontos = new Map();
const resumo = d => ({votos:Object.fromEntries(d.cands.map(c => [c.id, c.votos])), vv:d.vv});

async function somarT1T2(cargo, ufs, aviso){
  const partes = await Promise.all(ufs.map(uf => Promise.all([baixar(urlProgresso(cargo, uf)), t1PorMun(cargo, uf)]).then(([ab, t1]) => ({uf, ab, t1}))));
  const r = {mun:0, secoes:0, apuradas:0, semT1:0, falhas:0, cands:partes[0].t1.cands, t1:{}, t2:{}, vv1:0, vv2:0, hora:null};
  for (const id of r.cands){ r.t1[id] = 0; r.t2[id] = 0; }
  // Município fora de dados/urnas-1t/ teve zero voto no 1º turno: a soma das seções confere com o total oficial
  // (no exterior há cidades com 1 seção e ninguém votando)
  const somaT1 = (t1, mu) => {
    const v = t1.por[+mu];
    if (v){ r.t1[t1.cands[0]] += v[0]; r.t1[t1.cands[1]] += v[1]; r.vv1 += v[2]; }
  };
  const somaT2 = x => { for (const id of r.cands) r.t2[id] += x.votos[id] || 0; r.vv2 += x.vv; };

  const faltam = [];   // municípios prontos que ainda não estão na memória
  const usar = [];     // [parte, município do progresso]
  for (const p of partes){
    const mus = (p.ab.abr || []).filter(a => a.tpabr === "mun"), est = (p.ab.abr || []).find(a => a.tpabr === "uf");
    r.apuradas += mus.reduce((s, a) => s + (+a.s.st || 0), 0);
    if (p.ab.hg && (!r.hora || p.ab.hg < r.hora)) r.hora = p.ab.hg;
    // Estado inteiro apurado: um arquivo só (se falhar, segue pelos municípios)
    if (est && +est.s.ts > 0 && est.s.st === est.s.ts){
      const d = await disputa(cargo, p.uf, 2).catch(() => null);
      if (d && !d.cache && d.st === d.ts){
        somaT2(resumo(d));
        for (const a of mus){ somaT1(p.t1, a.cdabr); r.mun++; r.secoes += +a.s.ts; }
        continue;
      }
    }
    for (const a of mus){
      if (!(+a.s.ts > 0 && a.s.st === a.s.ts)) continue;
      usar.push([p, a]);
      if (!prontos.has(urlMun(cargo, p.uf, a.cdabr))) faltam.push(urlMun(cargo, p.uf, a.cdabr));
    }
  }
  if (faltam.length > 30) aviso(`Baixando o resultado de ${fmt(faltam.length)} municípios já apurados…`);
  await emLotes(faltam, 12, async u => {
    try { const d = normalizar(await baixar(u)); if (d.st === d.ts) prontos.set(u, resumo(d)); } catch {}
  });
  for (const [p, a] of usar){
    const x = prontos.get(urlMun(cargo, p.uf, a.cdabr));
    if (!x){ r.falhas++; continue; }
    if (!p.t1.por[+a.cdabr] && x.vv > 0){ r.semT1++; continue; }   // votos no 2º turno sem 1º turno: fica fora dos dois lados
    somaT1(p.t1, a.cdabr); somaT2(x); r.mun++; r.secoes += +a.s.ts;
  }
  return r;
}

/* ---------- Quadro ---------- */
let atual = null, conta = null, emCurso = null;   // atual: disputa na tela; conta: última soma {k, t, r}; emCurso: soma baixando
const chave = a => a.cargo + "|" + a.uf + "|" + a.reg;
// Sinal só quando o número arredondado não é zero (evita "+0,00")
const sinal = (n, f, casas = 0) => { const r = Math.round(n * 10**casas) / 10**casas; return (r > 0 ? "+" : r < 0 ? "−" : "") + f(Math.abs(r)); };
const plural = (n, um, varios) => `${fmt(n)} ${n === 1 ? um : varios}`;

export function esconderMesmas(){ atual = null; $("mesmas").hidden = true; }

// Chamado a cada atualização da disputa do 2º turno; cands = os dois finalistas
export function atualizarMesmas(cargo, uf, reg, cands){
  atual = {cargo, uf, reg, cands, ufs:ufsDe(cargo, uf, reg)};
  $("mesmas").hidden = false;
  $("mesmasPeso").textContent = atual.ufs.length > 1 ? " · baixa alguns MB" : "";
  if ($("mesmas").open) calcular();
}

$("mesmas").addEventListener("toggle", () => { if ($("mesmas").open && atual) calcular(); });

async function calcular(){
  const a = atual, k = chave(a);
  // O progresso por município muda a cada atualização do placar; com vários estados, confere a cada minuto
  const intervalo = a.ufs.length > 1 ? 60000 : 25000;
  if (conta && conta.k === k && Date.now() - conta.t < intervalo) return desenhar(conta.r, a);
  if (emCurso === k) return;
  const aviso = txt => { if (atual && chave(atual) === k && (!conta || conta.k !== k)) $("mesmasCorpo").replaceChildren(el("p", "ev-nota", txt)); };
  aviso("Somando o 1º turno nos municípios já apurados…");
  emCurso = k;
  try {
    const r = await somarT1T2(a.cargo, a.ufs, aviso);
    conta = {k, t:Date.now(), r};
    if (atual && chave(atual) === k) desenhar(r, atual);
  } catch (err){
    if (atual && chave(atual) === k) $("mesmasCorpo").replaceChildren(el("p", "ev-nota", "Não consegui baixar o andamento da apuração por município agora. Tento de novo na próxima atualização."));
  } finally { if (emCurso === k) emCurso = null; }
}

function desenhar(r, {cands}){
  const corpo = $("mesmasCorpo");
  corpo.replaceChildren();
  if (!r.mun){
    corpo.appendChild(el("p", "ev-nota", `Nenhum município terminou de apurar ainda (${plural(r.apuradas, "seção apurada", "seções apuradas")} até agora). A comparação começa quando o primeiro chegar a 100%.`));
    return;
  }
  const ordem = [...cands].sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR"));
  const p1 = c => r.vv1 ? r.t1[c.id] / r.vv1 * 100 : 0;
  const p2 = c => r.vv2 ? r.t2[c.id] / r.vv2 * 100 : 0;

  const t = el("table", "ev-tabela");
  cabecalho(t, [{txt:""}, ...ordem.map(c => ({txt:c.nome, cor:corPartido(c.partido)}))]);
  const tb = el("tbody");
  const linha = (rotulo, celula) => {
    const tr = el("tr");
    tr.appendChild(el("td", null, rotulo));
    for (const c of ordem){ const [p, v] = celula(c); const td = el("td"); td.append(el("b", null, p), el("small", null, v)); tr.appendChild(td); }
    tb.appendChild(tr);
  };
  linha("1º turno, nestas urnas", c => [pctFmt(p1(c)) + "%", fmt(r.t1[c.id]) + " votos"]);
  linha("2º turno, nestas urnas", c => [pctFmt(p2(c)) + "%", fmt(r.t2[c.id]) + " votos"]);
  linha("Diferença", c => [sinal(p2(c) - p1(c), pctFmt, 2) + " pontos", sinal(r.t2[c.id] - r.t1[c.id], fmt) + " votos"]);
  t.appendChild(tb);
  const wrap = el("div", "tabela-wrap"); wrap.appendChild(t);

  const resumo = el("p", "ev-resumo");
  const fatia = r.apuradas ? ` (${pctFmt(r.secoes / r.apuradas * 100)}% das ${fmt(r.apuradas)} seções apuradas até agora)` : "";
  const quando = r.hora ? `, andamento do TSE das ${r.hora.slice(0, 5).replace(":", "h")}` : "";
  resumo.append("Comparação nos ", el("b", null, plural(r.mun, "município", "municípios")), " que o TSE já apurou 100% no 2º turno: ",
    el("b", null, plural(r.secoes, "seção", "seções")), `${fatia}${quando}.`);
  const notas = [
    "Municípios ainda em apuração ficam de fora até terminar, porque o TSE não diz quais seções deles já entraram. Por isso os votos aqui são menos que os do placar acima.",
    "No 1º turno o percentual é sobre os votos válidos de todos os candidatos nessas urnas; no 2º turno, só sobre os dois."
  ];
  if (r.semT1) notas.push(`${plural(r.semT1, "município pronto não tem", "municípios prontos não têm")} dados do 1º turno mas ${r.semT1 === 1 ? "tem" : "têm"} votos no 2º, e ${r.semT1 === 1 ? "ficou" : "ficaram"} fora da comparação.`);
  if (r.falhas) notas.push(`${plural(r.falhas, "município pronto não respondeu", "municípios prontos não responderam")} agora e ${r.falhas === 1 ? "entra" : "entram"} na próxima atualização.`);
  corpo.append(wrap, resumo, ...notas.map(n => el("p", "ev-nota", n)));
}
