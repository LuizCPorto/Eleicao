// Contagem regressiva e fase do dia de votação
import {TURNOS} from "./config.js";

// "antes" da abertura das urnas, "votacao" (8h às 17h de Brasília) ou "apuracao" (depois das 17h)
export function fase(turno, agora = Date.now()){
  const T = TURNOS[turno];
  return agora < T.abre ? "antes" : agora < T.fecha ? "votacao" : "apuracao";
}

export function faltam(alvo, agora = Date.now()){
  const ms = Math.max(0, alvo - agora);
  return {d: Math.floor(ms/864e5), h: Math.floor(ms/36e5)%24, m: Math.floor(ms/6e4)%60, s: Math.floor(ms/1e3)%60};
}

const plural = (n, um, varios) => `${n} ${n===1 ? um : varios}`;

// Texto curto para o topo da página
export function textoCurto(turno){
  const f = faltam(TURNOS[turno].abre);
  if (f.d >= 1) return `Faltam ${plural(f.d, "dia", "dias")} e ${f.h}h para o ${turno}º turno`;
  if (f.h >= 1) return `Faltam ${f.h}h${String(f.m).padStart(2,"0")} para abrir a votação`;
  return `Faltam ${plural(f.m, "minuto", "minutos")} para abrir a votação`;
}

// Contagem grande da visão geral (dias, horas, minutos, segundos)
export function preencherContagem(box, turno){
  const fs = fase(turno);
  const T = TURNOS[turno];
  if (fs === "antes"){
    const f = faltam(T.abre);
    box.dataset.fase = "antes";
    box.querySelector(".cont-num").innerHTML = [[f.d,"dias"],[f.h,"horas"],[f.m,"min"],[f.s,"seg"]]
      .map(([v, r]) => `<div><b>${String(v).padStart(2,"0")}</b><span>${r}</span></div>`).join("");
    box.querySelector(".cont-txt").textContent = `para a abertura das urnas do 2º turno: domingo, ${T.data}, das 8h às 17h (horário de Brasília). Leve um documento oficial com foto; o título é opcional.`;
  } else if (fs === "votacao"){
    const f = faltam(T.fecha);
    box.dataset.fase = "votacao";
    box.querySelector(".cont-num").innerHTML = `<div class="cont-msg"><b>Votação em andamento</b><span>as urnas fecham em ${f.h}h${String(f.m).padStart(2,"0")}min</span></div>`;
    box.querySelector(".cont-txt").textContent = "A apuração começa às 17h (horário de Brasília). Os primeiros resultados costumam aparecer em poucos minutos.";
  } else {
    box.dataset.fase = "apuracao";
    box.querySelector(".cont-num").innerHTML = `<div class="cont-msg"><b>Apuração do 2º turno</b><span>resultados oficiais do TSE, atualizados a cada 30 segundos</span></div>`;
    box.querySelector(".cont-txt").textContent = "";
  }
}
