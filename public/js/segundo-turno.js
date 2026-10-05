// 2º turno: visão geral, duelos, estados decididos no 1º turno e propostas de governo.
// Regra de neutralidade: os dois candidatos de cada disputa aparecem sempre do mesmo jeito, em ordem alfabética,
// com os mesmos campos; antes da apuração, ninguém aparece como "líder".
import {$, el, fmt, pctFmt, mb, corPartido, fotoUrl, semFoto, bandeira, ufNome, cabecalho, avisar} from "./util.js";
import {TURNOS, CAND_SITE} from "./config.js";
import {local} from "./dados.js";
import {desenharMapaGov2T} from "./mapa.js";

export const segundoTurno = () => local("segundo-turno");
const alfabetica = cands => [...cands].sort((a,b) => a.nome.localeCompare(b.nome, "pt-BR"));

// Finalistas de uma disputa no 2º turno (null se a disputa foi decidida no 1º turno)
export function finalistas(t2, cargo, uf){
  if (cargo === "pres") return t2.presidente.cands;
  const g = t2.governador[uf];
  return g && g.turno2 ? g.cands : null;
}

// % de cada finalista no 1º turno, para mostrar "no 1º turno: X%"
export function pctT1(t2, cargo, uf){
  if (cargo === "pres") return uf === "reg" ? null : t2.presidente.porUf[uf] || null;
  const g = t2.governador[uf];
  return g && g.turno2 ? Object.fromEntries(g.cands.map(c => [c.id, c.pct])) : null;
}

export const ufsGov2T = t2 => Object.keys(t2.governador).filter(uf => t2.governador[uf].turno2);

/* ---------- Visão geral ---------- */
// vivos: {"pres|br": disputa do 2º turno, "gov|rj": …} quando a apuração já começou
export function renderGeral(t2, vivos = {}){
  const box = $("geral");
  box.querySelectorAll(".bloco").forEach(b => b.remove());
  const ufs = ufsGov2T(t2);

  // Presidente
  const pres = el("section", "bloco");
  pres.innerHTML = `<div class="bloco-top"><h2>Presidente</h2><span>Brasil · candidatos em ordem alfabética</span></div>`;
  pres.appendChild(duelo("pres", "br", t2.presidente.cands, vivos["pres|br"], true));
  const ver = el("button", "btn btn-destaque", "Ver disputa, mapa por estado e propostas →");
  ver.onclick = () => avisar("navegar", {cargo:"pres", uf:"br"});
  pres.appendChild(ver);
  box.appendChild(pres);

  // Governador: mapa + duelos por estado + decididos no 1º turno
  const gov = el("section", "bloco");
  const decididos = Object.keys(t2.governador).filter(uf => !t2.governador[uf].turno2).sort((a,b) => ufNome(a).localeCompare(ufNome(b)));
  gov.innerHTML = `<div class="bloco-top"><h2>Governador</h2><span>2º turno em ${ufs.length} estados · ${decididos.length} decididos no 1º turno</span></div>
    <div class="mapa-wrap mapa-gov"><div class="mapa-svg" id="mapaGov"></div><div class="graf-tip" id="mapaGovTip" hidden></div></div>
    <div class="ev-legenda"><span><i class="quad com2t"></i>Tem 2º turno</span><span><i class="quad"></i>Decidido no 1º turno</span><span>Toque em um estado para ver a disputa.</span></div>`;
  const grade = el("div", "duelos-grid");
  for (const uf of [...ufs].sort((a,b) => ufNome(a).localeCompare(ufNome(b)))){
    const card = el("article", "mini");
    const top = el("div", "card-top");
    top.append(bandeira(uf, ""), el("h3", null, ufNome(uf)));
    card.appendChild(top);
    card.appendChild(duelo("gov", uf, t2.governador[uf].cands, vivos["gov|"+uf], false));
    const b = el("button", "acao", "Ver disputa e propostas →");
    b.onclick = () => avisar("navegar", {cargo:"gov", uf});
    card.appendChild(b);
    grade.appendChild(card);
  }
  gov.appendChild(grade);

  const det = el("details", "decididos");
  det.innerHTML = `<summary>Eleitos no 1º turno (${decididos.length} estados)</summary><div class="tabela-wrap"><table class="ev-tabela"></table></div>`;
  const t = det.querySelector("table");
  cabecalho(t, [{txt:"Estado"}, {txt:"Governador(a) eleito(a)"}, {txt:"Partido"}, {txt:"Votos válidos"}]);
  const tb = el("tbody");
  for (const uf of decididos){
    const e = t2.governador[uf].eleito, tr = el("tr");
    for (const c of [ufNome(uf), e.nome, e.partido, pctFmt(e.pct)+"%"]) tr.appendChild(el("td", null, c));
    tb.appendChild(tr);
  }
  t.appendChild(tb);
  gov.appendChild(det);
  box.appendChild(gov);

  desenharMapaGov2T($("mapaGov"), $("mapaGovTip"), t2, uf => avisar("navegar", {cargo:"gov", uf}));
}

// Dois candidatos lado a lado. Com apuração em andamento mostra o % do 2º turno; antes, só o do 1º turno.
function duelo(cargo, uf, cands, vivo, grande){
  const wrap = el("div", "duelo" + (grande ? " grande" : ""));
  const temVotos = vivo && vivo.vv > 0;
  const lider = temVotos ? vivo.cands[0].id : null;
  alfabetica(cands).forEach((c, i) => {
    if (i === 1) wrap.appendChild(el("div", "x", "×"));
    const v = temVotos ? vivo.cands.find(x => x.id === c.id) : null;
    const lado = el("div", "lado" + (lider === c.id ? " lider" : ""));
    const img = el("img", "foto"); img.loading = "lazy"; img.alt = `Foto de ${c.nome}`; img.src = fotoUrl(cargo, uf, c.id); semFoto(img);
    const nome = el("span", "name", c.nome);
    const sg = el("span", "party"); const b = el("b", null, c.partido); b.style.color = corPartido(c.partido); sg.append(`${c.n} · `, b);
    lado.append(img, nome, sg);
    if (v) lado.append(el("span", "p", pctFmt(v.pct)+"%"), el("span", "v", `${fmt(v.votos)} votos`));
    lado.append(el("span", "t1", `${v ? "no 1º turno: " : "1º turno: "}${pctFmt(c.pct)}%`));
    wrap.appendChild(lado);
  });
  if (temVotos) wrap.appendChild(el("div", "duelo-ap", `${pctFmt(vivo.pst)}% das seções apuradas`));
  return wrap;
}

/* ---------- Disputa decidida no 1º turno ---------- */
export function renderDecidido(uf, g){
  const box = $("decidido");
  box.innerHTML = "";
  const e = g.eleito;
  const card = el("div", "decidido-card");
  const img = el("img", "foto"); img.alt = `Foto de ${e.nome}`; img.src = fotoUrl("gov", uf, e.id); semFoto(img);
  const txt = el("div");
  txt.append(el("strong", null, `${ufNome(uf)} decidiu no 1º turno`));
  const p = el("p"); p.append(`${e.nome} (${e.partido}) foi eleito(a) governador(a) em ${TURNOS[1].data}, com ${pctFmt(e.pct)}% dos votos válidos. Neste estado, o 2º turno é só para Presidente.`);
  txt.appendChild(p);
  const acoes = el("div", "decidido-acoes");
  const b1 = el("button", "btn", "Ver resultado do 1º turno");
  b1.onclick = () => avisar("navegar", {turno:1, cargo:"gov", uf});
  const b2 = el("button", "btn btn-destaque", `Presidente em ${ufNome(uf)} no 2º turno →`);
  b2.onclick = () => avisar("navegar", {cargo:"pres", uf});
  acoes.append(b1, b2);
  txt.appendChild(acoes);
  card.append(img, txt);
  box.appendChild(card);
}

/* ---------- Propostas de governo ---------- */
// Link para o PDF oficial (cópia sem alteração dos dados abertos do TSE). Resumo por tema só aparece se os dois
// candidatos da disputa tiverem todos os temas preenchidos em dados/resumos.json (tratamento igual para os dois).
let propSeq = 0;
export async function renderPropostas(cargo, uf, cands){
  const seq = ++propSeq;
  const box = $("propostas");
  box.hidden = false;
  box.innerHTML = `<div class="bloco-top"><h2>Propostas de governo</h2><span>candidatos em ordem alfabética</span></div>
    <p class="ev-nota">Todo candidato registra no TSE um plano de governo junto com a candidatura. Os links abrem o documento oficial, exatamente como foi entregue ao TSE.</p>`;
  const [props, resumos] = await Promise.all([local("propostas").catch(() => null), local("resumos").catch(() => null)]);
  if (seq !== propSeq) return;
  const ordem = alfabetica(cands);
  const grade = el("div", "prop-grid");
  for (const c of ordem){
    const art = el("article", "prop");
    const top = el("div", "prop-top");
    const img = el("img", "foto"); img.alt = `Foto de ${c.nome}`; img.loading = "lazy"; img.src = fotoUrl(cargo, uf, c.id); semFoto(img);
    const nome = el("div");
    const sg = el("span", "party"); const b = el("b", null, c.partido); b.style.color = corPartido(c.partido); sg.append(`${c.n} · `, b);
    nome.append(el("span", "name", c.nome), sg);
    top.append(img, nome);
    art.appendChild(top);
    const arqs = props && props.cands[c.id];
    if (arqs && arqs.length){
      arqs.forEach((a, i) => {
        const link = el("a", "prop-link");
        link.href = a.arquivo; link.target = "_blank"; link.rel = "noopener";
        link.append(arqs.length === 1 ? "Ver proposta oficial (TSE)" : `Proposta oficial (TSE) · parte ${i+1} de ${arqs.length}`, el("small", null, `PDF · ${mb(a.bytes)}`));
        art.appendChild(link);
      });
    } else {
      const s = el("p", "ev-nota"); s.append("Proposta não encontrada nos dados abertos. Consulte no ");
      const a = el("a", null, "DivulgaCandContas"); a.href = CAND_SITE; a.target = "_blank"; a.rel = "noopener";
      s.append(a, "."); art.appendChild(s);
    }
    grade.appendChild(art);
  }
  box.appendChild(grade);

  // Resumo em PDF dos dois planos (só Presidente): mesmos temas e mesmo número de propostas para os dois
  if (cargo === "pres"){
    const sec = el("div", "resumo");
    sec.appendChild(el("h3", null, "Resumo das propostas"));
    sec.appendChild(el("p", "aviso-ia", "Resumo feito com auxílio de inteligência artificial a partir dos dois planos oficiais: os mesmos 10 temas e 4 propostas por tema para cada candidato, com a página do original. Um resumo sempre deixa coisas de fora; confira o documento oficial."));
    const link = el("a", "prop-link resumo-link");
    link.href = "resumos/presidente-2turno.pdf"; link.target = "_blank"; link.rel = "noopener";
    link.append("Ver resumo das propostas lado a lado", el("small", null, "PDF · 3 páginas"));
    sec.appendChild(link);
    box.appendChild(sec);
  }

  // Resumo por tema (opcional)
  const completo = resumos && resumos.temas && resumos.temas.length &&
    ordem.every(c => resumos.cands && resumos.cands[c.id] && resumos.temas.every(t => (resumos.cands[c.id][t]||"").trim()));
  if (completo){
    const sec = el("div", "resumo");
    sec.appendChild(el("h3", null, "Resumo por tema"));
    if (resumos.aviso) sec.appendChild(el("p", "aviso-ia", resumos.aviso));
    const wrap = el("div", "tabela-wrap");
    const t = el("table", "ev-tabela resumo-tab");
    cabecalho(t, [{txt:"Tema"}, ...ordem.map(c => ({txt:c.nome, cor:corPartido(c.partido)}))]);
    const tb = el("tbody");
    for (const tema of resumos.temas){
      const tr = el("tr");
      tr.appendChild(el("td", null, tema));
      for (const c of ordem) tr.appendChild(el("td", null, resumos.cands[c.id][tema]));
      tb.appendChild(tr);
    }
    t.appendChild(tb); wrap.appendChild(t); sec.appendChild(wrap);
    box.appendChild(sec);
  }

  const fonte = el("p", "ev-nota");
  fonte.append(`Fonte: dados abertos do TSE (proposta_governo_2026)${props ? `, arquivos baixados em ${props.gerado}` : ""}, sem nenhuma alteração. Os mesmos documentos estão no `);
  const a = el("a", null, "DivulgaCandContas"); a.href = CAND_SITE; a.target = "_blank"; a.rel = "noopener";
  fonte.append(a, " (busque pelo nome do candidato).");
  box.appendChild(fonte);
}
