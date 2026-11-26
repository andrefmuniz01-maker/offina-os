# Agendamento por horários livres

## Como o mercado faz (pesquisa em 26/11/2026)
- O cliente agenda sozinho por uma página web, 24 horas, escolhendo um horário livre; a oficina não precisa atender
  ligação ([Autoflow](https://autoflow.com/scheduling/), [Shop-Ware](https://shop-ware.com/automotive-website-service-scheduler/),
  [guia de agendamento para oficinas](https://bookingautomotive.github.io/docs/appointment-scheduling/)).
- A disponibilidade respeita a **capacidade da oficina** (baias, minutos por dia, limites por tipo de serviço), a
  **duração do serviço** e evita sobreposição entre agendamentos.
- Há **antecedência mínima** configurável (Tekmetric: de 1 a 72 horas) e o horário de agendamento online pode terminar
  antes do fechamento ([Tekmetric – configurações](https://support.tekmetric.com/hc/en-us/articles/28474032644631-Tekmetric-Booking-Tool-Settings)).
- Recomendação comum: começar com limites abaixo da capacidade real e aumentar depois. Shopmonkey configura os horários
  por dia da semana ([Shopmonkey – Appointment Scheduler](https://support.shopmonkey.io/hc/en-us/articles/38744277883284-CRM-Essentials-Appointment-Scheduler)).
- Lembretes automáticos reduzem faltas (ainda não implementado aqui).

## Fluxo do OficinaOS
1. **Cliente aprova a proposta** em `/orcamento/:token` → aparece o botão **Escolher dia e horário**.
2. **`/agendar/:token`** mostra dias e horários livres (14 dias). Um toque + confirmar cria o **agendamento, a OS e a
   baia** e avisa a equipe (notificação "Cliente agendou o horário").
3. **A oficina** pode, no orçamento aprovado: **Enviar link de agendamento** (WhatsApp com mensagem pronta), **Copiar link**
   ou **Agendar eu mesmo** (com os próximos horários livres como atalhos). Na Agenda, o novo agendamento manual também
   sugere horários livres para os serviços escolhidos; a busca de cliente já existia.

## Regras dos horários livres (`private.available_slots`)
- Horário de funcionamento: `tenant_settings.opening_hours` (fuso `America/Sao_Paulo`); sem configuração, seg–sex 08–18 e
  sáb 08–12.
- Capacidade: número de baias ativas (mínimo 1). Um horário está livre se há menos agendamentos sobrepostos que baias.
- Duração: soma de `services.estimated_minutes` dos itens da proposta (padrão 60 min).
- Antecedência mínima de 2 h; horários de hora em hora; janela de 14 dias; serviço maior que o expediente só oferece o
  primeiro horário do dia.
- Ao agendar, o servidor trava a oficina (advisory lock), **recalcula** a disponibilidade e só então grava: dois clientes
  nunca ficam com o mesmo horário.

## Pontos de acesso
- Banco: `public_quote_scheduling_info`, `public_book_quote_slot` (só `service_role`); `workspace_available_slots`,
  `workspace_quote_scheduling_link` (equipe, exigem permissão de agenda).
- API: `publicQuotes.schedulingInfo/book`, `workspaceOperations.availableSlots/quoteSchedulingLink`.

## Próximos passos possíveis
Lembrete automático por WhatsApp, remarcar/cancelar pelo link, antecedência e janela configuráveis por oficina, limite
diário por tipo de serviço, horários bloqueados (feriados).
