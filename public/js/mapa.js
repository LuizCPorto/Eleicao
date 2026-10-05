// Mapas por estado: Presidente (quem lidera em cada estado) e a visão geral do 2º turno para Governador
import {$, pctFmt, svgEl, cabecalho, ufNome, corPartido} from "./util.js";
import {candidatos, presPorUf, local} from "./dados.js";

// Contornos simplificados dos estados (malha estadual, via projeto click_that_hood), já projetados para SVG: dados/mapa.json
const mapa = () => local("mapa");
// Estados pequenos demais para rótulo no mapa: os números deles ficam na dica e na tabela
const SEM_ROTULO = new Set(["df","se","al","pb","rn","pe","es","rj"]);

// Escala divergente: cinza neutro no empate e 4 degraus iguais até a cor de cada partido (interpolação em OKLab,
// então a claridade muda sempre no mesmo sentido)
export function hexParaOklab(hex){
  const c = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255).map(v => v<=0.04045 ? v/12.92 : ((v+0.055)/1.055)**2.4);
  const l = Math.cbrt(0.4122214708*c[0]+0.5363325363*c[1]+0.0514459929*c[2]);
  const m = Math.cbrt(0.2119034982*c[0]+0.6806995451*c[1]+0.1073969566*c[2]);
  const s = Math.cbrt(0.0883024619*c[0]+0.2817188376*c[1]+0.6299787005*c[2]);
  return [0.2104542553*l+0.7936177850*m-0.0040720468*s, 1.9779984951*l-2.4285922050*m+0.4505937099*s, 0.0259040371*l+0.7827717662*m-0.8086757660*s];
}
function oklabParaHex([L,a,b]){
  const l = (L+0.3963377774*a+0.2158037573*b)**3, m = (L-0.1055613458*a-0.0638541728*b)**3, s = (L-0.0894841775*a-1.2914855480*b)**3;
  const rgb = [4.0767416621*l-3.3077115913*m+0.2309699292*s, -1.2684380046*l+2.6097574011*m-0.3413193965*s, -0.0041960863*l-0.7034186147*m+1.7076147010*s];
  return "#" + rgb.map(v => { v = v<=0.0031308 ? 12.92*v : 1.055*v**(1/2.4)-0.055; return Math.round(Math.min(1,Math.max(0,v))*255).toString(16).padStart(2,"0"); }).join("");
}
const NEUTRO = "#4b5168";
const FAIXAS = [2, 10, 20, 35];   // limites da vantagem, em pontos percentuais
function rampa(cor){ const n = hexParaOklab(NEUTRO), c = hexParaOklab(cor); return [0.4,0.6,0.8,1].map(t => oklabParaHex(n.map((v,i) => v+(c[i]-v)*t))); }
function corVantagem(m, rA, rB){
  const a = Math.abs(m);
  if (a < FAIXAS[0]) return NEUTRO;
  const k = a < FAIXAS[1] ? 0 : a < FAIXAS[2] ? 1 : a < FAIXAS[3] ? 2 : 3;
  return (m > 0 ? rA : rB)[k];
}
export function corTexto(hex){ return hexParaOklab(hex)[0] > 0.72 ? "#10131f" : "#ffffff"; }

let mapaSeq = 0;
export function atualizarMapa(d, turno, t1PorUf){
  const seq = ++mapaSeq;
  const top = d.cands.slice(0, 2);
  if (top.length < 2) return;
  const [A, B] = top.map(c => ({id:c.id, nome:c.nome, cor:corPartido(c.partido)}));
  $("mapaSub").textContent = `${A.nome} × ${B.nome} · quem lidera em cada estado`;
  Promise.all([presPorUf(turno), mapa()]).then(([js, MAPA]) => { if (seq === mapaSeq) desenharMapa(js, A, B, MAPA, t1PorUf); })
    .catch(() => { if (seq === mapaSeq) $("mapaResumo").textContent = "Não consegui buscar os estados agora. Tento de novo na próxima atualização."; });
}

function desenharMapa(js, A, B, MAPA, t1PorUf){
  const rA = rampa(A.cor), rB = rampa(B.cor);
  const dados = new Map();
  for (const [uf, j] of js){
    const s = j.s||{}, cands = candidatos(j);
    const a = (cands.find(c=>c.id===A.id)||{}).pct || 0, b = (cands.find(c=>c.id===B.id)||{}).pct || 0;
    const sem = !(+s.st) || !(+(j.v||{}).vv);
    dados.set(uf, {uf, nome:ufNome(uf), apurado: +s.ts ? (+s.st)/(+s.ts)*100 : 0, a, b, sem, cor: sem ? null : corVantagem(a-b, rA, rB)});
  }

  // Legenda: os dois lados + a escala com rótulos (identidade nunca só pela cor)
  const leg = $("mapaLegenda"); leg.innerHTML = "";
  const lados = document.createElement("div"); lados.className = "lados";
  for (const s of [A, B]){ const sp = document.createElement("span"); const k = document.createElement("i"); k.className="chave"; k.style.background = s.cor; sp.append(k, `${s.nome} na frente`); lados.appendChild(sp); }
  const escala = document.createElement("div"); escala.className = "escala";
  const passos = [[rA[3],"35+"],[rA[2],"20–35"],[rA[1],"10–20"],[rA[0],"2–10"],[NEUTRO,"empate*"],[rB[0],"2–10"],[rB[1],"10–20"],[rB[2],"20–35"],[rB[3],"35+"]];
  for (const [cor, txt] of passos){ const p = document.createElement("div"); p.className = "passo"; const i = document.createElement("i"); i.style.background = cor; const sp = document.createElement("span"); sp.textContent = txt; p.append(i, sp); escala.appendChild(p); }
  const extra = document.createElement("div");
  extra.textContent = "Vantagem em pontos percentuais. *Empate: diferença menor que 2 p.p. ";
  const sd = document.createElement("span"); sd.className = "extra"; sd.append(document.createElement("i"), "ainda sem votos apurados"); extra.appendChild(sd);
  leg.append(lados, escala, extra);

  // Resumo
  const estados = [...dados.values()].filter(x => x.uf !== "zz");
  const nA = estados.filter(x => !x.sem && x.a-x.b >= FAIXAS[0]).length, nB = estados.filter(x => !x.sem && x.b-x.a >= FAIXAS[0]).length;
  const nE = estados.filter(x => !x.sem && Math.abs(x.a-x.b) < FAIXAS[0]).length, nS = estados.filter(x => x.sem).length;
  $("mapaResumo").textContent = `${A.nome} está na frente em ${nA} ${nA===1?"estado":"estados"} e ${B.nome} em ${nB}` +
    (nE ? `; ${nE} ${nE===1?"está empatado":"estão empatados"}` : "") + (nS ? `; ${nS} ainda sem votos apurados` : "") + ". (Contando o Distrito Federal como estado.)";

  // SVG
  const box = $("mapaSvg"); box.innerHTML = "";
  const H = MAPA.h;
  const svg = svgEl("svg", {viewBox:`0 0 ${MAPA.w} ${H}`, role:"group", "aria-label":"Mapa do Brasil por estado"}, box);
  const defs = svgEl("defs", {}, svg);
  const pat = svgEl("pattern", {id:"semDados", width:6, height:6, patternUnits:"userSpaceOnUse", patternTransform:"rotate(45)"}, defs);
  svgEl("rect", {width:6, height:6, fill:"#2a3150"}, pat); svgEl("rect", {width:3, height:6, fill:"#3a4262"}, pat);
  const tip = $("mapaTip"), wrap = box.parentElement;

  const mostrarTip = (x, y, info) => {
    tip.innerHTML = "";
    const t = document.createElement("div"); t.className = "tt"; t.textContent = `${info.nome} · ${pctFmt(info.apurado)}% apurado`; tip.appendChild(t);
    if (info.sem){ const l = document.createElement("div"); l.textContent = "Ainda sem votos apurados"; tip.appendChild(l); }
    else {
      for (const [s, v] of [[A, info.a], [B, info.b]]){
        const l = document.createElement("div"); l.className = "lin";
        const k = document.createElement("i"); k.className = "chave"; k.style.background = s.cor;
        const b = document.createElement("b"); b.textContent = pctFmt(v)+"%";
        const n = document.createElement("span"); n.textContent = s.nome;
        l.append(k, b, n); tip.appendChild(l);
      }
      const m = info.a - info.b, l = document.createElement("div"); l.className = "tt";
      l.textContent = Math.abs(m) < FAIXAS[0] ? `Praticamente empatados (${pctFmt(Math.abs(m))} p.p.)` : `${m>0?A.nome:B.nome} +${pctFmt(Math.abs(m))} p.p.`;
      tip.appendChild(l);
    }
    const t1 = t1PorUf && t1PorUf[info.uf];
    if (t1){ const l = document.createElement("div"); l.className = "tt"; l.textContent = `No 1º turno: ${A.nome} ${pctFmt(t1[A.id]||0)}% · ${B.nome} ${pctFmt(t1[B.id]||0)}%`; tip.appendChild(l); }
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(Math.max(0, x + 14), wrap.clientWidth - w) + "px";
    tip.style.top = Math.min(Math.max(0, y + 14), wrap.clientHeight - h) + "px";
  };
  const esconder = () => { tip.hidden = true; };
  const ligar = (el, info, cx, cy) => {
    el.setAttribute("tabindex", "0"); el.classList.add("uf");
    el.setAttribute("aria-label", info.sem ? `${info.nome}: ainda sem votos apurados` :
      `${info.nome}, ${pctFmt(info.apurado)}% apurado: ${A.nome} ${pctFmt(info.a)}%, ${B.nome} ${pctFmt(info.b)}%`);
    el.addEventListener("pointermove", ev => { const r = wrap.getBoundingClientRect(); mostrarTip(ev.clientX - r.left, ev.clientY - r.top, info); });
    el.addEventListener("pointerleave", esconder);
    el.addEventListener("focus", () => { const esc = wrap.clientWidth / MAPA.w; mostrarTip(cx*esc, cy*esc, info); });
    el.addEventListener("blur", esconder);
  };

  for (const [uf, d] of Object.entries(MAPA.uf)){
    const info = dados.get(uf); if (!info) continue;
    const p = svgEl("path", {d, fill: info.cor || "url(#semDados)"}, svg);
    ligar(p, info, MAPA.c[uf][0], MAPA.c[uf][1]);
  }
  for (const [uf, [x, y]] of Object.entries(MAPA.c)){
    if (SEM_ROTULO.has(uf)) continue;
    const info = dados.get(uf); if (!info) continue;
    svgEl("text", {x, y:y+4, "text-anchor":"middle", fill: info.cor ? corTexto(info.cor) : "#ffffff"}, svg).textContent = uf.toUpperCase();
  }
  // Exterior: quadro no canto inferior esquerdo, na mesma escala
  const ext = dados.get("zz");
  if (ext){
    const x = 20, y = H - 74;
    svgEl("text", {x, y:y-6, fill:"#a9b0c6"}, svg).textContent = "EXTERIOR";
    const r = svgEl("rect", {x, y, width:90, height:44, rx:4, fill: ext.cor || "url(#semDados)"}, svg);
    ligar(r, ext, x+45, y+22);
  }

  // Tabela (mesmos números, sem depender de cor ou do mouse)
  const t = $("mapaTabela"); t.innerHTML = "";
  cabecalho(t, [{txt:"Estado"}, {txt:"Apurado"}, {txt:A.nome, cor:A.cor}, {txt:B.nome, cor:B.cor}, {txt:"Vantagem"}, ...(t1PorUf ? [{txt:"Vantagem no 1º turno"}] : [])]);
  const tb = document.createElement("tbody");
  for (const info of [...dados.values()].sort((x,y) => x.nome.localeCompare(y.nome))){
    const tr = document.createElement("tr");
    const m = info.a - info.b;
    const cel = [info.nome, pctFmt(info.apurado)+"%", info.sem?"—":pctFmt(info.a)+"%", info.sem?"—":pctFmt(info.b)+"%",
                 info.sem ? "sem votos" : vantagem(m, A, B)];
    const t1 = t1PorUf && t1PorUf[info.uf];
    if (t1PorUf) cel.push(t1 ? vantagem((t1[A.id]||0) - (t1[B.id]||0), A, B) : "—");
    for (const c of cel){ const td = document.createElement("td"); td.textContent = c; tr.appendChild(td); }
    tb.appendChild(tr);
  }
  t.appendChild(tb);
}
const vantagem = (m, A, B) => Math.abs(m) < FAIXAS[0] ? `empate (${pctFmt(Math.abs(m))} p.p.)` : `${m>0?A.nome:B.nome} +${pctFmt(Math.abs(m))} p.p.`;

/* ---------- Visão geral do 2º turno: Governador ---------- */
// Estados com 2º turno em destaque (mesma cor para todos: o mapa não sugere favorito); os demais aparecem como decididos no 1º turno
const COR_2T = "#e8b84a", COR_1T = "#283050";
export async function desenharMapaGov2T(box, tip, t2, aoClicar){
  const MAPA = await mapa();
  box.innerHTML = "";
  const svg = svgEl("svg", {viewBox:`0 0 ${MAPA.w} ${MAPA.h}`, role:"group", "aria-label":"Mapa: estados com 2º turno para Governador"}, box);
  const wrap = box.parentElement;
  const linhaTip = (txt, cls) => { const d = document.createElement("div"); if (cls) d.className = cls; d.textContent = txt; tip.appendChild(d); };
  const mostrarTip = (x, y, uf) => {
    const g = t2.governador[uf];
    tip.innerHTML = "";
    linhaTip(`${ufNome(uf)} · ${g.turno2 ? "2º turno" : "decidido no 1º turno"}`, "tt");
    if (g.turno2){
      for (const c of [...g.cands].sort((a,b) => a.nome.localeCompare(b.nome, "pt-BR"))){
        const l = document.createElement("div"); l.className = "lin";
        const k = document.createElement("i"); k.className = "chave"; k.style.background = corPartido(c.partido);
        const b = document.createElement("b"); b.textContent = c.nome;
        const n = document.createElement("span"); n.textContent = `${c.partido} · 1º turno ${pctFmt(c.pct)}%`;
        l.append(k, b, n); tip.appendChild(l);
      }
    } else linhaTip(`${g.eleito.nome} (${g.eleito.partido}) eleito com ${pctFmt(g.eleito.pct)}%`);
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(Math.max(0, x + 14), wrap.clientWidth - w) + "px";
    tip.style.top = Math.min(Math.max(0, y + 14), wrap.clientHeight - h) + "px";
  };
  const esconder = () => { tip.hidden = true; };
  for (const [uf, d] of Object.entries(MAPA.uf)){
    const g = t2.governador[uf]; if (!g) continue;
    const p = svgEl("path", {d, fill: g.turno2 ? COR_2T : COR_1T, class: "uf" + (g.turno2 ? " com2t" : ""), tabindex:"0", role:"link",
      "aria-label": g.turno2 ? `${ufNome(uf)}: 2º turno entre ${g.cands.map(c => c.nome).join(" e ")}` : `${ufNome(uf)}: ${g.eleito.nome} eleito no 1º turno`}, svg);
    p.addEventListener("pointermove", ev => { const r = wrap.getBoundingClientRect(); mostrarTip(ev.clientX - r.left, ev.clientY - r.top, uf); });
    p.addEventListener("pointerleave", esconder);
    p.addEventListener("focus", () => { const esc = wrap.clientWidth / MAPA.w; mostrarTip(MAPA.c[uf][0]*esc, MAPA.c[uf][1]*esc, uf); });
    p.addEventListener("blur", esconder);
    p.addEventListener("click", () => aoClicar(uf));
    p.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " "){ ev.preventDefault(); aoClicar(uf); } });
  }
  for (const [uf, [x, y]] of Object.entries(MAPA.c)){
    const g = t2.governador[uf]; if (!g || SEM_ROTULO.has(uf)) continue;
    svgEl("text", {x, y:y+4, "text-anchor":"middle", fill: g.turno2 ? corTexto(COR_2T) : "#8a93ad"}, svg).textContent = uf.toUpperCase();
  }
}
