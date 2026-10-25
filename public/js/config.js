// Configuração geral: endereços do TSE, códigos de eleição por turno, cargos, estados e cores

export const BASE = "https://resultados.tse.jus.br/oficial/ele2026";
export const CAND_SITE = "https://divulgacandcontas.tse.jus.br/divulga/#/home";
export const APP_TSE = "https://resultados.tse.jus.br/oficial/app/index.html";

// Códigos de eleição do TSE (conferidos em resultados.tse.jus.br/oficial/comum/config/ele-c.json, campo "cdt2").
// O TSE separa a eleição federal (Presidente) da estadual (Governador, Senador, Deputados), e cada turno tem o seu código.
export const ELEICOES = {
  1: {pres:"6257", est:"6259"},
  2: {pres:"6258", est:"6260"}
};

// Datas em UTC. Votação das 8h às 17h, horário de Brasília (UTC−3) em todo o país.
export const TURNOS = {
  1: {data:"4 de outubro",  curta:"4/out",  abre:Date.UTC(2026, 9, 4, 11),  fecha:Date.UTC(2026, 9, 4, 20)},
  2: {data:"25 de outubro", curta:"25/out", abre:Date.UTC(2026, 9, 25, 11), fecha:Date.UTC(2026, 9, 25, 20)}
};

export const UFS = [["br","Brasil"],["ac","Acre"],["al","Alagoas"],["ap","Amapá"],["am","Amazonas"],["ba","Bahia"],["ce","Ceará"],["df","Distrito Federal"],["es","Espírito Santo"],["go","Goiás"],["ma","Maranhão"],["mt","Mato Grosso"],["ms","Mato Grosso do Sul"],["mg","Minas Gerais"],["pa","Pará"],["pb","Paraíba"],["pr","Paraná"],["pe","Pernambuco"],["pi","Piauí"],["rj","Rio de Janeiro"],["rn","Rio Grande do Norte"],["rs","Rio Grande do Sul"],["ro","Rondônia"],["rr","Roraima"],["sc","Santa Catarina"],["sp","São Paulo"],["se","Sergipe"],["to","Tocantins"],["zz","Exterior"]];
// Eleitores no exterior (zz) votam só para Presidente; "br" já soma Brasil + exterior
export const SO_PRESIDENTE = ["br","zz"];
export const REGIOES = {
  todas:{nome:"Todas as regiões"},
  n:  {nome:"Norte",        ufs:["ac","am","ap","pa","ro","rr","to"]},
  ne: {nome:"Nordeste",     ufs:["al","ba","ce","ma","pb","pe","pi","rn","se"]},
  co: {nome:"Centro-Oeste", ufs:["df","go","ms","mt"]},
  se: {nome:"Sudeste",      ufs:["es","mg","rj","sp"]},
  s:  {nome:"Sul",          ufs:["pr","rs","sc"]}
};

// grupo: qual código de eleição usar (federal ou estadual). slug: como o cargo aparece na URL.
export const CARGOS = {
  pres:{nome:"Presidente",        grupo:"pres", cd:"0001", slug:"presidente"},
  gov: {nome:"Governador",        grupo:"est",  cd:"0003", slug:"governador"},
  sen: {nome:"Senador",           grupo:"est",  cd:"0005", slug:"senador"},
  fed: {nome:"Deputado Federal",  grupo:"est",  cd:"0006", slug:"deputado-federal"},
  est: {nome:"Deputado Estadual", grupo:"est",  cd:"0007", slug:"deputado-estadual"}   // no DF é Deputado Distrital (0008)
};
// No 2º turno só há Presidente e Governador
export const CARGOS_T2 = ["pres","gov"];

// Cores dos partidos (tons clareados para aparecer no fundo escuro)
export const CORES = {
  "PT":"#e5333b","PL":"#3d63d6","UNIÃO":"#3f51c9","PSD":"#f2a541","MDB":"#2fae66","PP":"#2f8fd8","REPUBLICANOS":"#3aa0ff",
  "PSDB":"#4d9fff","PSB":"#f6b93b","PDT":"#e04b5a","PSOL":"#f5c518","PC do B":"#d8323c","PCDOB":"#d8323c","NOVO":"#f37021",
  "PODE":"#38c172","AVANTE":"#22b8e6","SOLIDARIEDADE":"#ff8c1a","REDE":"#1fb5ad","PV":"#4caf50","CIDADANIA":"#e83e8c",
  "PRD":"#5b8def","MISSÃO":"#9b6bff","UP":"#ff5c5c","DC":"#4a78e0","PSTU":"#e53935","PCB":"#e53935","PCO":"#e53935",
  "AGIR":"#ff9f43","MOBILIZA":"#26c6da","PMB":"#ec7ab8","DEMOCRATA":"#5c7cfa"
};

export const REFRESH_MS = 30000;          // atualização durante a apuração
export const REFRESH_LENTO_MS = 300000;   // apuração encerrada ou ainda sem dados: confere a cada 5 minutos
export const POR_PAGINA = 60;
export const TIMEOUT_MS = 12000;          // sem resposta do TSE em 12 s, usa o último dado salvo
