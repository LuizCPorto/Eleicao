// Liga as partes da página: filtros, carregamento, abas, contador e compartilhamento
import {UFS, REGIOES, CARGOS_T2, SO_PRESIDENTE, TURNOS, REFRESH_MS, REFRESH_LENTO_MS, POR_PAGINA, APP_TSE} from "./config.js";
import {$, el, ufNome, cargoNome, bandeira, hora, ouvir} from "./util.js";
import {state, ui, lerUrl, escreverUrl, turnoPadrao} from "./estado.js";
import {disputa, somar, getJson, url, limparCache, esquecer, aoBaixarPresBr, local as localJson} from "./dados.js";
import {render, renderFinalistas, ocultos, salvarOcultos} from "./lista.js";
import {carregarFavs} from "./favoritos.js";
import {atualizarEvolucao, registrarHistorico} from "./evolucao.js";
import {atualizarMapa} from "./mapa.js";
import {renderBusca, reiniciarBusca, buscando} from "./busca.js";
import {segundoTurno, finalistas, pctT1, ufsGov2T, renderGeral, renderDecidido, renderPropostas} from "./segundo-turno.js";
import {fase, textoCurto, preencherContagem} from "./contador.js";

let T2 = null;              // resumo do 1º turno usado no 2º turno (dados/segundo-turno.json)
let timer = null, nextAt = 0, loadSeq = 0;
let aoVivo = false, conexaoOk = true;
let propKey = null, geralFeito = false;

aoBaixarPresBr(registrarHistorico);

/* ---------- Filtros ---------- */
const porNome = (a, b) => ufNome(a).localeCompare(ufNome(b));

function buildRegSelect(){
  const sel = $("reg"); sel.innerHTML = "";
  for (const [k,r] of Object.entries(REGIOES)){ const o = el("option", null, r.nome); o.value = k; sel.appendChild(o); }
  sel.value = state.reg;
}

// [valor, nome, grupo?]
function ufOptions(){
  const pres = state.cargo === "pres";
  const r = REGIOES[state.reg];
  const naRegiao = uf => state.reg === "todas" || r.ufs.includes(uf);
  if (state.turno === 2 && state.cargo === "gov" && T2){
    const com = ufsGov2T(T2).filter(naRegiao).sort(porNome).map(uf => [uf, ufNome(uf), "Com 2º turno"]);
    const sem = Object.keys(T2.governador).filter(uf => !T2.governador[uf].turno2 && naRegiao(uf)).sort(porNome).map(uf => [uf, ufNome(uf), "Decididos no 1º turno"]);
    return [...com, ...sem];
  }
  if (state.reg === "todas")
    return pres ? UFS.map(([v,n]) => [v, v==="br" ? "Brasil (total, inclui exterior)" : n])
                : UFS.filter(u => !SO_PRESIDENTE.includes(u[0]));
  const est = r.ufs.map(uf => [uf, ufNome(uf)]).sort((a,b)=>a[1].localeCompare(b[1]));
  return pres ? [["reg", `Toda a região ${r.nome}`], ...est] : est;
}

function buildUfSelect(){
  // Na visão geral não há estado escolhido: fica em Brasil, para Presidente abrir no total nacional
  if (state.cargo === "geral"){ state.uf = "br"; state.reg = "todas"; $("reg").value = "todas"; return; }
  const sel = $("uf"), opts = ufOptions();
  sel.innerHTML = "";
  const grupos = new Map();
  for (const [v, n, g] of opts){
    const o = el("option", null, n); o.value = v;
    if (!g){ sel.appendChild(o); continue; }
    if (!grupos.has(g)){ const og = document.createElement("optgroup"); og.label = g; grupos.set(g, og); sel.appendChild(og); }
    grupos.get(g).appendChild(o);
  }
  if (!opts.some(u => u[0]===state.uf)) state.uf = opts[0][0];
  sel.value = state.uf;
}

function local(){
  if (state.uf === "reg") return `Região ${REGIOES[state.reg].nome}`;
  return ufNome(state.uf);
}

function aplicarControles(){
  const t2 = state.turno === 2;
  for (const b of document.querySelectorAll("[data-turno]")) b.setAttribute("aria-pressed", String(+b.dataset.turno === state.turno));
  for (const b of document.querySelectorAll("[data-cargo]")){
    const k = b.dataset.cargo;
    b.hidden = t2 ? !(k === "geral" || CARGOS_T2.includes(k)) : k === "geral";
    b.setAttribute("aria-pressed", String(k === state.cargo));
  }
  const geral = state.cargo === "geral";
  $("reg").hidden = geral; $("uf").hidden = geral;
  $("refresh").hidden = geral && fase(2) === "antes";
}

function updateTitle(){
  const t = state.turno;
  if (state.cargo === "geral"){
    $("title").textContent = "2º turno · Presidente e Governador";
    document.title = "2º turno · Placar da Apuração 2026";
    $("flag").replaceChildren(bandeira("br", "bandeira"));
  } else {
    const nome = cargoNome(state.cargo, state.uf);
    $("title").textContent = `${nome} · ${local()}`;
    document.title = `${nome} ${local()} · ${t}º turno · Placar da Apuração 2026`;
    $("flag").replaceChildren(bandeira(state.uf, "bandeira"));
  }
  $("eyebrowTxt").textContent = `· Eleições Gerais 2026 · ${t}º turno · ${TURNOS[t].data}`;
}

/* ---------- Qual tela mostrar ---------- */
function vista(){
  if (buscando()) return "busca";
  if (state.turno === 2 && state.cargo === "geral") return "geral";
  if (state.turno === 2 && state.cargo === "gov" && T2 && !(T2.governador[state.uf]||{}).turno2) return "decidido";
  return "disputa";
}
function mostrarVista(){
  const v = vista();
  $("geral").hidden = v !== "geral";
  $("disputa").hidden = v !== "disputa";
  $("decidido").hidden = v !== "decidido";
}

/* ---------- Avisos (TSE fora do ar, dado salvo) ---------- */
function aviso(html){
  const box = $("error");
  box.hidden = !html;
  if (html){ box.className = "err"; box.innerHTML = html; }
}
function avisoCache(t, d){
  if (!t) return aviso(null);
  const tot = d && d.ht ? ` O TSE tinha totalizado esse dado às ${d.ht.slice(0,5).replace(":", "h")}.` : "";
  aviso(`O TSE não respondeu agora. Mostrando o último dado salvo neste navegador, <b>atualizado às ${hora(t)}</b>.${tot} Tento de novo automaticamente. Conferência oficial: <a href="${APP_TSE}" target="_blank" rel="noopener">app Resultados do TSE</a>.`);
}
function setConexao(ok){ conexaoOk = ok; }

/* ---------- Carregamento ---------- */
async function load(){
  const seq = ++loadSeq;
  const v = vista();
  let proximo = REFRESH_LENTO_MS;
  try {
    if (v === "geral") proximo = await carregarGeral(seq);
    else if (v === "decidido"){ renderDecidido(state.uf, T2.governador[state.uf]); aviso(null); aoVivo = false; }
    else if (v === "disputa") proximo = await carregarDisputa(seq);
  } catch (err){
    if (seq !== loadSeq) return;
    setConexao(false);
    aoVivo = true;
    proximo = REFRESH_MS;
    const mantido = ui.lastData ? " Os números na tela são do último carregamento." : "";
    if (!ui.lastData) $("meta").textContent = "Sem resposta do TSE";
    const motivo = err instanceof TypeError ? "sem conexão" : err.message;   // fetch sem rede dá TypeError ("Failed to fetch")
    aviso(`Não consegui buscar os dados do TSE agora (${motivo}).${mantido} Vou tentar de novo em 30 segundos. Se continuar, abra o <a href="${APP_TSE}" target="_blank" rel="noopener">app Resultados do TSE</a>.`);
  }
  if (seq !== loadSeq) return;
  // Mantém o histórico da Presidência durante a apuração, mesmo com outra disputa na tela
  if (fase(state.turno) === "apuracao" && !(state.cargo==="pres" && state.uf==="br")) disputa("pres", "br", state.turno).catch(()=>{});
  carregarFavs();
  schedule(proximo);
}

async function carregarDisputa(seq){
  const t = state.turno;
  let cands2 = null, t1 = null;
  if (t === 2){
    cands2 = finalistas(T2, state.cargo, state.uf);
    t1 = pctT1(T2, state.cargo, state.uf);
    const k = state.cargo + "|" + (state.cargo === "pres" ? "br" : state.uf);
    if (k !== propKey){ propKey = k; renderPropostas(state.cargo, state.uf, cands2); }
  } else { propKey = null; $("propostas").hidden = true; }

  // Antes do dia da votação o TSE ainda não publicou os arquivos do 2º turno: nem pede
  let d = null;
  if (!(t === 2 && fase(2) === "antes")){
    try {
      if (state.uf === "reg") d = somar(await Promise.all(REGIOES[state.reg].ufs.map(uf => getJson(url(state.cargo, uf, t)))));
      else d = await disputa(state.cargo, state.uf, t);
    } catch (err){
      esquecer(state.cargo, state.uf, t);
      if (!(t === 2 && err.status === 404)) throw err;
    }
  }
  if (seq !== loadSeq) return REFRESH_MS;

  if (t === 2 && (!d || !d.st)){
    // Apuração do 2º turno ainda não começou: finalistas em ordem alfabética com o resultado do 1º turno
    $("progresso").hidden = true;
    setConexao(true); aoVivo = false; aviso(null);
    renderFinalistas(cands2, t1 || {});
    aplicarAbas(null);
    return fase(2) === "antes" ? REFRESH_LENTO_MS : REFRESH_MS;
  }
  $("progresso").hidden = false;
  setConexao(!d.cache);
  avisoCache(d.cache, d);
  render(d, t === 2 ? t1 : null);
  aplicarAbas(d);
  const encerrada = d.fim || d.pst >= 100;
  aoVivo = !encerrada;
  return encerrada ? REFRESH_LENTO_MS : REFRESH_MS;
}

async function carregarGeral(seq){
  const vivos = {};
  if (fase(2) !== "antes"){
    const alvos = [["pres","br"], ...ufsGov2T(T2).map(uf => ["gov", uf])];
    const res = await Promise.all(alvos.map(([c,u]) => disputa(c, u, 2).then(d => [c+"|"+u, d], () => null)));
    for (const r of res) if (r && r[1].st) vivos[r[0]] = r[1];
  }
  if (seq !== loadSeq) return REFRESH_MS;
  const temVivos = Object.keys(vivos).length > 0;
  const cache = Object.values(vivos).map(d => d.cache).filter(Boolean).sort()[0] || null;
  setConexao(!cache); avisoCache(cache);
  aoVivo = fase(2) === "apuracao" && temVivos;
  if (!geralFeito || temVivos){ renderGeral(T2, vivos); geralFeito = true; }
  return fase(2) === "apuracao" ? REFRESH_MS : REFRESH_LENTO_MS;
}

function schedule(ms){
  clearTimeout(timer);
  nextAt = Date.now() + ms;
  timer = setTimeout(() => { limparCache(); load(); }, ms);
}

/* ---------- Topo: ao vivo ou contagem regressiva ---------- */
function tick(){
  const t = state.turno, fs = fase(t);
  let txt, pulso = false, off = false;
  if (t === 2 && fs === "antes") txt = textoCurto(2);
  else if (t === 2 && fs === "votacao") txt = "Votação em andamento até as 17h (Brasília)";
  else if (!conexaoOk){ txt = "Sem conexão com o TSE"; off = true; }
  else if (aoVivo){ pulso = true; txt = `Ao vivo · próxima atualização em ${Math.max(0, Math.round((nextAt-Date.now())/1000))}s`; }
  else txt = t === 1 ? "Resultado final do 1º turno" : "Apuração encerrada";
  const live = $("live");
  live.classList.toggle("pulso", pulso); live.classList.toggle("off", off);
  $("liveTxt").textContent = txt;
  if (!$("geral").hidden) preencherContagem($("contagem"), 2);
}

/* ---------- Abas Resultados / Mapa / Evolução (só em Presidente · Brasil, com dados) ---------- */
const ABAS = [["res","aba-res","painelRes"], ["mapa","aba-mapa","mapa"], ["evo","aba-evo","evolucao"]];
function aplicarAbas(d){
  const presBr = state.cargo==="pres" && state.uf==="br" && !!d;
  const atual = presBr ? ui.aba : "res";
  $("abas").hidden = !presBr;
  for (const [k, botao, painel] of ABAS){
    $(botao).setAttribute("aria-selected", String(k===atual)); $(botao).tabIndex = k===atual ? 0 : -1;
    $(painel).hidden = k!==atual;
  }
  // mapa, gráfico e estimativa só são calculados com a aba aberta
  if (d && atual==="evo") atualizarEvolucao(d, state.turno);
  if (d && atual==="mapa") atualizarMapa(d, state.turno, state.turno===2 && T2 ? T2.presidente.porUf : null);
}
function trocarAba(a){ ui.aba = a; aplicarAbas(ui.lastData); escreverUrl(); }
for (const [k, botao] of ABAS) $(botao).onclick = () => trocarAba(k);
$("abas").addEventListener("keydown", e => {
  if (e.key!=="ArrowLeft" && e.key!=="ArrowRight") return;
  const i = ABAS.findIndex(a => a[0]===ui.aba), n = ABAS.length;
  const prox = ABAS[(i + (e.key==="ArrowRight" ? 1 : n-1)) % n];
  trocarAba(prox[0]); $(prox[1]).focus();
  e.preventDefault();
});

/* ---------- Mudanças de filtro ---------- */
function mudouFiltro(){
  ui.openId = null; state.limite = POR_PAGINA; ui.lastData = null; geralFeito = false;
  $("list").innerHTML = ""; $("listFoot").innerHTML = ""; $("verdict").textContent = ""; $("meta").textContent = "Carregando…";
  buildUfSelect(); aplicarControles(); updateTitle(); escreverUrl(); mostrarVista();
  load();
}
function setTurno(t){
  state.turno = t;
  if (t === 2 && !CARGOS_T2.includes(state.cargo)) state.cargo = "geral";
  if (t === 1 && state.cargo === "geral") state.cargo = "pres";
  mudouFiltro();
}
function setCargo(k){ state.cargo = k; mudouFiltro(); }

const t1Atual = () => state.turno === 2 && T2 ? pctT1(T2, state.cargo, state.uf) : null;
function rerender(){
  if (ui.lastData) render(ui.lastData, t1Atual());
  else if (vista() === "disputa" && state.turno === 2 && T2) renderFinalistas(finalistas(T2, state.cargo, state.uf), t1Atual() || {});
}
ouvir("rerender", rerender);
ouvir("favs-mudou", () => { rerender(); carregarFavs(); });
ouvir("busca-abriu", () => { $("geral").hidden = true; $("disputa").hidden = true; $("decidido").hidden = true; });
ouvir("busca-fechou", mostrarVista);

// Leva para a disputa do candidato escolhido na busca e destaca a linha dele
ouvir("ir-para", r => {
  const finalista = T2 && state.turno === 2 && (finalistas(T2, r.cargo, r.uf) || []).some(c => c.id === r.id);
  state.turno = finalista ? 2 : 1;
  state.reg = "todas"; state.uf = r.uf; state.q = "";
  $("q").value = ""; $("reg").value = "todas";
  ui.destaque = r.id; ui.aba = "res";
  renderBusca();
  setCargo(r.cargo);
});
// Botões da visão geral, mapa e telas do 2º turno
ouvir("navegar", ({turno, cargo, uf}) => {
  if (turno) state.turno = turno;
  state.reg = "todas"; state.uf = uf; state.cargo = cargo; ui.aba = "res";
  mudouFiltro();
  window.scrollTo({top:0});
});

for (const b of document.querySelectorAll("[data-turno]")) b.onclick = () => setTurno(+b.dataset.turno);
for (const b of document.querySelectorAll("[data-cargo]")) b.onclick = () => setCargo(b.dataset.cargo);
$("reg").onchange = e => { state.reg = e.target.value; mudouFiltro(); };
$("uf").onchange = e => { state.uf = e.target.value; mudouFiltro(); };
let buscaTimer = null;
$("q").oninput = e => { state.q = e.target.value; reiniciarBusca(); clearTimeout(buscaTimer); buscaTimer = setTimeout(renderBusca, 250); };
$("refresh").onclick = () => { limparCache(); load(); };
// Volta ao estado inicial (favoritos são mantidos)
$("reset").onclick = () => {
  state.reg = "todas"; state.uf = "br"; state.q = "";
  $("q").value = ""; $("reg").value = "todas";
  ocultos.clear(); salvarOcultos();
  ui.aba = "res";
  renderBusca();
  state.turno = T2 ? turnoPadrao() : 1;
  state.cargo = state.turno === 2 ? "geral" : "pres";
  mudouFiltro();
};

// Link para compartilhar: quando a tela tem página própria (gerada por scripts/paginas.py), usa o link curto
// (ex.: <site>/rj/), que traz a prévia daquele estado no WhatsApp; senão, o endereço com os filtros
async function linkCompartilhar(){
  let pags = [];
  try { pags = (await localJson("paginas")).paginas || []; } catch {}
  const base = new URL(".", location.href).href;
  if (state.turno === 2 && T2){
    if (state.cargo === "geral") return base;
    if (state.cargo === "pres" && state.uf === "br" && pags.includes("presidente")) return base + "presidente/";
    const g = T2.governador[state.uf];
    const alvo = g && (g.turno2 ? state.cargo === "gov" : state.cargo === "pres");
    if (alvo && pags.includes(state.uf)) return base + state.uf + "/";
  }
  return location.href;
}

// Compartilhar: no celular abre o menu do sistema; no computador, o WhatsApp Web
$("compartilhar").onclick = async () => {
  const texto = state.cargo === "geral"
    ? "2º turno das Eleições 2026: Presidente e Governador, com as propostas de cada candidato"
    : `${cargoNome(state.cargo, state.uf)} · ${local()} · ${state.turno}º turno das Eleições 2026`;
  const link = await linkCompartilhar();
  if (navigator.share){
    try { await navigator.share({title: document.title, text: texto, url: link}); } catch {}
    return;
  }
  window.open("https://wa.me/?text=" + encodeURIComponent(`${texto}: ${link}`), "_blank", "noopener");
};

/* ---------- Início ---------- */
try { T2 = await segundoTurno(); } catch { T2 = null; }
lerUrl();
if (!T2 && state.turno === 2){ state.turno = 1; if (state.cargo === "geral") state.cargo = "pres"; }   // sem o arquivo do 2º turno, fica no 1º
buildRegSelect(); buildUfSelect(); aplicarControles(); updateTitle(); escreverUrl(); mostrarVista();
load();
tick(); setInterval(tick, 1000);
