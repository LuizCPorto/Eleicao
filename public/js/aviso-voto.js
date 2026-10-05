// Aviso neutro de incentivo ao voto no 2º turno: aparece até o fim da votação e some de vez quando a pessoa fecha
import {TURNOS} from "./config.js";
import {$, ler, gravar} from "./util.js";

const CHAVE = "aviso-voto-2t-fechado";

export function iniciarAvisoVoto(){
  const box = $("avisoVoto");
  if (!box || Date.now() >= TURNOS[2].fecha || ler(CHAVE, false)) return;
  box.hidden = false;
  $("avisoVotoFechar").addEventListener("click", () => { box.hidden = true; gravar(CHAVE, true); });
  // Quem deixa a página aberta até as 17h do dia 25 também vê o aviso sumir
  setTimeout(() => { box.hidden = true; }, Math.min(TURNOS[2].fecha - Date.now(), 2**31 - 1));
}
