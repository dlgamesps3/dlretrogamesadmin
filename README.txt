DL RETRO GAMES — PAINEL ADMINISTRATIVO (VERSÃO INICIAL)

O QUE TEM NESTE ZIP
- Painel visual azul neon.
- Login administrativo por sessão segura (cookie HttpOnly).
- Geração automática de usuário e senha.
- Senhas dos clientes armazenadas com hash PBKDF2.
- Lista de usuários, plano, validade e status.
- Ações para bloquear/liberar, renovar por 30 dias e excluir.
- Endpoint de validação de login dos clientes: POST /api/auth/login.

IMPORTANTE
Este ZIP é a base do painel e do backend, não uma integração pronta com o site público antigo.
O endpoint /api/auth/login valida as credenciais, mas ainda não protege automaticamente as páginas, capas ou arquivos de jogos. Para isso, o site e os downloads precisam passar pela validação no servidor. Não coloque links privados ou senhas no HTML público.
Não existe senha administrativa padrão. Você precisa definir os Secrets no Cloudflare.
Não use este painel em produção antes de configurar os Secrets, ativar HTTPS e testar.

PUBLICAR NO CLOUDFLARE PAGES
1. Extraia o ZIP no computador.
2. No Cloudflare, abra Workers & Pages > Create > Pages > Connect to Git.
3. Crie um repositório privado no GitHub e envie os arquivos desta pasta para ele.
4. Configure o projeto:
   - Framework preset: None
   - Build command: deixe vazio
   - Build output directory: public
5. Em Settings > Functions > D1 database bindings, adicione:
   - Variable name: DB
   - D1 database: dl-retro-games
6. Crie um banco D1 chamado dl-retro-games e execute nele o conteúdo de schema.sql.
7. Copie o ID do banco para wrangler.toml (database_id), se usar Wrangler localmente.
8. Em Settings > Variables and Secrets, adicione estes Secrets:
   - ADMIN_USERNAME: seu nome de administrador
   - ADMIN_PASSWORD_HASH: hash PBKDF2 da sua senha (veja abaixo)
   - SESSION_SECRET: uma frase aleatória longa, exclusiva, com pelo menos 32 caracteres
9. Faça um novo deploy. Abra o endereço Pages e entre com o usuário/senha configurados.

COMO GERAR ADMIN_PASSWORD_HASH
A maneira mais simples é executar este comando em um ambiente Node.js local com WebCrypto:
  node -e "const c=require('crypto');const p=process.argv[1];const s=c.randomBytes(16);const h=c.pbkdf2Sync(p,s,210000,32,'sha256');console.log('pbkdf2$210000$'+s.toString('base64url')+'$'+h.toString('base64url'))" "SUA_SENHA_FORTE"

Cole o resultado completo como Secret ADMIN_PASSWORD_HASH no Cloudflare.
Nunca coloque sua senha real no código ou no GitHub.

LIMITAÇÕES / PRÓXIMA ETAPA
- A senha do cliente é mostrada uma única vez quando a conta é criada. Copie e envie ao cliente.
- O painel não tem recuperação de senha do cliente nesta versão.
- O login do cliente responde com plano e validade, mas a proteção efetiva do conteúdo exige adaptar o site DL RETRO GAMES e servir/proteger os arquivos por backend. Um site estático público pode continuar acessível por URL direta.
- Antes de colocar clientes reais, faça testes com contas fictícias e confirme que a configuração do banco e dos Secrets está correta.
