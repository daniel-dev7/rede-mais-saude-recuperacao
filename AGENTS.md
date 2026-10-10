# AGENTS.md — Central de Recuperação | Rede Mais Saúde

## Objetivo
Manter e evoluir o painel interno de recuperação de pacientes faltosos, gestão de contatos, reagendamentos, comparecimentos e indicadores, preservando o comportamento existente.

## Stack e pontos de entrada verificados (2026-10-10)
- Next.js 15 (App Router), React 19, TypeScript, lucide-react.
- Supabase para autenticação e persistência, Vercel para deploy e agendamento.
- Interface principal: `app/page.tsx`; estilos: `app/globals.css`.
- Integração DrClick: `lib/drclick.ts` e `app/api/cron/drclick/route.ts`.
- Cron em `vercel.json`: `/api/cron/drclick`, `0 4 * * *` (UTC).
- Scripts: `npm run dev`, `npm run build`, `npm run start`.

## Estado do projeto
- Há implementação real de dashboard, login, filtros por data/unidade/status, perfis de operação e leitura de registros no Supabase.
- Existe código de importação de faltosos e conciliação de atendidos via DrClick; NÃO considerar integração homologada sem verificação de API, credenciais, schema, cron e logs.
- O README pode estar desatualizado; conferir o código antes de declarar algo ausente ou concluído.
- Site associado: https://rede-mais-saude-recuperacao.vercel.app/ (não presumir que produção corresponde ao commit atual).

## Prioridades para a próxima sessão Codex
1. Inspecionar estrutura completa e executar build/lint/testes disponíveis. Entregar diagnóstico, não iniciar alterações grandes antes do diagnóstico.
2. Validar contrato DrClick contra documentação autorizada. O código atual chama `/api/bots/appointmentbystatus`, enquanto um endpoint compartilhado anteriormente foi `/api/reports/appointmentbystatus`. Confirmar caminho correto, autenticação, envelope JSON e nomes de campos antes de mudar.
3. Checar políticas RLS do Supabase, permissões por perfil, uso de service role exclusivamente server-side, validação de entradas, tratamento de erros e logs sem dados pessoais.
4. Testar ingestão por unidade, filtros, deduplicação, idempotência, reexecuções do cron e correspondência segura entre falta e comparecimento posterior.
5. Evoluir o frontend com acabamento visual premium, responsividade, acessibilidade, SVGs/ícones consistentes e CTAs apropriados, sem remover recursos existentes.
6. Atualizar README com arquitetura, setup local e variáveis de ambiente documentadas por nome (nunca valores).

## Regras de operação e segurança
- Sistema de saúde: tratar nomes, telefones, consultas e dados de atendimento como sensíveis. Não inserir dados reais em commits, prompts, fixtures, screenshots ou logs.
- Não imprimir, armazenar ou commitar tokens, senhas, chaves do Supabase, segredos do cron ou credenciais DrClick.
- Não executar sincronização real, atualização em massa, migrações destrutivas ou deploy de produção sem aprovação explícita.
- Não alterar configuração de produção nem políticas de acesso sem revisão.
- Desenvolver em branch de trabalho e apresentar diff/PR para revisão antes do merge na `main`.
- Preferir mocks e dados fictícios para testes locais.
- Conservar nomenclatura em português na interface e domínio de negócio existente.
- Indicar claramente o que foi verificado em código versus o que foi testado em ambiente.

## Primeira resposta esperada
Apresentar: (a) mapa da arquitetura e arquivos relevantes, (b) funcionalidades confirmadas, (c) riscos e discrepâncias de integração, (d) plano priorizado com pequenos PRs, (e) dependências externas necessárias para homologação. Não modificar o comportamento antes desta revisão.
