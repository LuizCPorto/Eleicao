// Funções pequenas usadas em toda a página
import {UFS, CARGOS, CORES, BASE, ELEICOES} from "./config.js";

export const $ = id => document.getElementById(id);
export const fmt = n => Number(n||0).toLocaleString("pt-BR");
export const num = s => parseFloat(String(s||"0").replace(",", ".")) || 0;
export const pctFmt = n => n.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
export const brl = n => Number(n||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
export const ufNome = uf => (UFS.find(u=>u[0]===uf)||[])[1];
export const semAcento = s => String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
export const corPartido = sg => CORES[(sg||"").toUpperCase()] || CORES[sg] || "#8a93ad";
export const hora = t => new Date(t).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}).replace(":", "h");
export const mb = b => (b/1048576).toLocaleString("pt-BR",{maximumFractionDigits:1}) + " MB";
export const reduzMovimento = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// FLAVIO BOLSONARO -> Flavio Bolsonaro (o TSE publica o nome de urna em maiúsculas; igual ao nome() de scripts/paginas.py)
const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e"]);
export const nomeProprio = n => String(n||"").toLowerCase().split(/\s+/)
  .map((p, i) => i && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)).join(" ");

export function cargoNome(cargo, uf){ return cargo==="est" && uf==="df" ? "Deputado Distrital" : CARGOS[cargo].nome; }

// As fotos ficam na pasta do 1º turno (o candidato é o mesmo nos dois turnos)
export function fotoUrl(cargo, uf, id){
  const ele = ELEICOES[1][CARGOS[cargo].grupo];
  return `${BASE}/${ele}/fotos/${cargo==="pres" || uf==="reg" || uf==="zz" ? "br" : uf}/${id}.jpeg`;
}

export function bandeira(uf, cls){
  // Brasil e região usam a bandeira nacional; exterior usa um globo
  if (uf === "zz"){ const s=document.createElement("span"); s.className=cls+" globo"; s.textContent="🌐"; s.setAttribute("aria-hidden","true"); return s; }
  const img = document.createElement("img"); img.className = cls; img.alt = "";
  img.src = (uf==="br"||uf==="reg") ? "https://flagcdn.com/w160/br.png" : `https://cdn.jsdelivr.net/gh/bgeneto/bandeiras-br/imagens/${uf.toUpperCase()}.png`;
  img.onerror = () => img.remove();
  return img;
}
export function semFoto(img){ img.onerror = () => { img.removeAttribute("src"); img.alt = ""; }; }

export function el(tag, cls, txt){
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}

const NS = "http://www.w3.org/2000/svg";
export function svgEl(tag, attrs, pai){
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (pai) pai.appendChild(e);
  return e;
}

// Tabela simples com cabeçalho; uma coluna pode ter a chave de cor da série
export function cabecalho(tabela, colunas){
  const tr = document.createElement("tr");
  for (const c of colunas){
    const th = document.createElement("th");
    if (c.cor){ const k = el("i", "chave"); k.style.background = c.cor; th.appendChild(k); }
    th.append(c.txt); tr.appendChild(th);
  }
  const thead = document.createElement("thead"); thead.appendChild(tr); tabela.appendChild(thead);
}

/* Guardado só neste navegador (ocultos, favoritos, histórico, último dado do TSE) */
export function ler(k, d){ try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }
export function gravar(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }

// Avisa as outras partes da página (evita que os módulos dependam uns dos outros em círculo)
export const avisar = (nome, detail) => document.dispatchEvent(new CustomEvent(nome, {detail}));
export const ouvir = (nome, fn) => document.addEventListener(nome, e => fn(e.detail));
