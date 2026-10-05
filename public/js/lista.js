// Lista de candidatos da disputa escolhida
import {$, el, fmt, pctFmt, corPartido, fotoUrl, semFoto, ler, gravar, avisar, reduzMovimento} from "./util.js";
import {POR_PAGINA, REGIOES, TURNOS} from "./config.js";
import {state, ui} from "./estado.js";
import {ehFav, toggleFav} from "./favoritos.js";
import {togglePatrimonio, abrirPatrimonio} from "./patrimonio.js";

let prevVotes = {};      // key -> {sqcand: votos}
export const ocultos = new Set(ler("ocultos", []));
export const salvarOcultos = () => gravar("ocultos", [...ocultos]);

function tagDe(c){
  if (c.eleito) return {txt: /eleito/i.test(c.st) ? c.st : "Eleito", sec:false};
  if (/2º turno/i.test(c.st)) return {txt:c.st, sec:false};
  if (/suplente/i.test(c.st)) return {txt:c.st, sec:true};
  return null;
}

// Uma linha de candidato. t1 = % no 1º turno (só no 2º turno), semVotos = antes de a apuração começar
function linha(c, {rank, max, delta, t1, semVotos, podeOcultar}){
  const fav = ehFav(c.id);
  const li = el("li", "c" + (rank===1 && !semVotos ? " lider" : "") + (semVotos ? " sem-rank" : ""));
  li.dataset.id = c.id;
  const pct = semVotos ? "" : `<div class="p">${pctFmt(c.pct)}%</div><div class="v">${fmt(c.votos)} votos${delta>0?` <span class="delta">+${fmt(delta)}</span>`:""}</div>`;
  li.innerHTML = `
    <div class="rank">${semVotos ? "" : rank}</div><img class="foto" alt="" loading="lazy">
    <button class="who" aria-expanded="false"><span class="name"></span><span class="party"></span><span class="hint">Ver patrimônio declarado</span></button>
    <div class="num">${pct}${t1!=null ? `<div class="t1">no 1º turno: <b>${pctFmt(t1)}%</b></div>` : ""}
      <div class="acoes"><button class="acao fav" aria-pressed="${fav}">${fav?"★ Favorito":"☆ Favoritar"}</button>${podeOcultar ? `<button class="acao ocultar">Ocultar</button>` : ""}</div></div>
    <div class="bar${semVotos ? " t1" : ""}"><span style="width:${((semVotos ? t1 : c.pct)/max*100).toFixed(2)}%;background:${corPartido(c.partido)}"></span></div>`;
  li.querySelector(".name").textContent = c.nome;
  const foto = li.querySelector(".foto");
  foto.src = fotoUrl(state.cargo, state.uf, c.id); foto.alt = `Foto de ${c.nome}`; semFoto(foto);
  const tag = tagDe(c);
  if (tag){ const t = el("span", "tag"+(tag.sec?" sec":""), tag.txt); li.querySelector(".name").appendChild(t); }
  const party = li.querySelector(".party");
  const sg = el("b", null, c.partido); sg.style.color = corPartido(c.partido);
  party.append(`${c.n} · `, sg, c.coligacao ? ` · ${c.coligacao}` : "");
  li.querySelector(".who").onclick = () => togglePatrimonio(li, c);
  li.querySelector(".fav").onclick = () => toggleFav(c);
  const oc = li.querySelector(".ocultar");
  if (oc) oc.onclick = () => { ocultos.add(c.id); salvarOcultos(); if (ui.openId===c.id) ui.openId=null; avisar("rerender"); };
  if (ui.openId === c.id) queueMicrotask(() => abrirPatrimonio(li, c));
  return li;
}

// d = disputa normalizada; t1 = {sqcand: % no 1º turno} quando é 2º turno
export function render(d, t1){
  ui.lastData = d;
  const key = state.turno+"|"+state.cargo+"|"+state.reg+"|"+state.uf;
  const list = d.cands;
  $("pst").firstChild.nodeValue = pctFmt(d.pst)+"%";
  $("track").style.width = d.pst+"%";
  $("vv").textContent = fmt(d.vv);
  $("vb").textContent = pctFmt(d.pvb)+"%";
  $("vn").textContent = pctFmt(d.pvn)+"%";
  $("abs").textContent = pctFmt(d.pabs)+"%";
  const tot = d.dt ? `Totalizado em ${d.dt} às ${d.ht}` : "Totalização ainda não iniciada";
  const soma = d.nEstados ? ` · soma de ${d.nEstados} estados` : "";
  $("meta").innerHTML = `${tot}<br>${fmt(d.st)} de ${fmt(d.ts)} seções${soma}`;

  const prev = prevVotes[key] || {};
  const now = {};
  for (const c of list) now[c.id] = c.votos;
  prevVotes[key] = now;

  // Candidato vindo da busca: garante que ele apareça (mesmo se estava oculto ou além da página atual)
  if (ui.destaque){
    if (ocultos.delete(ui.destaque)) salvarOcultos();
    const i = list.findIndex(c => c.id === ui.destaque);
    if (i >= state.limite) state.limite = Math.ceil((i+1)/POR_PAGINA)*POR_PAGINA;
  }
  const naoOcultos = list.filter(c => !ocultos.has(c.id));
  const mostrar = naoOcultos.slice(0, state.limite);
  const max = Math.max(...naoOcultos.map(c=>c.pct), 1);
  const posicao = new Map(list.map((c,i)=>[c.id,i+1]));
  const podeOcultar = state.turno === 1;

  const ol = $("list"); ol.innerHTML = "";
  for (const c of mostrar){
    ol.appendChild(linha(c, {rank:posicao.get(c.id), max, delta: prev[c.id]!=null ? c.votos - prev[c.id] : 0,
      t1: t1 ? t1[c.id] : null, podeOcultar}));
  }
  destacar(ol);

  // Rodapé da lista: "mostrar mais" e candidatos ocultos
  const foot = $("listFoot"); foot.innerHTML = "";
  if (naoOcultos.length > mostrar.length){
    const b = el("button", "btn", `Mostrar mais (${fmt(naoOcultos.length - mostrar.length)} restantes)`);
    b.onclick = () => { state.limite += POR_PAGINA; avisar("rerender"); };
    foot.appendChild(b);
  }
  const nOcultos = list.length - naoOcultos.length;
  if (nOcultos){
    const s = el("span", null, nOcultos===1 ? "1 candidato oculto nesta lista" : `${nOcultos} candidatos ocultos nesta lista`);
    const b = el("button", "btn", "Mostrar ocultos");
    b.onclick = () => { for (const c of list) ocultos.delete(c.id); salvarOcultos(); avisar("rerender"); };
    foot.append(s, b);
  }

  $("verdict").textContent = state.turno === 2 ? veredito2(d) : veredito1(d);
}

// Antes de a apuração do 2º turno começar: os dois finalistas em ordem alfabética, com o resultado do 1º turno
export function renderFinalistas(cands, t1){
  ui.lastData = null;
  const ol = $("list"); ol.innerHTML = "";
  const ordem = [...cands].sort((a,b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const max = Math.max(...ordem.map(c => t1[c.id] || 0), 1);
  for (const c of ordem) ol.appendChild(linha(c, {semVotos:true, max, t1:t1[c.id], podeOcultar:false}));
  destacar(ol);
  $("listFoot").innerHTML = "";
  $("verdict").textContent = `Candidatos em ordem alfabética. A apuração do 2º turno começa depois das 17h de ${TURNOS[2].data} (horário de Brasília); a barra mostra o resultado do 1º turno.`;
}

function destacar(ol){
  if (!ui.destaque) return;
  const alvo = ol.querySelector(`li[data-id="${CSS.escape(ui.destaque)}"]`);
  ui.destaque = null;
  if (alvo){ alvo.classList.add("destaque"); alvo.scrollIntoView({block:"center", behavior: reduzMovimento() ? "auto" : "smooth"}); }
}

// Mensagem sobre a disputa no 1º turno
function veredito1(d){
  const list = d.cands, lider = list[0];
  if (state.cargo==="fed" || state.cargo==="est")
    return `Eleição proporcional${d.vagas?`: ${d.vagas} vagas`:""}. As cadeiras são divididas entre partidos e federações pelo quociente eleitoral, então nem sempre os mais votados são eleitos.`;
  if (state.cargo==="sen") return "Senado 2026: duas vagas por estado, os dois mais votados são eleitos.";
  if (!lider || !d.vv) return "";
  if (state.cargo==="pres" && state.uf!=="br"){
    const onde = state.uf==="zz" ? "Votos de brasileiros no exterior" : state.uf==="reg" ? `Soma dos estados da região ${REGIOES[state.reg].nome}` : `Votos neste estado`;
    return `${onde}, já incluídos no total do Brasil. Aqui, ${lider.nome} teve ${pctFmt(lider.pct)}% dos válidos. O resultado nacional está em "Brasil".`;
  }
  if (list.some(c=>c.turno2)){
    const vao = list.filter(c=>c.turno2).map(c=>c.nome);
    return `${d.fim ? "Apuração encerrada: haverá" : "Definido:"} 2º turno em ${TURNOS[2].data} entre ${vao.join(" e ")}.`;
  }
  if (d.fim) return list.some(c=>c.eleito) ? `${list.find(c=>c.eleito).nome} eleito(a) em 1º turno.` : `Apuração encerrada.`;
  if (d.pst >= 100 && lider.pct <= 50 && list[1]) return `Todas as seções apuradas e ninguém passou de 50% dos válidos: ${lider.nome} e ${list[1].nome} disputam o 2º turno em ${TURNOS[2].data}.`;
  if (lider.pct>50) return `${lider.nome} tem mais de 50% dos votos válidos até agora: venceria no 1º turno se o placar se mantiver.`;
  return `Ninguém passa de 50% dos válidos até agora: pelo placar atual, ${lider.nome} e ${list[1]?list[1].nome:"o segundo colocado"} iriam ao 2º turno em ${TURNOS[2].data}.`;
}

// Mensagem sobre a disputa no 2º turno
function veredito2(d){
  const [a, b] = d.cands;
  if (!a || !d.vv) return "Apuração do 2º turno ainda sem votos totalizados.";
  if (state.cargo==="pres" && state.uf!=="br"){
    const onde = state.uf==="zz" ? "Votos de brasileiros no exterior" : state.uf==="reg" ? `Soma dos estados da região ${REGIOES[state.reg].nome}` : `Votos neste estado`;
    return `${onde}, já incluídos no total do Brasil. Aqui, ${a.nome} tem ${pctFmt(a.pct)}% dos válidos. O resultado nacional está em "Brasil".`;
  }
  if (a.eleito || d.fim) return `${(d.cands.find(c=>c.eleito)||a).nome} eleito(a) no 2º turno.`;
  return `Vence quem tiver mais votos válidos. Com ${pctFmt(d.pst)}% das seções apuradas, ${a.nome} está ${pctFmt(a.pct - (b?b.pct:0))} pontos à frente${b?` de ${b.nome}`:""}.`;
}
