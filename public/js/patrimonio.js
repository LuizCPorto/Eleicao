// Patrimônio declarado (dados abertos do TSE, cópia em dados/bens.json: o servidor de dados abertos não deixa o navegador baixar direto)
import {el, brl} from "./util.js";
import {local} from "./dados.js";
import {CAND_SITE} from "./config.js";
import {ui} from "./estado.js";

function buscar(BENS, c){
  const id = String(c.id);
  BENS.set ??= new Set(BENS.cands);
  if (BENS.set.has(id)){
    const bens = (BENS.bens[id] || []).map(([tipo, desc, valor]) => ({tipo, desc, valor}));
    return {total: bens.reduce((s,b)=>s+b.valor, 0), qtd: bens.length, bens};
  }
  if (BENS.dep[id]) return {total: BENS.dep[id][0], qtd: BENS.dep[id][1], bens:null};   // deputados: só total
  return null;
}

export function togglePatrimonio(li, c){
  const aberto = li.querySelector(".det");
  for (const d of document.querySelectorAll(".det")) d.remove();
  for (const b of document.querySelectorAll(".who[aria-expanded]")) b.setAttribute("aria-expanded","false");
  if (aberto && ui.openId===c.id){ ui.openId = null; return; }
  ui.openId = c.id;
  abrirPatrimonio(li, c);
}

export async function abrirPatrimonio(li, c){
  li.querySelector(".who").setAttribute("aria-expanded","true");
  const det = el("div", "det");
  det.append(el("span", "lbl", "Patrimônio declarado ao TSE"));
  const carregando = el("span", "hint", "Carregando…");
  det.append(carregando);
  li.appendChild(det);
  const link = txt => { const s = el("span"); s.append(txt+" "); const a = el("a", null, "DivulgaCandContas do TSE"); a.href = CAND_SITE; a.target = "_blank"; a.rel = "noopener"; s.append(a, "."); return s; };
  let BENS;
  try { BENS = await local("bens"); }
  catch { carregando.replaceWith(link("Não consegui carregar a lista de bens agora. Consulte pelo nome no")); return; }
  carregando.remove();
  if (!det.isConnected) return;
  const p = buscar(BENS, c);
  if (!p){ det.appendChild(link("Este candidato não está na lista de bens salva no site. Consulte pelo nome no")); return; }
  det.appendChild(el("div", "tot", p.qtd ? brl(p.total) : "Nenhum bem declarado"));
  if (p.bens && p.bens.length){
    const ul = el("ul");
    for (const b of p.bens){
      const item = el("li");
      item.append(el("span", null, [b.tipo, b.desc].filter(Boolean).join(" · ")), el("span", null, brl(b.valor)));
      ul.appendChild(item);
    }
    det.appendChild(ul);
  } else if (!p.bens && p.qtd){
    det.appendChild(link(`${p.qtd} ${p.qtd===1?"bem declarado":"bens declarados"}. A lista item a item está no`));
  }
  det.appendChild(el("span", "hint", `Dados abertos do TSE de ${BENS.gerado}`));
}
