# Painel Meta Ads na Netlify

Este projeto tem o painel e as funções seguras de conexão com a Meta.

## Variáveis da Netlify

Adicione em **Project configuration > Environment variables**:

- `META_APP_ID` = `1373978294671226`
- `META_APP_SECRET` = a chave secreta do seu app da Meta
- `META_REDIRECT_URI` = `https://elaborate-churros-3b32d3.netlify.app/.netlify/functions/meta-callback`
- `TOKEN_ENCRYPTION_KEY` = uma frase longa e privada criada por você (ex.: 40+ caracteres)

## Meta for Developers

Em **Facebook Login para Empresas > Configurações**:

- URI de redirecionamento OAuth válido: `https://elaborate-churros-3b32d3.netlify.app/.netlify/functions/meta-callback`

Em **Configurações do app > Básico**:

- Domínios do app: `elaborate-churros-3b32d3.netlify.app`

## Publicação

As funções precisam de um deploy de projeto (por GitHub ou Netlify CLI). O upload isolado de um HTML não publica funções. Depois de publicar, clique em **Conectar Meta Ads** no painel.
