# Como subir o projeto pro GitHub (pelo VS Code)

## 0. Pré-requisitos

1. Ter o **Git** instalado na sua máquina. Pra checar, abra o terminal do VS Code (menu **Terminal** → **New Terminal**, ou atalho `` Ctrl+` `` no Windows/Linux e `` Cmd+` `` no Mac) e rode:
   ```
   git --version
   ```
   Se aparecer algo tipo `git version 2.43.0`, está instalado. Se der erro de comando não encontrado, baixe em **git-scm.com** e instale antes de continuar.

2. Ter uma conta no **github.com** (se ainda não tem, crie — é grátis).

## 1. Abrir a pasta do projeto no VS Code

1. Abra o VS Code.
2. Menu **File** → **Open Folder...** (ou **Arquivo** → **Abrir Pasta...**).
3. Selecione a pasta `futebol-analise` (a que você extraiu do zip).
4. O VS Code vai recarregar mostrando os arquivos do projeto na barra lateral esquerda.

## 2. Criar o repositório vazio no GitHub

1. Acesse **github.com** e faça login.
2. No canto superior direito, clique no ícone **+** → **New repository**.
3. Em **Repository name**, digite `futebol-analise` (ou o nome que preferir).
4. Deixe **Public** ou **Private**, como você quiser — não muda nada no funcionamento do site.
5. **Não marque** nenhuma das opções "Add a README file", "Add .gitignore" ou "Choose a license" — o projeto já tem esses arquivos, e marcar isso aqui pode gerar conflito depois.
6. Clique em **Create repository**.
7. Na próxima tela, o GitHub mostra um link parecido com:
   ```
   https://github.com/SEU-USUARIO/futebol-analise.git
   ```
   Copie esse link (tem um botão de copiar do lado). Você vai usar ele no passo 4.

## 3. Iniciar o Git dentro do projeto (terminal do VS Code)

Com o terminal do VS Code aberto (dentro da pasta `futebol-analise`), rode os comandos **um de cada vez**, apertando Enter depois de cada um:

```
git init
```
Isso transforma a pasta num repositório Git local (cria uma pasta oculta `.git`).

```
git add .
```
Isso marca todos os arquivos do projeto pra serem incluídos no primeiro commit.

```
git commit -m "primeiro commit"
```
Isso salva um "instantâneo" do projeto no histórico do Git. Se for a primeira vez que você usa o Git nessa máquina, pode aparecer um erro pedindo pra configurar nome e email — nesse caso, rode:
```
git config --global user.name "Seu Nome"
git config --global user.email "seu-email@exemplo.com"
```
(troque pelos seus dados — pode ser o mesmo email da sua conta do GitHub) e depois rode o `git commit -m "primeiro commit"` de novo.

```
git branch -M main
```
Isso garante que a branch principal se chama `main` (padrão atual do GitHub).

## 4. Conectar ao repositório do GitHub e enviar

```
git remote add origin https://github.com/SEU-USUARIO/futebol-analise.git
```
Troque a URL pela que você copiou no passo 2.7.

```
git push -u origin main
```
Esse comando envia o projeto pro GitHub. Na primeira vez, o VS Code (ou o próprio terminal) deve abrir uma janela pedindo pra você **autorizar o acesso via navegador** — clique em **Authorize** ou faça login com sua conta do GitHub. Depois disso o envio continua sozinho.

Se em vez disso aparecer um pedido de **usuário e senha** no terminal (login/senha direto não funciona mais no GitHub): use seu nome de usuário do GitHub como "usuário", e no campo de "senha" cole um **Personal Access Token** em vez da sua senha normal. Pra gerar um token: **github.com** → clique na sua foto (canto superior direito) → **Settings** → **Developer settings** (final do menu lateral) → **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)** → marque a opção **repo** → **Generate token** → copie o token gerado (ele só aparece uma vez) e cole quando o terminal pedir a senha.

## 5. Conferir

1. Acesse `https://github.com/SEU-USUARIO/futebol-analise` no navegador.
2. Você deve ver todos os arquivos do projeto (`index.html`, `app.js`, `style.css`, pasta `api/`, `README.md`, etc.).

## Atualizando depois de mudanças futuras

Toda vez que você (ou eu) mudar algo no projeto, pra subir a atualização pro GitHub, dentro do terminal do VS Code:

```
git add .
git commit -m "descreva o que mudou aqui"
git push
```

Se o site estiver conectado à Vercel via GitHub (Caminho A do guia de deploy no `README.md`), esse `git push` já dispara um novo deploy automático — não precisa fazer mais nada.

## Dica: usar a aba "Source Control" do VS Code em vez do terminal

Depois do primeiro `git push` (feito uma vez pelo terminal), dá pra fazer as próximas atualizações sem digitar comando nenhum:

1. Clique no ícone de **Source Control** na barra lateral esquerda do VS Code (parece um garfo/ramificação — ou atalho `Ctrl+Shift+G`).
2. Os arquivos alterados aparecem numa lista. Passe o mouse sobre cada um e clique no **+** pra "stagear" (ou clique no **+** ao lado de "Changes" pra marcar todos de uma vez).
3. Digite uma mensagem descrevendo a mudança na caixa de texto no topo.
4. Clique no botão **Commit** (✓).
5. Clique em **Sync Changes** (ou **Push**) pra enviar pro GitHub.
