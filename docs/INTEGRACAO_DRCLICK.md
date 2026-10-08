# Integração DrClick — preparação segura

## Endpoint informado
GET https://api-maissaude.drclick.com.br/api/reports/appointmentbystatus

Parâmetros: idclinica=3fe2145e-ec64-442b-a967-864afb4d4393, status=faltou, start_date e end_date no formato YYYY-MM-DD.

## Estado atual
Conector de leitura preparado em lib/drclick.ts, **sem execução automática e sem importação**. O formato JSON de resposta e o método real de autenticação ainda não foram confirmados. Nenhum dado de paciente é incluído no código.

## Variáveis futuras (somente backend da Vercel)
- DRCLICK_API_TOKEN: apenas se a documentação confirmar Authorization: Bearer.
- DRCLICK_API_KEY: apenas se a documentação confirmar x-api-key.
Nunca prefixar com NEXT_PUBLIC_. Nunca salvar valores reais no GitHub.

## Próximos passos antes de importar
1. Confirmar o mecanismo de autenticação, permissões e política de acesso à API.
2. Obter um exemplo de resposta anonimizado, para mapear ID do agendamento, unidade, nome, telefone, especialidade, data e valor.
3. Implementar importação via rota autenticada exclusivamente para administradores ou tarefa agendada com segredo server-side, usando Supabase service role **somente no servidor**.
4. Fazer upsert idempotente com external_id e preservar os status e históricos alterados pelos operadores.
5. Verificar RLS, auditoria, consentimento/base legal e minimização dos dados conforme LGPD.
6. Validar em ambiente de testes antes de habilitar agendamento diário D-1 (America/Belem).

## Endpoint de diagnóstico
GET /api/integrations/drclick/health com Authorization: Bearer <token de sessão Supabase de administrador>.
Retorna apenas estado de configuração, sem pacientes ou credenciais. Não realiza chamadas à DrClick.
