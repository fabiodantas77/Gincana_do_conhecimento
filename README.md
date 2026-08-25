# Gincana do conhecimento

O site possui duas páginas:

- `/` — placar público, somente leitura, com rankings Matutino e Vespertino atualizados em tempo real.
- `/admin/` — área de cadastro e lançamento de pontos, protegida por login; selecione o turno antes de editar.

## Configuração do Supabase

1. Crie um projeto no [Supabase](https://supabase.com/).
2. No **SQL Editor**, execute todo o arquivo [`supabase/schema.sql`](./supabase/schema.sql).
3. Em **Database > Replication**, confirme que `championship_data` está habilitada para Realtime.
4. Em **Authentication > Users**, crie o usuário administrador. Copie o UUID dele e execute no SQL Editor:

   ```sql
   insert into public.admin_users (user_id) values ('UUID_DO_USUARIO');
   ```

5. Copie `.env.example` para `.env.local` e preencha a URL e a **publishable key** do projeto. Não use a chave `service_role` no front-end.
6. Execute `npm run dev` e acesse `http://localhost:5173/admin/` para entrar.

## Publicação automática no GitHub Pages

1. Crie um repositório no GitHub, envie este projeto para a branch `main` e abra **Settings > Pages**.
2. Em **Build and deployment**, selecione **GitHub Actions**.
3. Em **Settings > Secrets and variables > Actions**, crie estes *repository secrets*:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
4. Cada `push` para `main` executará [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) e publicará o site.

O endereço será `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`; a administração fica em `/admin/` ao final desse endereço.

## Comandos

```bash
npm install
npm run dev
npm run build
```
