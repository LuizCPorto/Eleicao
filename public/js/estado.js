// Estado da tela e filtros na URL (?turno=2&cargo=governador&uf=GO), para compartilhar já no estado certo
import {CARGOS, CARGOS_T2, UFS, REGIOES, TURNOS, POR_PAGINA} from "./config.js";

// cargo "geral" = visão geral do 2º turno. uf "reg" = soma da região inteira (só Presidente)
export const state = {turno:1, cargo:"pres", reg:"todas", uf:"br", q:"", limite:POR_PAGINA};
export const ui = {aba:"res", destaque:null, openId:null, lastData:null, sim:""};   // sim: simulação do 2º turno (js/simulador.js)

// Depois que o 1º turno acabou, quem chega sem filtro na URL cai na visão geral do 2º turno
export const turnoPadrao = () => Date.now() > TURNOS[1].fecha + 12*3600e3 ? 2 : 1;

const ABA_SLUG = {res:null, mapa:"mapa", evo:"evolucao", sim:"simulador"};

// O simulador tem endereço próprio (<site>/simulador/, página gerada por scripts/paginas.py com <base href="../">),
// para o Google e para a prévia no WhatsApp. RAIZ é a pasta do site nas duas páginas.
const RAIZ = new URL(".", document.baseURI).pathname;
const PAGINA_SIM = RAIZ + "simulador/";
export const naPaginaSim = () => /\/simulador\/?$/.test(location.pathname);
export const vendoSim = () => ui.aba==="sim" && state.turno===2 && state.cargo==="pres" && state.uf==="br";

export function lerUrl(){
  const p = new URLSearchParams(location.search);
  ui.sim = p.get("sim") || "";
  if (naPaginaSim()){ state.turno = 2; state.cargo = "pres"; state.reg = "todas"; state.uf = "br"; ui.aba = "sim"; return; }
  state.turno = p.get("turno")==="1" ? 1 : p.get("turno")==="2" ? 2 : turnoPadrao();
  const slug = (p.get("cargo")||"").toLowerCase();
  const cargo = Object.keys(CARGOS).find(k => CARGOS[k].slug===slug || k===slug);
  state.cargo = cargo && (state.turno===1 || CARGOS_T2.includes(cargo)) ? cargo : (state.turno===2 ? "geral" : "pres");
  const uf = (p.get("uf")||"").toLowerCase();
  const reg = (p.get("regiao")||"").toLowerCase();
  if (REGIOES[reg]) state.reg = reg;
  if (UFS.some(u => u[0]===uf)) state.uf = uf;
  else if (uf==="regiao" && state.reg!=="todas") state.uf = "reg";
  else state.uf = "br";   // o seletor de estado troca pelo primeiro estado da lista se "br" não valer para o cargo
  const aba = Object.entries(ABA_SLUG).find(([,s]) => s && s===p.get("aba"));
  ui.aba = aba ? aba[0] : "res";
}

export function escreverUrl(){
  let nova;
  if (vendoSim()) nova = PAGINA_SIM + (ui.sim ? `?sim=${ui.sim}` : "");
  else {
    const p = new URLSearchParams();
    p.set("turno", state.turno);
    if (state.cargo !== "geral"){
      p.set("cargo", CARGOS[state.cargo].slug);
      if (state.uf === "reg"){ p.set("uf", "regiao"); p.set("regiao", state.reg); }
      else if (!(state.cargo==="pres" && state.uf==="br")) p.set("uf", state.uf.toUpperCase());
      if (ABA_SLUG[ui.aba] && ui.aba!=="sim" && state.cargo==="pres" && state.uf==="br") p.set("aba", ABA_SLUG[ui.aba]);
    }
    nova = `${RAIZ}?${p}`;
  }
  if (nova !== location.pathname + location.search) history.replaceState(null, "", nova);
}
