// Busca em todos os cargos e estados. O índice (nome de urna, número, partido por disputa "cargo|uf") fica em dados/indice.json
// e só é baixado quando alguém digita na busca. Os votos mostrados são do 1º turno.
import {$, el, fmt, pctFmt, semAcento, corPartido, fotoUrl, semFoto, bandeira, cargoNome, ufNome, avisar} from "./util.js";
import {local, disputa} from "./dados.js";
import {state} from "./estado.js";

const ORDEM_CARGO = {pres:0, gov:1, sen:2, fed:3, est:4};
const POR_PAGINA = 30;
let limite = POR_PAGINA, seq = 0;
let INDICE = null;

async function indice(){
  if (INDICE) return INDICE;
  const bruto = await local("indice");
  INDICE = [];
  for (const [k, lista] of Object.entries(bruto)){
    const [cargo, uf] = k.split("|");
    for (const [id, nome, n, partido] of lista) INDICE.push({id, nome, n, partido, cargo, uf, chave: semAcento(nome)});
  }
  return INDICE;
}

function procurar(lista, texto){
  const q = semAcento(texto.trim());
  if (q.length < 2 && !/^\d+$/.test(q)) return null;
  const achados = [];
  for (const c of lista){
    let nota = -1;
    if (c.chave.startsWith(q)) nota = 0;                 // começa com o texto
    else if (c.chave.includes(" "+q)) nota = 1;          // alguma palavra do nome começa com o texto
    else if (c.n === q) nota = 2;                        // número exato
    else if (semAcento(c.partido) === q) nota = 3;       // sigla exata do partido
    if (nota >= 0) achados.push({...c, nota});
  }
  return achados.sort((a,b) => a.nota-b.nota || ORDEM_CARGO[a.cargo]-ORDEM_CARGO[b.cargo] || a.nome.localeCompare(b.nome) || a.uf.localeCompare(b.uf));
}

export const reiniciarBusca = () => { limite = POR_PAGINA; };
export const buscando = () => { const q = semAcento(state.q.trim()); return q.length >= 2 || /^\d+$/.test(q); };

export async function renderBusca(){
  const minha = ++seq;
  const sec = $("busca");
  if (!buscando()){ sec.hidden = true; sec.innerHTML = ""; avisar("busca-fechou"); return; }
  sec.hidden = false; avisar("busca-abriu");
  let lista;
  try { lista = await indice(); }
  catch { sec.innerHTML = `<div class="err">Não consegui carregar o índice de candidatos agora. Tente de novo em instantes.</div>`; return; }
  if (minha !== seq) return;
  const achados = procurar(lista, state.q);
  const mostrar = achados.slice(0, limite);
  sec.innerHTML = `<div class="busca-top"><h2></h2><span>Todos os cargos e estados · votos do 1º turno · ignora os filtros acima</span></div>`;
  sec.querySelector("h2").textContent = achados.length
    ? `${fmt(achados.length)} ${achados.length===1?"resultado":"resultados"} para "${state.q.trim()}"`
    : `Nenhum candidato encontrado para "${state.q.trim()}"`;
  if (!achados.length) return;

  const ol = el("ol");
  const linhas = new Map();
  for (const r of mostrar){
    const li = el("li", "res");
    li.innerHTML = `<img class="foto" alt="" loading="lazy">
      <div class="who"><span class="name"></span><span class="party"></span><span class="onde"></span></div>
      <div class="num"><div class="p">…</div><div class="v pos">carregando</div><button class="ver">Ver na disputa →</button></div>`;
    const foto = li.querySelector(".foto"); foto.src = fotoUrl(r.cargo, r.uf, r.id); foto.alt = `Foto de ${r.nome}`; semFoto(foto);
    li.querySelector(".name").textContent = r.nome;
    const sg = el("b", null, r.partido); sg.style.color = corPartido(r.partido);
    li.querySelector(".party").append(`${r.n} · `, sg);
    li.querySelector(".onde").append(bandeira(r.uf, ""), `${cargoNome(r.cargo, r.uf)} · ${r.uf==="br" ? "Brasil" : ufNome(r.uf)}`);
    li.querySelector(".ver").onclick = () => avisar("ir-para", r);
    ol.appendChild(li);
    linhas.set(r, li);
  }
  sec.appendChild(ol);
  if (achados.length > mostrar.length){
    const b = el("button", "btn", `Mostrar mais (${fmt(achados.length - mostrar.length)} restantes)`);
    b.onclick = () => { limite += POR_PAGINA; renderBusca(); };
    sec.appendChild(b);
  }

  // Votos do 1º turno: busca uma vez cada disputa que aparece nos resultados
  const disputas = new Map();
  for (const r of mostrar){ const k = r.cargo+"|"+r.uf; if (!disputas.has(k)) disputas.set(k, disputa(r.cargo, r.uf, 1).catch(()=>null)); }
  for (const [r, li] of linhas){
    disputas.get(r.cargo+"|"+r.uf).then(d => {
      if (minha !== seq) return;
      const i = d ? d.cands.findIndex(c => c.id === r.id) : -1;
      if (i < 0){ li.querySelector(".p").textContent = "—"; li.querySelector(".pos").textContent = d ? "sem votos" : "sem conexão"; return; }
      const c = d.cands[i];
      li.querySelector(".p").textContent = pctFmt(c.pct)+"%";
      li.querySelector(".pos").textContent = `${fmt(c.votos)} votos · ${i+1}º de ${d.cands.length}`;
    });
  }
}
