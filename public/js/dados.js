// Busca e normalização dos dados do TSE, com plano B: se o TSE cair ou demorar, usa o último dado salvo neste navegador
import {BASE, CARGOS, ELEICOES, UFS, REFRESH_MS, TIMEOUT_MS} from "./config.js";
import {num, ler, gravar} from "./util.js";

export function eleicao(cargo, turno){ return ELEICOES[turno][CARGOS[cargo].grupo]; }

export function url(cargo, uf, turno){
  const c = CARGOS[cargo], ele = eleicao(cargo, turno);
  const cd = cargo==="est" && uf==="df" ? "0008" : c.cd;
  return `${BASE}/${ele}/dados/${uf}/${uf}-c${cd}-e00${ele}-u.json`;
}

/* ---------- Último dado salvo ---------- */
// Guarda só arquivos pequenos (Presidente, Governador, Senador); os de deputado passam de 100 KB e lotariam o armazenamento
const CACHE_PREFIXO = "tse:";
const CACHE_MAX_CHARS = 120000;
function salvarCache(u, texto){
  if (texto.length > CACHE_MAX_CHARS) return;
  const item = {t: Date.now(), texto};
  if (gravar(CACHE_PREFIXO+u, item)) return;
  // Armazenamento cheio: apaga os mais antigos e tenta de novo
  try {
    const chaves = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIXO))
      .map(k => [k, (ler(k, {}).t)||0]).sort((a,b) => a[1]-b[1]);
    for (const [k] of chaves.slice(0, Math.ceil(chaves.length/2))) localStorage.removeItem(k);
    gravar(CACHE_PREFIXO+u, item);
  } catch {}
}
function lerCache(u){
  const c = ler(CACHE_PREFIXO+u, null);
  if (!c || !c.texto) return null;
  try { return {j: JSON.parse(c.texto), t: c.t}; } catch { return null; }
}

export class ErroTSE extends Error {
  constructor(msg, status){ super(msg); this.status = status; }
}

// Devolve o JSON do TSE. Se falhar (rede, timeout, erro do servidor) e houver cópia salva, devolve a cópia
// com a marca __cache (horário em que foi salva). 404 não usa a cópia: significa que o arquivo ainda não existe.
export async function getJson(u){
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(u, {cache:"no-cache", signal:ctl.signal});
    if (r.status === 404) throw new ErroTSE("ainda não publicado", 404);
    if (!r.ok) throw new ErroTSE("HTTP "+r.status, r.status);
    const texto = await r.text();
    const j = JSON.parse(texto);
    salvarCache(u, texto);
    return j;
  } catch (err){
    if (err.status === 404) throw err;
    const c = lerCache(u);
    if (c){ c.j.__cache = c.t; return c.j; }
    throw err.name === "AbortError" ? new ErroTSE("o TSE demorou demais para responder") : err;
  } finally { clearTimeout(t); }
}

/* ---------- Formato comum ---------- */
export function candidatos(j){
  const out = [];
  for (const cargo of (j.carg||[]))
    for (const agr of (cargo.agr||[]))
      for (const par of (agr.par||[]))
        for (const c of (par.cand||[]))
          out.push({id:c.sqcand, nome:c.nmu||c.nm, n:c.n, partido:par.sg, coligacao:agr.tp==="c"?agr.nm:"", votos:+c.vap||0, pct:num(c.pvap),
            // o TSE marca e="s" também para quem vai ao 2º turno; só é eleito se a situação não for "2º turno"
            eleito:c.e==="s" && !/2º turno/i.test(c.st||""), turno2:/2º turno/i.test(c.st||""), st:c.st||""});
  return out.sort((a,b)=> b.votos-a.votos || a.nome.localeCompare(b.nome));
}

// Um estado
export function normalizar(j){
  const s = j.s||{}, v = j.v||{}, e = j.e||{};
  return {cands:candidatos(j), pst:num(s.pst), st:+s.st||0, ts:+s.ts||0, vv:+v.vv||0, vagas:+((j.carg||[])[0]||{}).nv||0,
          pvb:num(v.pvb), pvn:num(v.ptvn||v.pvn), pabs:num(e.pa), dt:j.dt, ht:j.ht, fim:j.and==="f", cache:j.__cache||null};
}

// Soma os JSONs dos estados de uma região (Presidente: mesmo candidato em todos os estados)
export function somar(js){
  const t = {st:0, ts:0, vv:0, tv:0, vb:0, tvn:0, c:0, a:0};
  const cand = new Map();
  let ultimo = null, cache = null;
  for (const j of js){
    const s=j.s||{}, v=j.v||{}, e=j.e||{};
    t.st+=+s.st||0; t.ts+=+s.ts||0; t.vv+=+v.vv||0; t.tv+=+v.tv||0; t.vb+=+v.vb||0; t.tvn+=+v.tvn||0; t.c+=+e.c||0; t.a+=+e.a||0;
    for (const c of candidatos(j)){
      const x = cand.get(c.id);
      if (x) x.votos += c.votos; else cand.set(c.id, {...c});
    }
    if (j.dt){
      const k = j.dt.split("/").reverse().join("")+j.ht;
      if (!ultimo || k > ultimo.k) ultimo = {k, dt:j.dt, ht:j.ht};
    }
    if (j.__cache) cache = Math.min(cache ?? Infinity, j.__cache);
  }
  const cands = [...cand.values()];
  for (const c of cands) c.pct = t.vv ? c.votos/t.vv*100 : 0;
  cands.sort((a,b)=> b.votos-a.votos || a.nome.localeCompare(b.nome));
  return {cands, st:t.st, ts:t.ts, vv:t.vv,
          pst: t.ts ? t.st/t.ts*100 : 0,
          pvb: t.tv ? t.vb/t.tv*100 : 0,
          pvn: t.tv ? t.tvn/t.tv*100 : 0,
          pabs: (t.c+t.a) ? t.a/(t.c+t.a)*100 : 0,
          dt: ultimo&&ultimo.dt, ht: ultimo&&ultimo.ht,
          fim: js.every(j=>j.and==="f"), nEstados: js.length, cache};
}

// Uma disputa (cargo + UF + turno), com cache curto para o painel de favoritos não buscar o mesmo arquivo duas vezes
const raceCache = new Map();
const ouvintes = [];
export const aoBaixarPresBr = fn => ouvintes.push(fn);
export async function disputa(cargo, uf, turno){
  const k = cargo+"|"+uf+"|"+turno, c = raceCache.get(k);
  if (c && Date.now()-c.t < REFRESH_MS-5000) return c.d;
  const d = normalizar(await getJson(url(cargo, uf, turno)));
  raceCache.set(k, {t:Date.now(), d});
  if (cargo==="pres" && uf==="br" && !d.cache) for (const fn of ouvintes) fn(d, turno);
  return d;
}
export const limparCache = () => { raceCache.clear(); estCache.clear(); };
export const esquecer = (cargo, uf, turno) => raceCache.delete(cargo+"|"+uf+"|"+turno);

// Arquivos de Presidente de cada UF + exterior (mapa, estimativa e tabela por região)
const estCache = new Map();
export async function presPorUf(turno){
  const c = estCache.get(turno);
  if (c && Date.now()-c.t < REFRESH_MS-5000) return c.js;
  const ufs = UFS.map(u=>u[0]).filter(u => u!=="br");
  const js = await Promise.all(ufs.map(uf => getJson(url("pres", uf, turno)).then(j => [uf, j])));
  estCache.set(turno, {t:Date.now(), js});
  return js;
}

/* ---------- Arquivos do próprio site (pasta dados/), baixados só quando forem usados ---------- */
const locais = new Map();
export function local(nome){
  if (!locais.has(nome)) locais.set(nome, fetch(`dados/${nome}.json`).then(r => { if (!r.ok) throw new Error(nome); return r.json(); })
    .catch(err => { locais.delete(nome); throw err; }));
  return locais.get(nome);
}
