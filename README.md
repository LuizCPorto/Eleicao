<<<<<<< HEAD
# Eleicao
=======
# Placar da Apuração 2026

Site estático que acompanha as Eleições Gerais 2026 com os dados oficiais do TSE: resultados do 1º turno (todos os cargos), visão geral do 2º turno (Presidente e Governador), propostas de governo dos finalistas e apuração ao vivo.

Não tem etapa de build: HTML, CSS e módulos JavaScript servidos como estão. **Só a pasta `public/` vai para o ar**; o resto (scripts, README, atalho) fica só no repositório.

## Rodar no computador

Não abra o `index.html` com duplo clique: o navegador bloqueia os módulos e os dados em endereços `file://` (a página fica parada em "Carregando…").

- **Windows:** dê duplo clique em `abrir-site.bat`. Ele sobe um servidor local e abre http://localhost:8000. Para parar, feche a janela preta.
- **Qualquer sistema:** `python -m http.server 8000 --directory public` na pasta do projeto e abra http://localhost:8000.
- **VS Code:** a extensão Live Server também funciona (abra `public/index.html`).

## Estrutura

```
public/                 TUDO o que vai para o ar (pasta publicada na Cloudflare)
  index.html            marcação da página e tags de compartilhamento (Open Graph)
  404.html              página de endereço inexistente
  _headers              cabeçalhos de segurança e cache da Cloudflare
  css/estilo.css
  js/
    main.js             liga tudo: filtros, carregamento, abas, contador, compartilhar
    config.js           códigos de eleição do TSE por turno, datas, cargos, estados, cores
    estado.js           estado da tela e filtros na URL
    dados.js            busca no TSE, plano B (último dado salvo), arquivos locais
    lista.js            lista de candidatos
    segundo-turno.js    visão geral, duelos, estado decidido, propostas
    contador.js         contagem regressiva
    mapa.js, evolucao.js, busca.js, favoritos.js, patrimonio.js, util.js
  dados/
    segundo-turno.json  quem disputa o 2º turno e o resultado do 1º (gerado por script)
    propostas.json      índice dos PDFs de propostas (gerado por script)
    paginas.json        páginas de compartilhamento existentes (gerado por script)
    resumos.json        resumo opcional das propostas por tema (preenchido à mão)
    indice.json         índice de candidatos para a busca
    bens.json           bens declarados (dados abertos do TSE)
    mapa.json           contornos dos estados
  propostas/            PDFs oficiais das propostas dos finalistas
  img/                  favicon e imagens de compartilhamento
  ac/ … to/, presidente/  páginas de compartilhamento (geradas por scripts/paginas.py)
scripts/                geradores de dados, páginas e imagens (não vão para o ar)
material/               material de apoio fora do site (ex.: resumo das propostas em PDF)
abrir-site.bat          abre o site no computador (Windows)
```

## Filtros na URL

Todo filtro vai para o endereço, então o link compartilhado abre na mesma tela:

- `?turno=2`: visão geral do 2º turno
- `?turno=2&cargo=governador&uf=RJ`
- `?turno=2&cargo=presidente&uf=GO`
- `?turno=1&cargo=senador&uf=SP`
- `?turno=2&cargo=presidente&aba=mapa` (abas: `mapa`, `evolucao`)

Sem `turno` na URL, o site abre no 2º turno (depois que o 1º acabou).

## Códigos de eleição do TSE

Conferidos em `https://resultados.tse.jus.br/oficial/comum/config/ele-c.json` (campo `cdt2` = código do 2º turno):

| | 1º turno | 2º turno |
|---|---|---|
| Presidente (federal) | 6257 | 6258 |
| Governador e demais (estadual) | 6259 | 6260 |

Ficam em `js/config.js` (`ELEICOES`). O site troca o código da URL conforme o turno escolhido.

## Publicar na Cloudflare Pages

1. Suba o repositório para o GitHub.
2. Na Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**, escolha o repositório e configure:
   - **Framework preset:** None
   - **Build command:** deixe em branco
   - **Build output directory:** `public`
3. Depois do primeiro deploy, pegue o endereço (`https://<projeto>.pages.dev` ou o domínio próprio) e gere as páginas de compartilhamento com ele:
   ```
   python scripts/paginas.py https://<projeto>.pages.dev --imagens
   ```
   Isso preenche as tags de prévia do `index.html` e cria uma página por estado (`<site>/rj/`, `<site>/go/`…) e `<site>/presidente/`, cada uma com título, descrição e imagem próprios. O WhatsApp não roda JavaScript, então só assim cada estado tem a sua prévia. O botão Compartilhar usa esses links curtos automaticamente. Faça commit e push: a Cloudflare publica de novo sozinha. (Os arquivos atuais foram gerados com o endereço provisório `https://luizcporto.github.io/placar/` e **precisam** ser regerados.)
4. Teste a prévia em https://developers.facebook.com/tools/debug/ (o WhatsApp usa o mesmo leitor).

Limites conferidos: a maior parte do peso são os PDFs das propostas (cerca de 90 MB; o maior arquivo tem 10 MB). A Cloudflare Pages aceita arquivos de até 25 MB e o GitHub, até 100 MB.

## Checklist para o 2º turno (25/10)

- Na semana da votação, confira de novo no `ele-c.json` se os códigos 6258/6260 continuam os mesmos.
- Se o TSE corrigir algum resultado do 1º turno: `python scripts/segundo_turno.py` (atualiza `public/dados/segundo-turno.json`).
- Para atualizar os PDFs das propostas: `python scripts/propostas.py`.
- Depois de rodar `segundo_turno.py`, rode também `paginas.py` (as prévias usam os nomes dos candidatos).
- Antes de 25/10 o site não pede os arquivos do 2º turno ao TSE (eles ainda não existem). A partir das 8h do dia 25 passa a pedir; quando a apuração começa, mostra o placar ao vivo com o resultado do 1º turno ao lado.

Os scripts só usam a biblioteca padrão do Python.

## Plano B (TSE fora do ar)

Cada resposta do TSE (Presidente, Governador e Senador) fica salva no navegador do visitante. Se o TSE não responder em 12 segundos ou der erro, o site mostra o último dado salvo com o horário ("atualizado às 19h42") e continua tentando. Quem nunca abriu o site antes não tem cópia salva; nesse caso aparece o aviso com o link do app oficial do TSE.

## Propostas e neutralidade

- Os PDFs em `public/propostas/` são cópias sem alteração dos dados abertos do TSE (`proposta_governo_2026`).
- Os dois candidatos de cada disputa aparecem sempre em ordem alfabética, com os mesmos campos e o mesmo tamanho, e antes da apuração ninguém aparece como líder.
- O resumo por tema (`public/dados/resumos.json`) só aparece quando os **dois** candidatos da disputa têm **todos** os temas preenchidos. Use os mesmos temas, textos de tamanho parecido, revise contra o PDF e, se usar IA, explique em `aviso` (o texto aparece na página).

## Anúncios

Nenhum anúncio pode ser de candidato, partido ou coligação: propaganda eleitoral paga na internet é bem restrita (Lei 9.504/97, art. 57-C).

## Imagens de compartilhamento

`public/img/compartilhar.png` e `public/img/compartilhar/<uf>.png` (1200×630) são prints de `scripts/imagem-compartilhar.html`, gerados pelo `paginas.py --imagens` com o Edge ou o Chrome. São neutros: sem foto, nomes em ordem alfabética.
>>>>>>> 3848752 (Segundo turno)
