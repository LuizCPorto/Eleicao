// Evolução da apuração (Presidente · Brasil): o TSE só publica o placar do momento; o histórico é montado por esta página,
// neste navegador, a cada atualização
import {$, pctFmt, corPartido, svgEl, cabecalho, ler, gravar} from "./util.js";
import {REGIOES} from "./config.js";
import {candidatos, presPorUf} from "./dados.js";

// 1º turno de 2022 por UF: [votos PT (Lula), votos PL (Bolsonaro), votos válidos]. Fonte: TSE, via tabela da Wikipédia.
// Os votos de cada candidato somam exatamente o total oficial (57.259.504 e 51.072.345); os válidos vêm dos percentuais oficiais.
const DADOS_2022 = {
  ac:[129022,275582,440937], al:[974156,621515,1724118], ap:[197382,187621,432199], am:[1019684,880198,2056595],
  ba:[5873081,2047599,8422671], ce:[3578355,1377827,5429052], df:[649534,910397,1762634], es:[897348,1160030,2221071],
  go:[1454723,1920203,3681604], ma:[2603454,983861,3781694], mt:[633748,1102866,1842952], ms:[588323,794206,1507008],
  mg:[5802571,5239264,12016362], pa:[2443730,1884673,4679861], pb:[1554868,717416,2421703], pr:[2363492,3628612,6566689],
  pe:[3558322,1630938,5452049], pi:[1518008,406897,2044509], rj:[3847143,4831246,9456673], rn:[1264179,622731,2007351],
  rs:[2806672,3245023,6637814], ro:[261749,581306,903209], rr:[68760,207587,298366], sc:[1279216,2694406,4330923],
  sp:[10490032,12239989,25654651], se:[828716,378610,1298479], to:[434303,379194,861755], zz:[138933,122548,294527]
};
const FINAL_2022 = {PT:48.43, PL:43.20};   // resultado oficial do 1º turno de 2022 (% dos válidos)
// Parciais reais da apuração do 1º turno de 2022 (TSE, publicadas ao vivo pela Bloomberg Línea em 02/10/2022):
// [% seções totalizadas, PT (Lula) %, PL (Bolsonaro) %, horário]. O ponto de ~93% é aproximado na fonte.
const PARCIAIS_2022 = [
  [0.09,51.18,36.73,"17h06"], [0.88,41.15,48.40,"17h43"], [1.99,41.46,48.41,"18h07"], [8.10,42.64,48.51,"18h31"],
  [13.20,43.23,48.04,"18h42"], [20.26,43.32,47.93,"18h55"], [33.18,43.75,47.45,"19h14"], [44.17,44.32,46.84,"19h32"],
  [60.33,45.20,46.01,"19h53"], [70.00,45.75,45.51,"20h06"], [85.00,46.64,44.73,"20h25"], [93.00,47.46,44.03,"20h47"],
  [95.99,47.75,43.79,"21h16"], [98.21,48.05,43.52,"21h55"], [99.75,48.36,43.25,"23h33"], [100,48.43,43.20,"final"]
];
const COL_2022 = {PT:1, PL:2};
// Valor de 2022 em qualquer % apurado, interpolando entre as parciais vizinhas
function interp2022(p){
  const P = PARCIAIS_2022;
  if (p <= P[0][0]) return {PT:P[0][1], PL:P[0][2]};
  for (let i = 1; i < P.length; i++) if (p <= P[i][0]){
    const a = P[i-1], b = P[i], t = (p-a[0])/(b[0]-a[0]);
    return {PT:a[1]+(b[1]-a[1])*t, PL:a[2]+(b[2]-a[2])*t};
  }
  return {PT:FINAL_2022.PT, PL:FINAL_2022.PL};
}
// Ponto em que Lula passou Bolsonaro em 2022 (a partir da 2ª parcial; a 1ª tinha só 0,09% e oscilou)
const VIRADA_2022 = (() => {
  const P = PARCIAIS_2022;
  for (let i = 2; i < P.length; i++){
    const d0 = P[i-1][1]-P[i-1][2], d1 = P[i][1]-P[i][2];
    if (d0 < 0 && d1 >= 0) return P[i-1][0] + (P[i][0]-P[i-1][0]) * (-d0/(d1-d0));
  }
  return null;
})();
const NOME_2022 = {PT:"Lula", PL:"Bolsonaro"};
// Um histórico por turno: [{p: % seções apuradas, t: horário, v: {sqcand: % válidos}}]
const histKey = turno => turno===1 ? "hist-pres-2026" : "hist-pres-2026-t2";
const hists = {1: ler(histKey(1), []), 2: ler(histKey(2), [])};
let hist = hists[1];
export function registrarHistorico(d, turno){
  if (!d.vv) return;
  let h = hists[turno];
  const ultimo = h[h.length-1];
  if (ultimo && d.pst <= ultimo.p) return;
  h.push({p:+d.pst.toFixed(2), t:Date.now(), v:Object.fromEntries(d.cands.slice(0,6).map(c=>[c.id, +c.pct.toFixed(2)]))});
  if (h.length > 1500) h = hists[turno] = h.filter((_,i) => i%2===0 || i===h.length-1);
  gravar(histKey(turno), h);
}

// Estimativa simples: em cada UF, os votos de cada candidato são escalados do eleitorado já apurado para o eleitorado total
function calcularEstimativa(js, ids){
  const porUf = new Map();
  let teTotal = 0, base = 0, teCom = 0;
  const est = Object.fromEntries(ids.map(id=>[id,0]));
  for (const [uf, j] of js){
    const e=j.e||{}, v=j.v||{}, s=j.s||{};
    const te=+e.te||0, apur=+e.est||0, vv=+v.vv||0;
    const cands = candidatos(j);
    const votos = Object.fromEntries(ids.map(id => [id, (cands.find(c=>c.id===id)||{}).votos||0]));
    porUf.set(uf, {te, vv, st:+s.st||0, ts:+s.ts||0, votos});
    teTotal += te;
    if (apur>0 && vv>0){
      const fator = te/apur;
      base += vv*fator; teCom += te;
      for (const id of ids) est[id] += votos[id]*fator;
    }
  }
  const grupos = Object.entries(REGIOES).filter(([k])=>k!=="todas").map(([,r])=>({nome:r.nome, ufs:r.ufs})).concat([{nome:"Exterior", ufs:["zz"]}]);
  const regioes = grupos.map(g => {
    let st=0, ts=0, te=0, vv=0; const vt = Object.fromEntries(ids.map(id=>[id,0]));
    for (const uf of g.ufs){ const u = porUf.get(uf); if (!u) continue; st+=u.st; ts+=u.ts; te+=u.te; vv+=u.vv; for (const id of ids) vt[id]+=u.votos[id]; }
    return {nome:g.nome, ufs:g.ufs, apurado: ts ? st/ts*100 : 0, peso: teTotal ? te/teTotal*100 : 0,
            pct: Object.fromEntries(ids.map(id => [id, vv ? vt[id]/vv*100 : null]))};
  });
  return {estimativa: Object.fromEntries(ids.map(id => [id, base ? est[id]/base*100 : null])),
          cobertura: teTotal ? teCom/teTotal*100 : 0, regioes};
}

// 2022 no mesmo % de seções apuradas (parciais reais) + resultado final por região
function calcular2022(pst){
  const regiao = ufs => { let a=0, b=0, v=0; for (const uf of ufs){ const d = DADOS_2022[uf]; a+=d[0]; b+=d[1]; v+=d[2]; } return {PT:a/v*100, PL:b/v*100}; };
  return {agora: interp2022(pst), final: FINAL_2022, regiao};
}
const partido2022 = sg => { const p = (sg||"").toUpperCase(); return p==="PT" || p==="PL" ? p : null; };

const SUPERFICIE = "#121a2f";   // cor do cartão, usada no anel dos pontos
let graf = null, evSeq = 0;

export function atualizarEvolucao(d, turno){
  const seq = ++evSeq;
  hist = hists[turno];
  const top = d.cands.slice(0, 2);
  if (top.length < 2){ $("evolucao").hidden = true; return; }
  $("evolucao").hidden = false;
  const series = top.map(c => ({id:c.id, nome:c.nome, cor:corPartido(c.partido), atual:c.pct, p22:partido2022(c.partido),
    pts: hist.filter(h => h.v[c.id]!=null).map(h => [h.p, h.v[c.id], h.t])}));
  const mesmo = graf && graf.ids===top.map(c=>c.id).join();
  // O comparativo com 2022 usa as parciais do 1º turno de 2022: só vale no 1º turno
  graf = {series, est:(mesmo && graf.est) || {}, r22: turno===1 ? calcular2022(d.pst) : null, ids:top.map(c=>c.id).join(), pst:d.pst, turno};
  preencher2022(series, graf.est, graf.r22, d.pst);
  $("evSub").textContent = `${top[0].nome} × ${top[1].nome} · % dos votos válidos por % de seções apuradas`;

  // Legenda (sempre presente): linha cheia = registrado, tracejada = estimativa
  const leg = $("evLegenda"); leg.innerHTML = "";
  for (const s of series){
    const sp = document.createElement("span");
    const k = document.createElement("i"); k.className = "chave"; k.style.background = s.cor;
    sp.append(k, s.nome); leg.appendChild(sp);
  }
  const tr = document.createElement("span"); const k = document.createElement("i"); k.className = "chave trac";
  tr.append(k, "estimativa até 100%"); leg.appendChild(tr);
  const ref = document.createElement("span"); const k2 = document.createElement("i"); k2.className = "chave"; k2.style.background = "var(--on-bg-muted)"; k2.style.height = "1px";
  ref.append(k2, turno===1 ? "50%: vence no 1º turno" : "50%: maioria dos válidos"); leg.appendChild(ref);
  if (graf.r22 && series.some(s => s.p22)){
    const l22 = document.createElement("span"); const k3 = document.createElement("i"); k3.className = "chave pont";
    k3.className = "chave fantasma";
    l22.append(k3, "2022, mesmo partido (parciais reais do TSE)"); leg.appendChild(l22);
  }

  const pctTxt = v => v==null ? "—" : pctFmt(v)+"%";
  const resumoBase = `Com <b>${pctFmt(d.pst)}%</b> das seções apuradas, `;
  const nomes = series.map(s => s.nome);
  $("evResumo").textContent = "";
  $("evResumo").innerHTML = resumoBase;
  $("evResumo").append(`${nomes[0]} tem ${pctTxt(series[0].atual)} e ${nomes[1]}, ${pctTxt(series[1].atual)}. Calculando a estimativa por estado…`);
  desenharGrafico();
  preencherTabelaHistorico();

  presPorUf(turno).then(js => {
    if (seq !== evSeq) return;
    const r = calcularEstimativa(js, series.map(s=>s.id));
    graf.est = r.estimativa;
    desenharGrafico();
    preencher2022(series, r.estimativa, graf.r22, d.pst);
    $("evResumo").innerHTML = resumoBase;
    const e0 = r.estimativa[series[0].id], e1 = r.estimativa[series[1].id];
    $("evResumo").append(`${nomes[0]} tem ${pctTxt(series[0].atual)} e ${nomes[1]}, ${pctTxt(series[1].atual)}. Se cada estado mantiver a proporção de votos que tem agora, o resultado final ficaria perto de ${nomes[0]} ${pctTxt(e0)} e ${nomes[1]} ${pctTxt(e1)}.`);
    const primeiro = hist.find(h => series.some(s => h.v[s.id]!=null));
    $("evNota").textContent =
      (primeiro ? `As linhas cheias são o que esta página registrou neste navegador, a partir de ${pctFmt(primeiro.p)}% apurado (o TSE não publica o histórico). ` : "") +
      `O tracejado é uma estimativa simples: em cada estado, os votos são escalados do eleitorado já apurado para o eleitorado total` +
      (r.cobertura < 99.5 ? ` (estados sem nenhuma seção apurada, ${pctFmt(100-r.cobertura)}% do eleitorado, ficam de fora)` : "") +
      `. Não é pesquisa nem projeção oficial.`;
    preencherRegioes(r.regioes, series, graf.r22);
  }).catch(() => {
    if (seq !== evSeq) return;
    $("evNota").textContent = "Não consegui buscar os estados agora para calcular a estimativa. Tento de novo na próxima atualização.";
  });
}

export function desenharGrafico(){
  const box = $("graf");
  if (!graf || $("evolucao").hidden) return;
  box.innerHTML = "";
  const {series, est} = graf;
  const W = Math.max(300, box.clientWidth || 700), estreito = W < 560, H = estreito ? 240 : 300;
  const m = {l:40, r: estreito ? 104 : 150, t:16, b:42};
  const vals = [50];
  const r22 = graf.r22;
  for (const s of series){
    for (const p of s.pts) vals.push(p[1]);
    vals.push(s.atual); if (est[s.id]!=null) vals.push(est[s.id]);
    if (r22 && s.p22) for (const q of PARCIAIS_2022) vals.push(q[COL_2022[s.p22]]);
  }
  const lo = Math.max(0, Math.floor((Math.min(...vals)-2)/5)*5), hi = Math.min(100, Math.ceil((Math.max(...vals)+2)/5)*5);
  const passo = hi-lo > 40 ? 10 : 5;
  const X = p => m.l + p/100*(W-m.l-m.r), Y = v => m.t + (hi-v)/(hi-lo)*(H-m.t-m.b);

  const svg = svgEl("svg", {viewBox:`0 0 ${W} ${H}`, width:W, height:H, tabindex:"0", role:"img",
    "aria-label":`Gráfico: ${series.map(s=>`${s.nome} ${pctFmt(s.atual)}%`).join(", ")} com ${pctFmt(graf.pst)}% apurado. Use as setas para percorrer os pontos.`}, box);

  // Grade e eixos (recessivos)
  for (let v = lo; v <= hi; v += passo){
    svgEl("line", {x1:m.l, x2:W-m.r, y1:Y(v), y2:Y(v), style:"stroke:var(--line);stroke-width:1"}, svg);
    svgEl("text", {x:m.l-6, y:Y(v)+4, "text-anchor":"end"}, svg).textContent = v+"%";
  }
  for (const p of [0,25,50,75,100]){
    svgEl("text", {x:X(p), y:H-m.b+18, "text-anchor": p===0?"start":p===100?"end":"middle"}, svg).textContent = p+"%";
  }
  svgEl("text", {x:(m.l+X(100))/2, y:H-4, "text-anchor":"middle"}, svg).textContent = "seções apuradas →";

  // Linha de referência: 50% dos válidos
  // (o significado da linha fica na legenda, para não colidir com as séries)
  if (lo < 50 && hi > 50)
    svgEl("line", {x1:m.l, x2:X(100), y1:Y(50), y2:Y(50), style:"stroke:var(--on-bg-muted);stroke-width:1;opacity:.9"}, svg);

  // 2022 (mesmo partido): curva real das parciais, fina e apagada, atrás das linhas de 2026
  if (r22 && series.some(s => s.p22)){
    if (VIRADA_2022 != null){
      const xv = X(VIRADA_2022);
      svgEl("line", {x1:xv, x2:xv, y1:m.t, y2:H-m.b, style:"stroke:var(--muted);stroke-width:1", "stroke-dasharray":"2 3", opacity:.7}, svg);
      svgEl("text", {x:xv-4, y:m.t+10, "text-anchor":"end", class:"rotulo-meio"}, svg).textContent = `virada em 2022 (~${Math.round(VIRADA_2022)}%)`;
    }
    for (const s of series){
      if (!s.p22) continue;
      const c = COL_2022[s.p22];
      svgEl("path", {d: PARCIAIS_2022.map((q,i) => `${i?"L":"M"}${X(q[0]).toFixed(1)},${Y(q[c]).toFixed(1)}`).join(""), fill:"none",
        stroke:s.cor, "stroke-width":1.5, "stroke-linejoin":"round", opacity:.38}, svg);
      for (const q of PARCIAIS_2022) svgEl("circle", {cx:X(q[0]), cy:Y(q[c]), r:2, fill:s.cor, opacity:.45}, svg);
    }
  }

  // Séries: linha registrada, ponto atual e tracejado até a estimativa
  const rotulos = [];
  for (const s of series){
    const pts = s.pts.length ? s.pts : [[graf.pst, s.atual]];
    if (pts.length > 1)
      svgEl("path", {d: pts.map((p,i) => `${i?"L":"M"}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(""), fill:"none",
        stroke:s.cor, "stroke-width":2, "stroke-linejoin":"round", "stroke-linecap":"round"}, svg);
    const ult = pts[pts.length-1];
    const e = est[s.id];
    if (e != null && ult[0] < 100){
      svgEl("line", {x1:X(ult[0]), y1:Y(ult[1]), x2:X(100), y2:Y(e), stroke:s.cor, "stroke-width":2, "stroke-dasharray":"5 5", "stroke-linecap":"round", opacity:.75}, svg);
      svgEl("circle", {cx:X(100), cy:Y(e), r:4, fill:SUPERFICIE, stroke:s.cor, "stroke-width":2}, svg);
    }
    svgEl("circle", {cx:X(ult[0]), cy:Y(ult[1]), r:5, fill:s.cor, stroke:SUPERFICIE, "stroke-width":2}, svg);
    rotulos.push({s, y: Y(e!=null ? e : ult[1]), valor: e!=null ? `estim. ${pctFmt(e)}%` : `${pctFmt(ult[1])}%`});
  }
  // Rótulos diretos na margem direita; se ficarem próximos, afasta e liga com uma linha fina
  rotulos.sort((a,b) => a.y-b.y);
  const GAP = 32;
  for (let i = 1; i < rotulos.length; i++) rotulos[i].ly = Math.max(rotulos[i].y, (rotulos[i-1].ly ?? rotulos[i-1].y) + GAP);
  rotulos[0].ly = rotulos[0].y;
  if (rotulos.length > 1 && rotulos[1].ly > H-m.b-14){ const sobe = rotulos[1].ly-(H-m.b-14); rotulos.forEach(r => r.ly -= sobe); }
  const xl = X(100) + 12;
  for (const r of rotulos){
    if (Math.abs(r.ly - r.y) > 2) svgEl("line", {x1:X(100)+5, y1:r.y, x2:xl-3, y2:r.ly, style:"stroke:var(--muted);stroke-width:1"}, svg);
    let nome = r.s.nome; if (estreito && nome.length > 12) nome = nome.split(" ").slice(-1)[0];
    svgEl("text", {x:xl, y:r.ly-2, class:"rotulo-nome"}, svg).textContent = nome;
    svgEl("text", {x:xl, y:r.ly+12, class:"rotulo-meio"}, svg).textContent = r.valor;
  }

  // Camada de leitura: linha vertical que segue o ponteiro + dica com todas as séries
  const pontos = [...new Set(series.flatMap(s => s.pts.map(p => p[0])))].sort((a,b)=>a-b);
  if (!pontos.length) return;
  const mira = svgEl("line", {y1:m.t, y2:H-m.b, style:"stroke:var(--muted);stroke-width:1", visibility:"hidden"}, svg);
  const area = svgEl("rect", {x:m.l, y:m.t, width:X(100)-m.l, height:H-m.t-m.b, fill:"transparent"}, svg);
  const tip = $("grafTip");
  let idx = pontos.length-1;
  const mostrar = i => {
    idx = Math.max(0, Math.min(pontos.length-1, i));
    const p = pontos[idx], x = X(p);
    mira.setAttribute("x1", x); mira.setAttribute("x2", x); mira.setAttribute("visibility","visible");
    tip.innerHTML = "";
    const t = document.createElement("div"); t.className = "tt";
    const h = series[0].pts.find(q => q[0]===p) || series[1].pts.find(q => q[0]===p);
    t.textContent = `${pctFmt(p)}% apurado${h && h[2] ? " · "+new Date(h[2]).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : ""}`;
    tip.appendChild(t);
    for (const s of series){
      const q = s.pts.find(q => q[0]===p); if (!q) continue;
      const l = document.createElement("div"); l.className = "lin";
      const k = document.createElement("i"); k.className = "chave"; k.style.background = s.cor;
      const b = document.createElement("b"); b.textContent = pctFmt(q[1])+"%";
      const n = document.createElement("span"); n.textContent = s.nome;
      l.append(k, b, n); tip.appendChild(l);
    }
    // Como estava 2022 neste mesmo % apurado
    if (graf.r22 && series.some(s => s.p22)){
      const v = interp2022(p);
      const l = document.createElement("div"); l.className = "tt";
      l.textContent = "2022 neste ponto: " + series.filter(s => s.p22).map(s => `${s.p22} ${pctFmt(v[s.p22])}%`).join(" · ");
      tip.appendChild(l);
    }
    tip.hidden = false;
    const larg = tip.offsetWidth, escala = box.clientWidth / W;
    tip.style.left = Math.min(Math.max(0, x*escala + 12), box.clientWidth - larg) + "px";
    tip.style.top = (m.t*escala) + "px";
  };
  const esconder = () => { mira.setAttribute("visibility","hidden"); tip.hidden = true; };
  area.addEventListener("pointermove", ev => {
    const r = svg.getBoundingClientRect();
    const p = ((ev.clientX - r.left) * (W / r.width) - m.l) / (X(100)-m.l) * 100;
    let melhor = 0; for (let i = 1; i < pontos.length; i++) if (Math.abs(pontos[i]-p) < Math.abs(pontos[melhor]-p)) melhor = i;
    mostrar(melhor);
  });
  area.addEventListener("pointerleave", esconder);
  svg.addEventListener("focus", () => mostrar(idx));
  svg.addEventListener("blur", esconder);
  svg.addEventListener("keydown", ev => {
    if (ev.key==="ArrowLeft"){ mostrar(idx-1); ev.preventDefault(); }
    if (ev.key==="ArrowRight"){ mostrar(idx+1); ev.preventDefault(); }
  });
}

function preencherTabelaHistorico(){
  const t = $("evTabela"); t.innerHTML = "";
  const {series} = graf;
  cabecalho(t, [{txt:"Seções apuradas"}, {txt:"Horário"}, ...series.map(s => ({txt:s.nome, cor:s.cor}))]);
  const tb = document.createElement("tbody");
  for (const h of [...hist].reverse()){
    if (!series.some(s => h.v[s.id]!=null)) continue;
    const tr = document.createElement("tr");
    const cel = [pctFmt(h.p)+"%", new Date(h.t).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}), ...series.map(s => h.v[s.id]!=null ? pctFmt(h.v[s.id])+"%" : "—")];
    for (const c of cel){ const td = document.createElement("td"); td.textContent = c; tr.appendChild(td); }
    tb.appendChild(tr);
  }
  t.appendChild(tb);
}

function preencherRegioes(regioes, series, r22){
  const t = $("evRegioes"); t.innerHTML = "";
  const com22 = r22 ? series.filter(s => s.p22) : [];
  cabecalho(t, [{txt:"Região"}, {txt:"Apurado"}, {txt:"Peso no eleitorado"}, ...series.map(s => ({txt:s.nome, cor:s.cor})),
                ...com22.map(s => ({txt:`${s.p22} em 2022`, cor:s.cor}))]);
  const tb = document.createElement("tbody");
  for (const r of regioes){
    const tr = document.createElement("tr");
    const vals = series.map(s => r.pct[s.id]);
    const max = Math.max(...vals.map(v => v ?? -1));
    const v22 = com22.length ? r22.regiao(r.ufs) : {};
    const max22 = Math.max(...com22.map(s => v22[s.p22]));
    const cel = [[r.nome], [pctFmt(r.apurado)+"%"], [pctFmt(r.peso)+"%"], ...vals.map(v => [v==null ? "—" : pctFmt(v)+"%", v!=null && v===max && max>0]),
                 ...com22.map(s => [pctFmt(v22[s.p22])+"%", v22[s.p22]===max22])];
    for (const [txt, lider] of cel){ const td = document.createElement("td"); td.textContent = txt; if (lider) td.className = "lider"; tr.appendChild(td); }
    tb.appendChild(tr);
  }
  t.appendChild(tb);
}

// Texto e tabela "Comparativo com 2022 (mesmos partidos)"
function preencher2022(series, est, r22, pst){
  const box = $("ev2022");
  const com22 = series.filter(s => s.p22);
  if (!r22 || !r22.agora || !com22.length){ box.hidden = true; return; }
  box.hidden = false;
  const pp = v => (v>0?"+":v<0?"−":"") + pctFmt(Math.abs(v)).replace(/,00$/,"") + " p.p.";
  const pctTxt = v => v==null ? "—" : pctFmt(v)+"%";

  // Frase em português simples
  const partes = com22.map(s => `${s.p22} (${NOME_2022[s.p22]}) ${pctFmt(r22.agora[s.p22])}%`);
  let txt = `Em 2022, com ${pctFmt(pst)}% das seções apuradas, o placar era ${partes.join(" × ")}. No fim, terminou ${com22.map(s => `${s.p22} ${pctFmt(r22.final[s.p22])}%`).join(" × ")}.`;
  if (com22.length === 2){
    const [a, b] = com22;
    const liderAgora = r22.agora[a.p22] >= r22.agora[b.p22] ? a.p22 : b.p22;
    const liderFinal = r22.final[a.p22] >= r22.final[b.p22] ? a.p22 : b.p22;
    if (liderAgora !== liderFinal) txt += ` Ou seja, em 2022 quem estava na frente neste ponto da apuração terminou em segundo.`;
    if (VIRADA_2022 != null) txt += ` Naquela apuração, depois da primeira parcial (só 0,09% das seções), Bolsonaro ficou na frente e Lula só passou por volta de ${Math.round(VIRADA_2022)}% das seções apuradas (a parcial das 20h06, com 70%, já mostrava Lula na frente).`;
  }
  $("ev2022Txt").textContent = txt;

  const t = $("ev2022Tab"); t.innerHTML = "";
  cabecalho(t, [{txt:"Partido"}, {txt:"2022 neste ponto"}, {txt:"2022 final"}, {txt:"Mudou até o fim"}, {txt:"2026 agora"}, {txt:"2026 estimativa"}]);
  const tb = document.createElement("tbody");
  for (const s of com22){
    const tr = document.createElement("tr");
    const td0 = document.createElement("td");
    const k = document.createElement("i"); k.className = "chave"; k.style.background = s.cor; k.style.marginRight = "6px"; k.style.verticalAlign = "middle";
    td0.append(k, `${s.p22} · ${NOME_2022[s.p22]} (2022) / ${s.nome} (2026)`);
    tr.appendChild(td0);
    for (const c of [pctTxt(r22.agora[s.p22]), pctTxt(r22.final[s.p22]), pp(r22.final[s.p22]-r22.agora[s.p22]), pctTxt(s.atual), pctTxt(est[s.id])]){
      const td = document.createElement("td"); td.textContent = c; tr.appendChild(td);
    }
    tb.appendChild(tr);
  }
  t.appendChild(tb);
}

let resizeTimer = null;
window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(desenharGrafico, 150); });
