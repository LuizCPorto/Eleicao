// Simulador do 2º turno de Presidente: a pessoa decide para onde vão os eleitores de cada candidato do 1º turno
// (e de quem votou branco, nulo ou não foi votar) e vê o resultado. Nada sai do navegador: a simulação fica só
// na URL (?sim=…), para compartilhar. Não é pesquisa nem enquete: o site não junta as simulações de ninguém.
// Neutralidade: finalistas em ordem alfabética, ponto de partida = resultado oficial do 1º turno, sem sugestões.
import {$, el, fmt, pctFmt, corPartido} from "./util.js";
import {TURNOS} from "./config.js";
import {ui, escreverUrl} from "./estado.js";

const CINZA = "#4a5272";
let fontes = null;      // grupos de eleitores do 1º turno: {chave, nome, info, votos, a, b, padrao:[a,b], linha}
let A = null, B = null; // finalistas em ordem alfabética
let urlTimer = null;

export function abrirSimulador(t2){
  if (fontes) return;
  const t1 = t2.presidente.t1;
  [A, B] = [...t2.presidente.cands].sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR"));
  const fin = new Set([A.id, B.id]);
  const pctT1 = v => pctFmt(v / t1.comparecimento * 100) + "% de quem votou";
  fontes = [
    {chave:A.n, nome:A.nome, info:`${A.partido} · ${fmt(A.votos)} votos`, votos:A.votos, padrao:[100,0], cor:corPartido(A.partido)},
    {chave:B.n, nome:B.nome, info:`${B.partido} · ${fmt(B.votos)} votos`, votos:B.votos, padrao:[0,100], cor:corPartido(B.partido)},
    ...t1.cands.filter(c => !fin.has(c.id)).map(c =>
      ({chave:c.n, nome:c.nome, info:`${c.partido} · ${fmt(c.votos)} votos (${pctFmt(c.pct)}%)`, votos:c.votos, padrao:[0,0], cor:corPartido(c.partido), pequeno:c.pct < 1})),
    {chave:"bn", nome:"Brancos e nulos", info:`${fmt(t1.brancos + t1.nulos)} votos · ${pctT1(t1.brancos + t1.nulos)}`, votos:t1.brancos + t1.nulos, padrao:[0,0], cor:CINZA},
    {chave:"ab", nome:"Não foram votar", info:`${fmt(t1.abstencao)} eleitores · ${pctFmt(t1.abstencao / t1.eleitores * 100)}% do eleitorado`, votos:t1.abstencao, padrao:[0,0], cor:CINZA}
  ];
  for (const f of fontes) [f.a, f.b] = f.padrao;
  decodificar(ui.sim);
  montar();
  atualizar();
}

/* ---------- Chamada na visão geral: o que está "em jogo" para o 2º turno ---------- */
const milhoes = n => (n / 1e6).toLocaleString("pt-BR", {maximumFractionDigits:1}) + " milhões";
export function preencherChamada(box, t2, abrir){
  const t1 = t2.presidente.t1;
  const [a, b] = [...t2.presidente.cands].sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR"));
  const outros = t1.validos - a.votos - b.votos, bn = t1.brancos + t1.nulos;
  box.innerHTML = `
    <div class="sim-chamada-txt">
      <span class="sim-chamada-eyebrow"><span class="tag">Novo</span> Simulador do 2º turno</span>
      <h2 id="simChamadaTit">Para onde vão os votos?</h2>
      <p></p>
      <button class="btn btn-destaque btn-grande">Fazer a minha simulação →</button>
      <span class="sim-chamada-nota">Monte o seu cenário e compartilhe com os amigos como imagem ou link.</span>
    </div>
    <div class="sim-chamada-graf">
      <span class="sim-chamada-rot">Eleitorado no 1º turno</span>
      <div class="sim-eleitorado" role="img"></div>
      <ul class="sim-chamada-leg"></ul>
    </div>`;
  box.querySelector("p").textContent = `${a.nome} e ${b.nome} somaram ${pctFmt(a.pct + b.pct)}% dos votos válidos no 1º turno. ` +
    `Em quem votam agora os ${milhoes(outros)} de eleitores dos outros candidatos? E os ${milhoes(t1.abstencao)} que não foram votar?`;
  const partes = [
    [a.nome, a.votos, corPartido(a.partido), ""], [b.nome, b.votos, corPartido(b.partido), ""],
    ["Outros candidatos", outros, null, "jogo"], ["Brancos e nulos", bn, null, "jogo bn"], ["Não votaram", t1.abstencao, null, "jogo ab"]
  ];
  const barra = box.querySelector(".sim-eleitorado"), leg = box.querySelector(".sim-chamada-leg");
  for (const [nome, v, cor, cls] of partes){
    const seg = el("span", cls); seg.style.width = (v / t1.eleitores * 100) + "%"; if (cor) seg.style.background = cor;
    barra.appendChild(seg);
    const li = el("li"); const k = el("i", cls); if (cor) k.style.background = cor;
    li.append(k, el("span", null, nome), el("b", null, milhoes(v)));
    leg.appendChild(li);
  }
  barra.setAttribute("aria-label", "Eleitorado no 1º turno: " + partes.map(([n, v]) => `${n}, ${milhoes(v)}`).join("; "));
  box.querySelector("button").onclick = abrir;
}

/* ---------- Simulação na URL: "55-60-15_ab-10-12" (só os grupos fora do ponto de partida) ---------- */
function codificar(){
  return fontes.filter(f => f.a !== f.padrao[0] || f.b !== f.padrao[1]).map(f => `${f.chave}-${f.a}-${f.b}`).join("_");
}
function decodificar(s){
  for (const parte of String(s || "").split("_")){
    const [k, a, b] = parte.split("-");
    const f = fontes.find(x => x.chave === k);
    if (!f || !/^\d+$/.test(a) || !/^\d+$/.test(b)) continue;
    f.a = Math.min(100, +a); f.b = Math.min(100 - f.a, +b);
  }
}

function calcular(){
  let va = 0, vb = 0;
  for (const f of fontes){ va += f.votos * f.a / 100; vb += f.votos * f.b / 100; }
  const vv = Math.round(va + vb);   // arredonda o total uma vez só, para a soma dos dois fechar
  va = Math.round(va); vb = vv - va;
  return {va, vb, vv, pa: vv ? va / vv * 100 : 0, pb: vv ? vb / vv * 100 : 0};
}

/* ---------- Tela ---------- */
function montar(){
  const box = $("simulador");
  box.innerHTML = `
    <div class="ev-top"><h2>Simule o 2º turno</h2><span class="ev-sub">Presidente · Brasil · ponto de partida: 1º turno oficial (TSE)</span></div>
    <p class="aviso-ia">Esta é a <b>sua</b> simulação, não uma pesquisa nem uma previsão. Diga para onde vão os eleitores de cada candidato do 1º turno e veja como ficaria o resultado. Nada é enviado nem guardado pelo site; a simulação fica só no link que você compartilhar.</p>
    <div class="sim-placar"></div>
    <p class="ev-resumo" id="simResumo"></p>
    <div class="sim-acoes">
      <button class="btn btn-destaque" id="simShare" hidden>Compartilhar imagem</button>
      <button class="btn" id="simBaixar">Baixar imagem</button>
      <button class="btn" id="simLink">Copiar link da simulação</button>
    </div>
    <h3>Para onde vão os eleitores</h3>
    <p class="ev-nota">Para cada grupo do 1º turno, escolha quantos por cento votariam em cada finalista. O que sobra vota branco, nulo ou não vai votar.</p>
    <div class="sim-presets">
      <button class="btn" id="simMeio">Dividir os outros candidatos meio a meio</button>
      <button class="btn btn-reset" id="simZerar">↺ Voltar ao 1º turno</button>
    </div>
    <div class="sim-fontes" id="simPrincipais"></div>
    <details class="sim-outros"><summary></summary><div class="sim-fontes" id="simOutros"></div></details>
    <p class="ev-nota">Como a conta é feita: cada finalista recebe a soma, em todos os grupos, de "votos do grupo × % escolhido". Os percentuais são sobre os votos válidos (sem brancos e nulos), como na apuração oficial. Base: resultado oficial do 1º turno de ${TURNOS[1].data}, Brasil e exterior.</p>`;

  const placar = box.querySelector(".sim-placar");
  for (const [c, lado] of [[A, "a"], [B, "b"]]){
    const d = el("div", "sim-lado");
    const nome = el("span", "name", c.nome);
    const sg = el("span", "party"); const b = el("b", null, c.partido); b.style.color = corPartido(c.partido); sg.append(`${c.n} · `, b);
    d.append(nome, sg, el("span", "p"), el("span", "v"));
    d.dataset.lado = lado;
    placar.appendChild(d);
  }
  const barra = el("div", "sim-barra");
  barra.innerHTML = `<span class="sa"></span><span class="sb"></span><i title="50% dos votos válidos"></i>`;
  barra.querySelector(".sa").style.background = corPartido(A.partido);
  barra.querySelector(".sb").style.background = corPartido(B.partido);
  placar.appendChild(barra);

  const outros = fontes.filter(f => f.pequeno);
  for (const f of fontes) (f.pequeno ? $("simOutros") : $("simPrincipais")).appendChild(linha(f));
  const somaOutros = outros.reduce((s, f) => s + f.votos, 0);
  box.querySelector(".sim-outros summary").textContent = `Outros ${outros.length} candidatos (${fmt(somaOutros)} votos, menos de 1% cada)`;
  if (!outros.length) box.querySelector(".sim-outros").hidden = true;
  else if (outros.some(f => f.a || f.b)) box.querySelector(".sim-outros").open = true;

  $("simMeio").onclick = () => {
    for (const f of fontes) if (f.padrao[0] === 0 && f.padrao[1] === 0 && !["bn","ab"].includes(f.chave)){ f.a = 50; f.b = 50; }
    sincronizar();
  };
  $("simZerar").onclick = () => { for (const f of fontes) [f.a, f.b] = f.padrao; sincronizar(); };
  $("simBaixar").onclick = () => gerarImagem(false);
  $("simLink").onclick = copiarLink;
  const teste = typeof File === "function" && new File([""], "a.png", {type:"image/png"});
  if (navigator.canShare && teste && navigator.canShare({files:[teste]})){
    $("simShare").hidden = false;
    $("simShare").onclick = () => gerarImagem(true);
  }
}

// Um grupo de eleitores: dois controles (um por finalista); a soma nunca passa de 100%
function linha(f){
  const d = el("div", "sim-fonte");
  const topo = el("div", "sim-nome");
  const chave = el("i"); chave.style.background = f.cor;
  topo.append(chave, el("b", null, f.nome));
  d.append(topo, el("span", "sim-info", f.info));
  const mini = el("div", "sim-mini");
  mini.innerHTML = `<span class="sa"></span><span class="sb"></span>`;
  mini.querySelector(".sa").style.background = corPartido(A.partido);
  mini.querySelector(".sb").style.background = corPartido(B.partido);
  d.appendChild(mini);
  const ctl = {};
  for (const [c, lado, outro] of [[A, "a", "b"], [B, "b", "a"]]){
    const lab = el("label", "sim-ctl");
    const txt = el("span"); txt.append("→ ", el("b", null, c.nome));
    const out = el("output");
    const r = el("input"); r.type = "range"; r.min = 0; r.max = 100; r.step = 1;
    r.style.accentColor = corPartido(c.partido);
    r.setAttribute("aria-label", `Eleitores de ${f.nome} que votariam em ${c.nome} (%)`);
    r.oninput = () => {
      f[lado] = +r.value;
      if (f[lado] + f[outro] > 100) f[outro] = 100 - f[lado];
      atualizarLinha(f); atualizar();
    };
    lab.append(txt, out, r);
    d.appendChild(lab);
    ctl[lado] = {r, out};
  }
  d.appendChild(el("span", "sim-resto"));
  f.linha = {d, mini, ctl};
  atualizarLinha(f);
  return d;
}

function atualizarLinha(f){
  const {d, mini, ctl} = f.linha;
  for (const lado of ["a", "b"]){
    ctl[lado].r.value = f[lado];
    ctl[lado].out.textContent = f[lado] + "%";
    ctl[lado].r.setAttribute("aria-valuetext", `${f[lado]}%`);
  }
  mini.querySelector(".sa").style.width = f.a + "%";
  mini.querySelector(".sb").style.width = f.b + "%";
  const resto = 100 - f.a - f.b;
  d.querySelector(".sim-resto").textContent = `Branco, nulo ou não vai votar: ${resto}% (${fmt(Math.round(f.votos * resto / 100))})`;
  d.classList.toggle("mudou", f.a !== f.padrao[0] || f.b !== f.padrao[1]);
}

function sincronizar(){ for (const f of fontes) atualizarLinha(f); atualizar(); }

function atualizar(){
  const r = calcular();
  const box = $("simulador");
  for (const [lado, p, v] of [["a", r.pa, r.va], ["b", r.pb, r.vb]]){
    const d = box.querySelector(`.sim-lado[data-lado="${lado}"]`);
    d.querySelector(".p").textContent = pctFmt(p) + "%";
    d.querySelector(".v").textContent = `${fmt(v)} votos`;
  }
  box.querySelector(".sim-barra .sa").style.width = r.pa + "%";
  box.querySelector(".sim-barra .sb").style.width = r.pb + "%";
  $("simResumo").textContent = resumo(r);
  // URL atualizada sem pressa: arrastar o controle dispara dezenas de eventos por segundo
  ui.sim = codificar();
  clearTimeout(urlTimer);
  urlTimer = setTimeout(escreverUrl, 250);
}

function resumo(r){
  if (!r.vv) return "Ninguém votaria em nenhum finalista nesta simulação. Mova os controles abaixo.";
  if (r.va === r.vb) return `Nesta simulação, empate: ${fmt(r.va)} votos para cada finalista.`;
  const [m, n] = r.va > r.vb ? [A, B] : [B, A];
  return `Nesta simulação, ${m.nome} teria mais votos que ${n.nome}: diferença de ${fmt(Math.abs(r.va - r.vb))} votos (${pctFmt(Math.abs(r.pa - r.pb))} pontos percentuais). Votos válidos simulados: ${fmt(r.vv)}.`;
}

/* ---------- Compartilhar ---------- */
function linkSim(){
  clearTimeout(urlTimer); escreverUrl();
  return location.href;
}

async function copiarLink(){
  const link = linkSim(), b = $("simLink");
  try { await navigator.clipboard.writeText(link); }
  catch { window.prompt("Copie o link da simulação:", link); return; }
  b.textContent = "Link copiado ✓";
  setTimeout(() => { b.textContent = "Copiar link da simulação"; }, 2000);
}

async function gerarImagem(compartilhar){
  const canvas = await desenhar();
  const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
  if (!blob) return;
  const nome = "simulacao-2-turno.png";
  if (compartilhar){
    const file = new File([blob], nome, {type:"image/png"});
    try { await navigator.share({files:[file], text:`Minha simulação do 2º turno para Presidente. Faça a sua: ${linkSim()}`}); } catch {}
    return;
  }
  const a = el("a"); a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// Imagem 1080×1350 (formato retrato, bom para WhatsApp e Instagram). Sem fotos: as do TSE não liberam uso em canvas.
async function desenhar(){
  const F = {disp:"'Barlow Condensed', 'Arial Narrow', sans-serif", body:"'IBM Plex Sans', sans-serif", mono:"'IBM Plex Mono', monospace"};
  try {
    await Promise.all([`700 80px ${F.disp}`, `600 30px ${F.disp}`, `600 28px ${F.body}`, `400 24px ${F.body}`, `500 24px ${F.mono}`].map(f => document.fonts.load(f)));
  } catch {}
  const W = 1080, H = 1350, M = 72;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  const r = calcular();
  const COR = {fg:"#f4efe3", muted:"#a9b0c6", gold:"#f0c35a", line:"#262f4d"};

  const fundo = g.createLinearGradient(0, 0, 0, H); fundo.addColorStop(0, "#070b17"); fundo.addColorStop(1, "#141b33");
  g.fillStyle = fundo; g.fillRect(0, 0, W, H);
  for (const [x, y, rad, cor] of [[100, -100, 700, "rgba(232,184,74,.13)"], [1180, 300, 650, "rgba(225,72,95,.12)"]]){
    const rg = g.createRadialGradient(x, y, 0, x, y, rad); rg.addColorStop(0, cor); rg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
  }

  const texto = (t, x, y, font, cor, {alinhar = "left", max} = {}) => {
    g.font = font; g.fillStyle = cor; g.textAlign = alinhar; g.textBaseline = "alphabetic";
    if (max){ // diminui a fonte até caber
      let tam = parseFloat(font.match(/(\d+)px/)[1]);
      while (g.measureText(t).width > max && tam > 12){ tam -= 2; g.font = font.replace(/\d+px/, tam + "px"); }
    }
    g.fillText(t, x, y);
  };

  texto(`PLACAR DA APURAÇÃO 2026 · 2º TURNO · ${TURNOS[2].curta.toUpperCase()}`, M, 104, `500 24px ${F.mono}`, COR.muted, {max: W - 2*M});
  texto("MINHA SIMULAÇÃO", M, 196, `700 92px ${F.disp}`, COR.fg);
  texto("DO 2º TURNO PARA PRESIDENTE", M, 262, `700 54px ${F.disp}`, COR.gold, {max: W - 2*M});

  // Placar: os dois finalistas lado a lado
  const colW = (W - 2*M - 40) / 2;
  [[A, r.pa, r.va], [B, r.pb, r.vb]].forEach(([c, p, v], i) => {
    const x = M + i * (colW + 40), cor = corPartido(c.partido);
    g.fillStyle = cor; g.fillRect(x, 320, colW, 8);
    texto(c.nome, x, 400, `700 60px ${F.disp}`, COR.fg, {max: colW});
    texto(`${c.n} · ${c.partido}`, x, 442, `500 26px ${F.mono}`, cor);
    texto(pctFmt(p) + "%", x, 586, `700 140px ${F.disp}`, COR.fg, {max: colW});
    texto(`${fmt(v)} votos`, x, 634, `500 26px ${F.mono}`, COR.muted);
  });
  const by = 664, bw = W - 2*M, bh = 34;
  g.fillStyle = COR.line; g.fillRect(M, by, bw, bh);
  g.fillStyle = corPartido(A.partido); g.fillRect(M, by, bw * r.pa / 100, bh);
  g.fillStyle = corPartido(B.partido); g.fillRect(M + bw - bw * r.pb / 100, by, bw * r.pb / 100, bh);
  g.fillStyle = COR.fg; g.fillRect(M + bw/2 - 2, by - 10, 4, bh + 20);
  texto("50%", M + bw/2, by + bh + 40, `500 22px ${F.mono}`, COR.muted, {alinhar:"center"});

  // De onde vieram os votos: grupos que a pessoa mudou, dos que mais pesam para os que menos pesam
  let y = 790;
  texto("DE ONDE VIERAM OS VOTOS", M, y, `600 34px ${F.disp}`, COR.muted);
  const cx = [W - M - 330, W - M - 190, W - M];
  texto(A.nome, cx[0], y, `600 24px ${F.disp}`, corPartido(A.partido), {alinhar:"right", max:130});
  texto(B.nome, cx[1], y, `600 24px ${F.disp}`, corPartido(B.partido), {alinhar:"right", max:130});
  texto("NÃO VOTA*", cx[2], y, `600 24px ${F.disp}`, COR.muted, {alinhar:"right"});
  y += 18;
  const mudados = fontes.filter(f => f.a !== f.padrao[0] || f.b !== f.padrao[1])
    .sort((x, z) => z.votos * (z.a + z.b) - x.votos * (x.a + x.b) || z.votos - x.votos);
  const MAX = mudados.length > 6 ? 5 : 6;   // cabe até 6 linhas antes do rodapé
  if (!mudados.length){
    texto("Sem transferências: cada finalista só com os próprios votos do 1º turno.", M, y + 52, `400 26px ${F.body}`, COR.fg, {max: bw});
  }
  for (const f of mudados.slice(0, MAX)){
    g.fillStyle = COR.line; g.fillRect(M, y + 12, bw, 2);
    y += 52;
    const rot = ["bn", "ab"].includes(f.chave) ? f.nome : `Eleitores de ${f.nome}`;
    texto(rot, M, y, `600 26px ${F.body}`, COR.fg, {max: cx[0] - 150 - M});
    texto(`${f.a}%`, cx[0], y, `600 28px ${F.body}`, COR.fg, {alinhar:"right"});
    texto(`${f.b}%`, cx[1], y, `600 28px ${F.body}`, COR.fg, {alinhar:"right"});
    texto(`${100 - f.a - f.b}%`, cx[2], y, `400 28px ${F.body}`, COR.muted, {alinhar:"right"});
  }
  if (mudados.length > MAX) texto(`+ ${mudados.length - MAX} outros grupos`, M, y + 46, `400 22px ${F.body}`, COR.muted);

  g.fillStyle = COR.line; g.fillRect(M, H - 190, bw, 2);
  texto("Simulação feita por um usuário. Não é pesquisa nem previsão.", M, H - 146, `400 24px ${F.body}`, COR.fg, {max: bw});
  texto(`Base: resultado oficial do 1º turno (TSE). *Branco, nulo ou abstenção.`, M, H - 110, `400 22px ${F.body}`, COR.muted, {max: bw});
  const canon = document.querySelector('link[rel="canonical"]');
  const site = canon ? new URL(canon.href).host : location.host;
  texto(`Faça a sua: ${site}`, M, H - 56, `600 34px ${F.disp}`, COR.gold, {max: bw});
  return cv;
}
