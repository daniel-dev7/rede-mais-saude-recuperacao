# Integração Dr Click — pacientes faltosos

## Estado
Implementação inicial em branch de desenvolvimento. **Não está conectada ao dashboard, homologada com dados reais nem publicada em produção.**

## Variáveis de ambiente (somente no servidor)
- `DRCLICK_API_BASE_URL`: URL base HTTPS **confirmada pela Dr Click** (ex.: `https://dominio-autorizado`), sem o caminho da rota.
- `DRCLICK_CLINIC_IDS`: UUIDs das clínicas autorizadas, separados por vírgula.
- `DRCLICK_AUTH_HEADER_NAME` e `DRCLICK_AUTH_HEADER_VALUE`: preencher **somente** quando a Dr Click especificar como autenticar. Não inventar token ou cabeçalho.
- `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: configuração já utilizada na autenticação da Central.

Nunca colocar credenciais reais no repositório ou em variáveis `NEXT_PUBLIC_DRCLICK_...`.

## Endpoint interno
`GET /api/drclick/faltosos?date=YYYY-MM-DD&idclinica=UUID`

Exige `Authorization: Bearer <token-de-acesso-Supabase>` de um usuário ativo com perfil `admin` ou `operator`. O endpoint verifica acesso e clínica autorizada antes de consultar a Dr Click. Executa uma chamada `GET /api/bots/appointmentbystatus` para **um dia e uma clínica**, com `status=faltou`. Não faz envios automáticos de mensagens.

Resposta: `{ success: true, date, idclinica, total, records }` com registros deduplicados por `idagendamento`. O telefone vazio ou `S/N` é retornado como `null`; descartar esses contatos antes de qualquer disparo.

## Para concluir a integração
1. Confirmar URL base, esquema de autenticação, permissões, clínicas e liberação de IP com Dr Click.
2. Configurar as variáveis de ambiente no ambiente seguro de preview da Vercel.
3. Testar autenticação, respostas reais, timeout e retorno sem registros.
4. Definir importação segura e idempotente para `missed_appointments` (a tabela atual tem colunas e identificadores próprios); revisar políticas RLS e regras de retenção antes de gravar pacientes.
5. Integrar botão de sincronização e filtros ao dashboard e validar build.
6. Solicitar aprovação antes de qualquer publicação em produção.

A documentação recomenda sincronizar pela manhã os registros de ontem, após o fechamento das 23h no fuso America/Belem; consultar vários dias em chamadas separadas e não sobrecarregar a API.
