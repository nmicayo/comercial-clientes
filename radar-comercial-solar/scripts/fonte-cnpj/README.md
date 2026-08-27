# Fonte CNPJ (Dados Abertos Receita Federal)

Filtro local para gerar listas de candidatos (Perfil A e Perfil B) a partir da
base pública de CNPJ, sem gastar busca de IA por empresa.

## 1. Baixar os dados (você faz manualmente, é grátis)

Fonte oficial: https://dados.gov.br/dados/conjuntos-dados/cadastro-nacional-da-pessoa-juridica---cnpj

Baixe e descompacte, para o mês mais recente disponível:

- Todos os arquivos `Estabelecimentos*.zip` (0 a 9) — são ~10 arquivos, o Brasil inteiro é dividido entre eles, não dá pra filtrar por UF antes de baixar.
- Todos os arquivos `Empresas*.zip` (0 a 9) — para pegar razão social e porte.
- `Municipios.zip` — para traduzir o código de município em nome.

Descompacte tudo em uma pasta, ex: `~/Downloads/cnpj-aberto/`. Os arquivos
descompactados são `.csv` mas na verdade separados por `;`, sem cabeçalho,
em latin1 — o script já trata isso.

Aviso de tamanho: os `Estabelecimentos*` somados passam de 15GB descompactados.
Não precisa baixar tudo de uma vez — pode processar arquivo por arquivo e ir
acumulando o CSV de saída (o script tem `--out` em modo append).

## 2. Conferir os CNAEs em `cnaes.json`

Os códigos de CNAE em `cnaes.json` são um ponto de partida, **não confirmados
um a um**. Antes de rodar de verdade, confira/ajuste na tabela oficial:
https://concla.ibge.gov.br/busca-online-cnae.html — busque pelos nichos dos
clientes-espelho de cada perfil (ver `contexto/clientes-espelho.md`) e pelos
nichos em `inteligencia/nichos-prioritarios.md`.

## 3. Rodar o filtro

```bash
# Perfil A (solar), um arquivo de estabelecimentos por vez
node --experimental-strip-types scripts/fonte-cnpj/filtrar-cnpj.ts \
  --perfil=a \
  --estabelecimentos ~/Downloads/cnpj-aberto/Estabelecimentos0.csv \
  --empresas ~/Downloads/cnpj-aberto/Empresas0.csv \
  --municipios ~/Downloads/cnpj-aberto/Municipios.csv \
  --out data/candidatos-cnpj-perfil-a.csv

# repetir trocando Estabelecimentos0 -> Estabelecimentos1, 2, ... 9
# (o --out é append, então vai acumulando um único CSV final)
```

Trocar `--perfil=a` por `--perfil=b` para o Perfil B (industrial/agro/bebidas).

## 4. Saída

Um CSV em `data/` com: CNPJ, razão social, nome fantasia, UF, município, CNAE
principal, CEP, telefone, email. Isso vira o ponto de partida da etapa de
qualificação — filtra ruído mecanicamente, sem IA lendo site por site.
