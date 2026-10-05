// Favoritos: guardados neste navegador e mostrados na coluna lateral
import {$, el, fmt, pctFmt, corPartido, fotoUrl, semFoto, bandeira, cargoNome, ler, gravar, avisar} from "./util.js";
import {disputa} from "./dados.js";
import {state} from "./estado.js";

let favoritos = ler("favoritos", []).map(f => ({turno:1, ...f}));   // [{turno, cargo, uf, id, nome}]; os antigos eram todos do 1º turno
const salvar = () => gravar("favoritos", favoritos);
export const ehFav = id => favoritos.some(f => f.id === id && f.turno === state.turno);

export function toggleFav(c){
  if (ehFav(c.id)) favoritos = favoritos.filter(f => !(f.id === c.id && f.turno === state.turno));
  else favoritos.push({turno:state.turno, cargo:state.cargo, uf: state.cargo==="pres" ? "br" : state.uf, id:c.id, nome:c.nome});
  salvar();
  avisar("favs-mudou");
}

let favSeq = 0;
export async function carregarFavs(){
  const seq = ++favSeq;
  const box = $("favs");
  box.classList.toggle("vazio", !favoritos.length);   // no celular, o bloco some sem favoritos
  if (!favoritos.length){
    box.innerHTML = `<h2><span>★</span> Favoritos</h2><div class="fav-hint">Clique em "☆ Favoritar" em qualquer candidato para acompanhar a disputa dele aqui, ao lado.</div>`;
    return;
  }
  // Agrupa por disputa (turno + cargo + UF), na ordem em que foram favoritados
  const grupos = new Map();
  for (const f of favoritos){
    const k = f.turno+"|"+f.cargo+"|"+f.uf;
    if (!grupos.has(k)) grupos.set(k, {turno:f.turno, cargo:f.cargo, uf:f.uf, ids:[]});
    grupos.get(k).ids.push(f.id);
  }
  const res = await Promise.all([...grupos.values()].map(g => disputa(g.cargo, g.uf, g.turno).then(d=>({g,d}), err=>({g,err}))));
  if (seq !== favSeq) return;
  box.innerHTML = `<h2><span>★</span> Favoritos</h2>`;
  for (const {g, d, err} of res) box.appendChild(cardFav(g, d, err));
}

function cardFav(g, d, err){
  const card = el("section", "card");
  const top = el("div", "card-top");
  const h = el("h3", null, `${cargoNome(g.cargo, g.uf)} - ${g.uf==="br" ? "Brasil" : g.uf.toUpperCase()}`);
  if (g.turno === 2) h.append(el("span", "tag sec", "2º turno"));
  const ap = el("span", "ap", d ? pctFmt(d.pst)+"%" : "—"); ap.title = "Seções apuradas";
  top.append(bandeira(g.uf, ""), h, ap);
  card.appendChild(top);
  if (err){
    card.appendChild(el("div", "fav-hint", err.status===404 ? "A apuração desta disputa ainda não começou." : "Não consegui atualizar esta disputa agora."));
    return card;
  }

  // Mostra os dois primeiros colocados e os favoritos desta disputa
  const mostrar = d.cands.filter((c,i) => i<2 || g.ids.includes(c.id));
  const max = Math.max(...d.cands.map(c=>c.pct), 1);
  for (const c of mostrar){
    const fav = g.ids.includes(c.id);
    const r = el("div", "fr" + (fav ? " eh-fav" : ""));
    r.innerHTML = `<img alt="" loading="lazy"><div class="n"></div><div class="pp">${pctFmt(c.pct)}%</div>
      <div class="sg"></div><div class="vt">${fmt(c.votos)}</div>
      <div class="bar"><span style="width:${(c.pct/max*100).toFixed(2)}%;background:${corPartido(c.partido)}"></span></div>`;
    const img = r.querySelector("img"); img.src = fotoUrl(g.cargo, g.uf, c.id); img.alt = `Foto de ${c.nome}`; semFoto(img);
    const n = r.querySelector(".n");
    if (fav){
      const s = el("button", "estrela", "★"); s.title = "Remover dos favoritos"; s.setAttribute("aria-label", `Remover ${c.nome} dos favoritos`);
      s.onclick = () => { favoritos = favoritos.filter(f => !(f.id === c.id && f.turno === g.turno)); salvar(); avisar("favs-mudou"); };
      n.appendChild(s);
    }
    n.append(c.nome);
    const sg = r.querySelector(".sg"); sg.textContent = c.partido; sg.style.color = corPartido(c.partido);
    card.appendChild(r);
  }
  // Favorito que ainda não aparece no arquivo (ex.: candidatura retirada)
  for (const id of g.ids) if (!d.cands.some(c=>c.id===id)){
    const f = favoritos.find(x=>x.id===id);
    card.appendChild(el("div", "fav-hint", `${f.nome}: sem votos nesta disputa.`));
  }
  card.appendChild(el("div", "status", d.fim ? "Apuração completa" : d.st ? "Apuração em andamento" : "Apuração não iniciada"));
  return card;
}
