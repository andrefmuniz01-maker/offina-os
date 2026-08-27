-- Oficina Demo completa: dados fictícios persistidos nas tabelas reais e isolados por tenant.
-- O seed não cria contas Auth fictícias; toda auditoria usa o Super Admin que executa a operação.

create or replace function private.clear_full_demo(p_tenant_id bigint)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if not exists (select 1 from public.tenants t where t.id = p_tenant_id and t.is_demo) then
    raise exception 'A limpeza só pode ser executada no tenant demonstrativo.' using errcode = '42501';
  end if;
  delete from public.notification_preferences where tenant_id = p_tenant_id;
  delete from public.notifications where tenant_id = p_tenant_id;
  delete from public.attachments where tenant_id = p_tenant_id;
  delete from public.work_order_items where tenant_id = p_tenant_id;
  delete from public.work_order_notes where tenant_id = p_tenant_id;
  delete from public.work_order_checklists where tenant_id = p_tenant_id;
  delete from public.work_order_consumption where tenant_id = p_tenant_id;
  delete from public.inventory_reservations where tenant_id = p_tenant_id;
  delete from public.quote_events where tenant_id = p_tenant_id;
  delete from public.quote_items where tenant_id = p_tenant_id;
  delete from public.quote_request_events where tenant_id = p_tenant_id;
  delete from public.revenues where tenant_id = p_tenant_id;
  delete from public.expenses where tenant_id = p_tenant_id;
  delete from public.appointments where tenant_id = p_tenant_id;
  delete from public.work_orders where tenant_id = p_tenant_id;
  delete from public.quotes where tenant_id = p_tenant_id;
  delete from public.quote_requests where tenant_id = p_tenant_id;
  delete from public.purchase_order_items where tenant_id = p_tenant_id;
  delete from public.purchase_orders where tenant_id = p_tenant_id;
  delete from public.inventory_movements where tenant_id = p_tenant_id;
  delete from public.inventory_balances where tenant_id = p_tenant_id;
  delete from public.kit_items where tenant_id = p_tenant_id;
  delete from public.kits where tenant_id = p_tenant_id;
  delete from public.service_products where tenant_id = p_tenant_id;
  delete from public.services where tenant_id = p_tenant_id;
  delete from public.products where tenant_id = p_tenant_id;
  delete from public.vehicles where tenant_id = p_tenant_id;
  delete from public.customers where tenant_id = p_tenant_id;
  delete from public.suppliers where tenant_id = p_tenant_id;
  delete from public.product_categories where tenant_id = p_tenant_id;
  delete from public.service_categories where tenant_id = p_tenant_id;
  delete from public.scheduled_tasks where tenant_id = p_tenant_id;
  delete from public.audit_logs where tenant_id = p_tenant_id;
end;
$$;

create or replace function private.seed_full_demo(p_tenant_id bigint, p_actor_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_i integer;
  v_j integer;
  v_request_status public.quote_request_status;
  v_quote_status public.quote_status;
  v_operation_status public.operation_status;
  v_start_at timestamptz;
  v_product_names text[] := array['Óleo sintético 5W30', 'Filtro de óleo', 'Filtro de ar', 'Filtro de cabine', 'Pastilha de freio dianteira', 'Disco de freio ventilado', 'Fluido de freio DOT4', 'Aditivo para radiador', 'Vela de ignição', 'Bateria 60Ah', 'Palheta dianteira', 'Lâmpada LED H7', 'Correia de acessórios', 'Rolamento de roda', 'Amortecedor dianteiro', 'Coxim de amortecedor', 'Bieleta da barra estabilizadora', 'Bucha de bandeja', 'Terminal de direção', 'Pneu 205/55 R16', 'Pneu 225/45 R17', 'Sensor ABS', 'Sensor de temperatura', 'Bobina de ignição', 'Bomba d''água', 'Válvula termostática', 'Mangueira de arrefecimento', 'Kit correia dentada', 'Tensor da correia', 'Junta de cabeçote', 'Jogo de anéis', 'Lâmpada de freio', 'Fusível mini lâmina', 'Relé auxiliar', 'Buzina universal', 'Compressor de ar-condicionado', 'Filtro secador de ar-condicionado', 'Gás refrigerante R134a', 'Óleo de câmbio ATF', 'Fluido de transmissão CVT', 'Kit embreagem', 'Cabo de vela', 'Limpa contato elétrico', 'Silicone de alta temperatura', 'Abraçadeira inox', 'Junta de escapamento', 'Coxim de motor', 'Aditivo limpa bico'];
  v_product_categories text[] := array['Lubrificantes', 'Filtros', 'Freios', 'Suspensão', 'Motor', 'Elétrica', 'Arrefecimento', 'Pneus', 'Baterias', 'Acessórios'];
  v_service_categories text[] := array['Revisão', 'Freios', 'Suspensão', 'Motor', 'Elétrica', 'Diagnóstico', 'Ar-condicionado', 'Alinhamento e balanceamento', 'Troca de óleo'];
  v_supplier_names text[] := array['AutoParts Brasil Demo', 'Mecânica Central Distribuidora Demo', 'Norte Peças Demo', 'EletroCar Componentes Demo', 'Pneus & Rodas Fictício', 'ClimaCar Ar Demo'];
  v_service_names text[] := array['Troca de óleo e filtros', 'Revisão básica', 'Revisão completa', 'Alinhamento', 'Balanceamento', 'Diagnóstico eletrônico', 'Troca de pastilhas', 'Troca de discos', 'Revisão de suspensão', 'Troca de bateria', 'Higienização do ar-condicionado', 'Manutenção preventiva', 'Revisão de freios', 'Troca de correia dentada', 'Reparo elétrico', 'Inspeção pré-compra', 'Troca de amortecedores', 'Revisão do sistema de arrefecimento', 'Limpeza de bicos', 'Troca de embreagem', 'Revisão de câmbio automático', 'Diagnóstico de ruído', 'Polimento técnico', 'Instalação de acessórios'];
  v_customer_names text[] := array['Carlos Mendes Demo', 'Mariana Alves Demo', 'Rafael Costa Demo', 'Fernanda Lima Demo', 'João Ribeiro Demo', 'Patrícia Souza Demo', 'Lucas Martins Demo', 'Bianca Rocha Demo', 'André Carvalho Demo', 'Camila Nunes Demo', 'Diego Moreira Demo', 'Juliana Freitas Demo', 'Bruno Teixeira Demo', 'Larissa Gomes Demo', 'Felipe Barros Demo', 'Renata Duarte Demo', 'Gustavo Pinto Demo', 'Aline Monteiro Demo', 'Marcelo Vieira Demo', 'Isabela Cardoso Demo', 'Eduardo Ramos Demo', 'Natália Correia Demo', 'Thiago Fernandes Demo', 'Beatriz Castro Demo', 'Henrique Dias Demo', 'Sofia Moura Demo', 'Daniel Pires Demo', 'Carolina Mendes Demo', 'Vinícius Lopes Demo', 'Amanda Reis Demo', 'Rodrigo Neves Demo', 'Letícia Farias Demo', 'Caio Sampaio Demo', 'Manuela Braga Demo', 'Paulo Figueiredo Demo', 'Clara Azevedo Demo'];
  v_makes text[] := array['Toyota', 'Honda', 'Volkswagen', 'Chevrolet', 'Hyundai', 'Fiat', 'Jeep', 'Nissan', 'Renault'];
  v_models text[] := array['Corolla', 'Civic', 'Polo', 'Onix', 'HB20', 'Argo', 'Compass', 'Kicks', 'Duster'];
  v_engines text[] := array['2.0 Flex', '1.5 Turbo', '1.0 TSI', '1.0 Turbo', '1.6 Flex', '1.3 Firefly', '2.0 T270', '1.6 CVT', '1.6 SCe'];
  v_request_statuses text[] := array['new', 'in_analysis', 'awaiting_information', 'in_quoting', 'ready', 'sent', 'approved', 'approved', 'approved', 'rejected', 'expired', 'cancelled', 'in_analysis', 'in_quoting', 'ready', 'sent', 'approved', 'approved', 'ready', 'sent', 'approved', 'expired', 'cancelled', 'approved', 'approved', 'new', 'in_analysis', 'awaiting_information', 'in_quoting', 'ready', 'sent', 'approved', 'ready', 'sent', 'approved', 'approved'];
  v_quote_statuses text[] := array['draft', 'ready', 'sent', 'viewed', 'approved', 'approved', 'approved', 'rejected', 'expired', 'cancelled', 'draft', 'ready', 'sent', 'viewed', 'approved', 'approved', 'approved', 'approved', 'rejected', 'expired', 'cancelled', 'sent', 'viewed', 'approved'];
  v_operation_statuses text[] := array['scheduled', 'confirmed', 'received', 'diagnosis', 'awaiting_approval', 'awaiting_part', 'in_service', 'completed', 'delivered', 'cancelled', 'in_service', 'completed', 'delivered', 'received', 'diagnosis', 'awaiting_approval', 'completed', 'delivered'];
begin
  if p_actor_profile_id is null then raise exception 'O seed precisa de um perfil de Super Admin para auditoria.' using errcode = '55000'; end if;
  if not exists (select 1 from public.tenants t where t.id = p_tenant_id and t.is_demo) then raise exception 'O seed completo só pode ser executado no tenant demonstrativo.' using errcode = '42501'; end if;

  update public.tenant_settings set legal_name = 'Auto Prime Centro Automotivo — Demonstração', document = '00.000.000/0000-00', phone = '+55 00 0000-0000', whatsapp = '+55 00 00000-0000', email = 'demo@autoprime.invalid.example', address = jsonb_build_object('street', 'Avenida dos Motores, 100', 'neighborhood', 'Centro', 'city', 'São Paulo', 'state', 'SP', 'zipCode', '00000-000', 'country', 'BR'), opening_hours = jsonb_build_object('mondayToFriday', '08:00-18:00', 'saturday', '08:00-13:00', 'sunday', 'Fechado'), default_labor_hourly_rate = 180, default_parts_margin_percent = 35, default_parts_markup_percent = 55, minimum_margin_percent = 20, attendant_max_discount_percent = 5, quote_validity_days = 7, quote_message_template = 'Olá, {{cliente}}. Preparamos uma sugestão para seu veículo na Auto Prime. Consulte o link seguro para revisar e aprovar.' where tenant_id = p_tenant_id;
  update public.tenant_branding set public_title = 'Auto Prime Centro Automotivo', logo_url = null, primary_color = '#E84D1C', secondary_color = '#171717', accent_color = '#F5B33A' where tenant_id = p_tenant_id;

  for v_i in 1..array_length(v_product_categories, 1) loop
    insert into public.product_categories(tenant_id, name, description) values(p_tenant_id, v_product_categories[v_i], 'Categoria fictícia para demonstração operacional.');
  end loop;
  for v_i in 1..array_length(v_service_categories, 1) loop
    insert into public.service_categories(tenant_id, name, description) values(p_tenant_id, v_service_categories[v_i], 'Categoria fictícia de serviços automotivos para demonstração.');
  end loop;
  for v_i in 1..array_length(v_supplier_names, 1) loop
    insert into public.suppliers(tenant_id, name, document, contact_name, phone, email, notes) values(p_tenant_id, v_supplier_names[v_i], '00.000.000/000' || v_i || '-00', 'Contato Comercial Demo', '+55 00 0000-' || lpad((1000 + v_i)::text, 4, '0'), 'fornecedor-' || lpad(v_i::text, 2, '0') || '@invalid.example', 'Fornecedor inteiramente fictício para testes da Oficina Demo.');
  end loop;

  for v_i in 1..array_length(v_product_names, 1) loop
    insert into public.products(tenant_id, category_id, supplier_id, name, sku, brand, unit, current_cost, average_cost, sale_price, desired_margin_percent, min_stock, max_stock, location, barcode, description)
    values(p_tenant_id, (select pc.id from public.product_categories pc where pc.tenant_id = p_tenant_id and pc.name = v_product_categories[((v_i - 1) % array_length(v_product_categories, 1)) + 1]), (select s.id from public.suppliers s where s.tenant_id = p_tenant_id and s.name = v_supplier_names[((v_i - 1) % array_length(v_supplier_names, 1)) + 1]), v_product_names[v_i], 'DEMO-P-' || lpad(v_i::text, 3, '0'), case when v_i % 3 = 0 then 'Bosch Demo' when v_i % 3 = 1 then 'NGK Demo' else 'Auto Prime Demo' end, 'un', round((35 + (v_i % 17) * 23)::numeric, 2), round((35 + (v_i % 17) * 23)::numeric, 2), round(((35 + (v_i % 17) * 23) * 1.35)::numeric, 2), 35, case when v_i % 3 = 0 then 2 else 4 end, case when v_i % 4 = 0 then 30 else 15 end, 'R' || lpad(((v_i - 1) % 6 + 1)::text, 2, '0') || '-' || lpad(v_i::text, 2, '0'), '0000000000' || lpad(v_i::text, 2, '0'), 'Produto fictício para teste de catálogo, estoque, compras e orçamento.');
    insert into public.inventory_balances(tenant_id, product_id, physical_quantity, reserved_quantity) values(p_tenant_id, (select p.id from public.products p where p.tenant_id = p_tenant_id and p.sku = 'DEMO-P-' || lpad(v_i::text, 3, '0')), case when v_i % 4 = 0 then 1 when v_i % 4 = 1 then 3 when v_i % 4 = 2 then 12 else 6 end, case when v_i % 5 = 0 then 1 else 0 end);
    insert into public.inventory_movements(tenant_id, product_id, type, quantity, physical_delta, reserved_delta, reference_type, notes, created_by_user_id, created_at) values(p_tenant_id, (select p.id from public.products p where p.tenant_id = p_tenant_id and p.sku = 'DEMO-P-' || lpad(v_i::text, 3, '0')), 'purchase_entry', case when v_i % 4 = 0 then 1 else 6 end, case when v_i % 4 = 0 then 1 else 6 end, 0, 'demo_seed', 'Entrada fictícia inicial da Oficina Demo.', p_actor_profile_id, now() - make_interval(days => (v_i % 30) + 1));
  end loop;

  for v_i in 1..array_length(v_service_names, 1) loop
    insert into public.services(tenant_id, category_id, name, description, estimated_minutes, labor_price, estimated_cost, desired_margin_percent, quote_questions)
    values(p_tenant_id, (select sc.id from public.service_categories sc where sc.tenant_id = p_tenant_id and sc.name = v_service_categories[((v_i - 1) % array_length(v_service_categories, 1)) + 1]), v_service_names[v_i], 'Serviço fictício configurado para testar orçamento, agenda, OS e histórico do veículo.', 45 + ((v_i * 15) % 240), round((120 + v_i * 37)::numeric, 2), round((70 + v_i * 20)::numeric, 2), 30, case when v_i % 4 = 0 then jsonb_build_array(jsonb_build_object('id', 'sintoma', 'label', 'Qual é o principal sintoma?', 'type', 'text', 'required', true), jsonb_build_object('id', 'urgencia', 'label', 'Existe urgência para o veículo?', 'type', 'select', 'required', true, 'options', jsonb_build_array('Hoje', 'Nesta semana', 'Sem urgência'))) when v_i % 3 = 0 then jsonb_build_array(jsonb_build_object('id', 'quilometragem', 'label', 'Qual a quilometragem aproximada?', 'type', 'text', 'required', true)) else null end);
    insert into public.service_products(tenant_id, service_id, product_id, quantity, required) values(p_tenant_id, (select s.id from public.services s where s.tenant_id = p_tenant_id and s.name = v_service_names[v_i]), (select p.id from public.products p where p.tenant_id = p_tenant_id and p.sku = 'DEMO-P-' || lpad((((v_i - 1) % array_length(v_product_names, 1)) + 1)::text, 3, '0')), case when v_i % 5 = 0 then 2 else 1 end, true);
    if v_i % 4 = 0 then insert into public.service_products(tenant_id, service_id, product_id, quantity, required) values(p_tenant_id, (select s.id from public.services s where s.tenant_id = p_tenant_id and s.name = v_service_names[v_i]), (select p.id from public.products p where p.tenant_id = p_tenant_id and p.sku = 'DEMO-P-' || lpad(((v_i % array_length(v_product_names, 1)) + 1)::text, 3, '0')), 1, false); end if;
  end loop;

  for v_i in 1..6 loop
    insert into public.kits(tenant_id, category_id, name, description, sale_price_override, active) values(p_tenant_id, (select sc.id from public.service_categories sc where sc.tenant_id = p_tenant_id and sc.name = v_service_categories[((v_i - 1) % array_length(v_service_categories, 1)) + 1]), 'Pacote Demo ' || lpad(v_i::text, 2, '0'), 'Kit composto fictício para testar expansão de itens e margem.', 650 + (v_i * 180), true);
    insert into public.kit_items(tenant_id, kit_id, product_id, quantity) values(p_tenant_id, (select k.id from public.kits k where k.tenant_id = p_tenant_id and k.name = 'Pacote Demo ' || lpad(v_i::text, 2, '0')), (select p.id from public.products p where p.tenant_id = p_tenant_id and p.sku = 'DEMO-P-' || lpad((((v_i - 1) * 3) + 1)::text, 3, '0')), 1);
    insert into public.kit_items(tenant_id, kit_id, service_id, quantity) values(p_tenant_id, (select k.id from public.kits k where k.tenant_id = p_tenant_id and k.name = 'Pacote Demo ' || lpad(v_i::text, 2, '0')), (select s.id from public.services s where s.tenant_id = p_tenant_id order by s.id offset ((v_i - 1) * 2) limit 1), 1);
  end loop;

  for v_i in 1..array_length(v_customer_names, 1) loop
    insert into public.customers(tenant_id, name, whatsapp, email, document, notes) values(p_tenant_id, v_customer_names[v_i], '+55 00 00000-' || lpad((1000 + v_i)::text, 4, '0'), 'cliente-' || lpad(v_i::text, 2, '0') || '@invalid.example', '000.000.000-' || lpad(v_i::text, 2, '0'), 'Endereço fictício ' || v_i || ', Centro, São Paulo/SP. Histórico de teste da Oficina Demo.');
    for v_j in 1..(case when v_i <= 4 then 2 else 1 end) loop
      insert into public.vehicles(tenant_id, customer_id, make, model, model_year, manufacture_year, plate, mileage, engine, notes) values(p_tenant_id, (select c.id from public.customers c where c.tenant_id = p_tenant_id and c.name = v_customer_names[v_i]), v_makes[((v_i + v_j - 2) % array_length(v_makes, 1)) + 1], v_models[((v_i + v_j - 2) % array_length(v_models, 1)) + 1], 2016 + ((v_i + v_j) % 9), 2016 + ((v_i + v_j) % 9), 'DEMO' || lpad(v_i::text, 2, '0') || lpad(v_j::text, 1, '0'), 18000 + (v_i * 1275) + (v_j * 800), v_engines[((v_i + v_j - 2) % array_length(v_engines, 1)) + 1], 'Veículo fictício para testar histórico, orçamento, agenda e OS.');
    end loop;
  end loop;

  for v_i in 1..array_length(v_customer_names, 1) loop
    v_request_status := v_request_statuses[v_i]::public.quote_request_status;
    insert into public.quote_requests(tenant_id, number, customer_id, vehicle_id, service_id, requester_name, requester_whatsapp, requester_email, vehicle_snapshot, service_label, answers, description, source, status, assigned_to_user_id, created_at, updated_at)
    values(p_tenant_id, v_i, (select c.id from public.customers c where c.tenant_id = p_tenant_id and c.name = v_customer_names[v_i]), (select v.id from public.vehicles v join public.customers c on c.id = v.customer_id and c.tenant_id = p_tenant_id where v.tenant_id = p_tenant_id and c.name = v_customer_names[v_i] order by v.id limit 1), (select s.id from public.services s where s.tenant_id = p_tenant_id and s.name = v_service_names[((v_i - 1) % array_length(v_service_names, 1)) + 1]), v_customer_names[v_i], '+55 00 00000-' || lpad((1000 + v_i)::text, 4, '0'), 'cliente-' || lpad(v_i::text, 2, '0') || '@invalid.example', (select jsonb_build_object('make', v.make, 'model', v.model, 'modelYear', v.model_year, 'plate', v.plate, 'mileage', v.mileage, 'engine', v.engine) from public.vehicles v join public.customers c on c.id = v.customer_id and c.tenant_id = p_tenant_id where v.tenant_id = p_tenant_id and c.name = v_customer_names[v_i] order by v.id limit 1), v_service_names[((v_i - 1) % array_length(v_service_names, 1)) + 1], jsonb_build_object('origem', 'site demo', 'perfil', case when v_i % 2 = 0 then 'manutenção preventiva' else 'necessidade de reparo' end), 'Solicitação fictícia para testar a fila comercial da Auto Prime Demo.', case when v_i % 3 = 0 then 'whatsapp' else 'public_link' end, v_request_status, p_actor_profile_id, now() - make_interval(days => (v_i % 45)), now() - make_interval(days => (v_i % 12)));
    insert into public.quote_request_events(tenant_id, quote_request_id, type, actor_user_id, metadata, created_at) values(p_tenant_id, (select qr.id from public.quote_requests qr where qr.tenant_id = p_tenant_id and qr.number = v_i), 'created', p_actor_profile_id, jsonb_build_object('source', 'demo_seed', 'fictitious', true), now() - make_interval(days => (v_i % 45)));
  end loop;

  for v_i in 1..array_length(v_quote_statuses, 1) loop
    v_quote_status := v_quote_statuses[v_i]::public.quote_status;
    insert into public.quotes(tenant_id, number, quote_request_id, customer_id, vehicle_id, status, subtotal, discount_total, total, estimated_cost_total, estimated_margin_percent, valid_until, public_token, public_token_expires_at, notes, terms, created_by_user_id, sent_at, viewed_at, approved_at, rejected_at, created_at, updated_at)
    values(p_tenant_id, v_i, (select qr.id from public.quote_requests qr where qr.tenant_id = p_tenant_id and qr.number = v_i), (select qr.customer_id from public.quote_requests qr where qr.tenant_id = p_tenant_id and qr.number = v_i), (select qr.vehicle_id from public.quote_requests qr where qr.tenant_id = p_tenant_id and qr.number = v_i), v_quote_status, 520 + (v_i * 41), case when v_i % 5 = 0 then 45 else 0 end, 520 + (v_i * 41) - case when v_i % 5 = 0 then 45 else 0 end, 300 + (v_i * 24), round((100 * (1 - ((300 + (v_i * 24))::numeric / (520 + (v_i * 41))))), 2), case when v_quote_status = 'expired' then now() - interval '3 days' else now() + make_interval(days => 5 + (v_i % 8)) end, 'demo-quote-' || lpad(v_i::text, 3, '0'), case when v_quote_status = 'expired' then now() - interval '3 days' else now() + interval '12 days' end, 'Orçamento fictício criado para demonstração do fluxo comercial.', 'Valores e condições meramente demonstrativos. Nenhuma cobrança real.', p_actor_profile_id, case when v_quote_status in ('sent', 'viewed', 'approved', 'rejected', 'expired', 'cancelled') then now() - make_interval(days => (v_i % 8)) else null end, case when v_quote_status in ('viewed', 'approved', 'rejected', 'expired', 'cancelled') then now() - make_interval(days => (v_i % 5)) else null end, case when v_quote_status = 'approved' then now() - make_interval(days => (v_i % 4)) else null end, case when v_quote_status = 'rejected' then now() - make_interval(days => (v_i % 4)) else null end, now() - make_interval(days => (v_i % 30)), now() - make_interval(days => (v_i % 6)));
    insert into public.quote_items(tenant_id, quote_id, service_id, item_type, description, quantity, unit_price, unit_cost, discount, sort_order) select p_tenant_id, (select q.id from public.quotes q where q.tenant_id = p_tenant_id and q.number = v_i), s.id, 'service', s.name, 1, s.labor_price, s.estimated_cost, case when v_i % 5 = 0 then 45 else 0 end, 1 from public.services s where s.tenant_id = p_tenant_id and s.name = v_service_names[((v_i - 1) % array_length(v_service_names, 1)) + 1];
    insert into public.quote_items(tenant_id, quote_id, product_id, item_type, description, quantity, unit_price, unit_cost, discount, sort_order) select p_tenant_id, (select q.id from public.quotes q where q.tenant_id = p_tenant_id and q.number = v_i), p.id, 'product', p.name, 1, p.sale_price, p.current_cost, 0, 2 from public.products p where p.tenant_id = p_tenant_id and p.sku = 'DEMO-P-' || lpad((((v_i - 1) % array_length(v_product_names, 1)) + 1)::text, 3, '0');
    insert into public.quote_events(tenant_id, quote_id, type, actor_user_id, metadata, created_at) values(p_tenant_id, (select q.id from public.quotes q where q.tenant_id = p_tenant_id and q.number = v_i), 'created', p_actor_profile_id, jsonb_build_object('source', 'demo_seed', 'fictitious', true), now() - make_interval(days => (v_i % 30)));
    if v_quote_status = 'approved' then insert into public.inventory_reservations(tenant_id, product_id, quote_id, quantity, status, created_at) values(p_tenant_id, (select p.id from public.products p where p.tenant_id = p_tenant_id and p.sku = 'DEMO-P-' || lpad((((v_i - 1) % array_length(v_product_names, 1)) + 1)::text, 3, '0')), (select q.id from public.quotes q where q.tenant_id = p_tenant_id and q.number = v_i), 1, 'active', now() - make_interval(days => (v_i % 4))); end if;
  end loop;

  for v_i in 1..18 loop
    v_operation_status := v_operation_statuses[v_i]::public.operation_status;
    v_start_at := now() + make_interval(days => v_i - 9, hours => 8 + (v_i % 5));
    insert into public.appointments(tenant_id, quote_id, customer_id, vehicle_id, assigned_to_user_id, bay, scheduled_start, scheduled_end, status, notes)
    select p_tenant_id, q.id, q.customer_id, q.vehicle_id, p_actor_profile_id, 'Baia ' || ((v_i % 4) + 1), v_start_at, v_start_at + make_interval(mins => 60 + ((v_i % 4) * 30)), v_operation_status, 'Agendamento fictício para validar agenda e pátio.' from public.quotes q where q.tenant_id = p_tenant_id and q.number = v_i;
    insert into public.work_orders(tenant_id, number, quote_id, appointment_id, customer_id, vehicle_id, status, assigned_to_user_id, estimated_total, estimated_cost_total, real_cost_total, real_margin_percent, warranty_days, notes, completed_at, delivered_at, created_at, updated_at)
    select p_tenant_id, v_i, q.id, a.id, q.customer_id, q.vehicle_id, v_operation_status, p_actor_profile_id, q.total, q.estimated_cost_total, case when v_operation_status in ('completed', 'delivered') then q.estimated_cost_total + 18 else 0 end, case when v_operation_status in ('completed', 'delivered') then 42 else 0 end, 90, 'OS fictícia para validar pátio, checklist, consumo e histórico.', case when v_operation_status in ('completed', 'delivered') then v_start_at + interval '1 day' else null end, case when v_operation_status = 'delivered' then v_start_at + interval '2 days' else null end, v_start_at - interval '2 days', now() from public.quotes q join public.appointments a on a.quote_id = q.id and a.tenant_id = p_tenant_id where q.tenant_id = p_tenant_id and q.number = v_i;
    insert into public.appointments(tenant_id, quote_id, customer_id, vehicle_id, assigned_to_user_id, bay, scheduled_start, scheduled_end, status, notes) select p_tenant_id, null, c.id, (select v.id from public.vehicles v where v.tenant_id = p_tenant_id and v.customer_id = c.id order by v.id limit 1), p_actor_profile_id, 'Baia ' || ((v_i % 4) + 1), v_start_at, v_start_at + interval '30 minutes', 'cancelled', 'Registro fictício auxiliar.' from public.customers c where false;
    insert into public.work_order_items(tenant_id, work_order_id, product_id, description, item_type, quantity, unit_price, expected_unit_cost) select p_tenant_id, wo.id, p.id, p.name, 'product', 1, p.sale_price, p.current_cost from public.work_orders wo join public.products p on p.tenant_id = p_tenant_id and p.sku = 'DEMO-P-' || lpad((((v_i - 1) % array_length(v_product_names, 1)) + 1)::text, 3, '0') where wo.tenant_id = p_tenant_id and wo.number = v_i;
    insert into public.work_order_items(tenant_id, work_order_id, service_id, description, item_type, quantity, unit_price, expected_unit_cost) select p_tenant_id, wo.id, s.id, s.name, 'service', 1, s.labor_price, s.estimated_cost from public.work_orders wo join public.quotes q on q.id = wo.quote_id and q.tenant_id = p_tenant_id join public.quote_requests qr on qr.id = q.quote_request_id and qr.tenant_id = p_tenant_id join public.services s on s.id = qr.service_id and s.tenant_id = p_tenant_id where wo.tenant_id = p_tenant_id and wo.number = v_i;
    for v_j in 1..4 loop insert into public.work_order_checklists(tenant_id, work_order_id, label, completed, completed_by_user_id, completed_at, sort_order) select p_tenant_id, wo.id, case v_j when 1 then 'Conferência visual do veículo' when 2 then 'Registro da quilometragem' when 3 then 'Teste após serviço' else 'Orientação de entrega' end, v_operation_status in ('completed', 'delivered') and v_j <= 3, case when v_operation_status in ('completed', 'delivered') and v_j <= 3 then p_actor_profile_id else null end, case when v_operation_status in ('completed', 'delivered') and v_j <= 3 then now() - interval '1 day' else null end, v_j from public.work_orders wo where wo.tenant_id = p_tenant_id and wo.number = v_i; end loop;
    insert into public.work_order_notes(tenant_id, work_order_id, author_user_id, body, created_at) select p_tenant_id, wo.id, p_actor_profile_id, 'Nota fictícia: validar ruído, acabamento e retorno do cliente.', now() - interval '1 day' from public.work_orders wo where wo.tenant_id = p_tenant_id and wo.number = v_i;
    if v_operation_status in ('completed', 'delivered') then
      insert into public.work_order_consumption(tenant_id, work_order_id, product_id, reservation_id, quantity, unit_cost, consumed_by_user_id, created_at) select p_tenant_id, wo.id, p.id, ir.id, 1, p.current_cost, p_actor_profile_id, now() - interval '1 day' from public.work_orders wo join public.products p on p.tenant_id = p_tenant_id and p.sku = 'DEMO-P-' || lpad((((v_i - 1) % array_length(v_product_names, 1)) + 1)::text, 3, '0') left join public.inventory_reservations ir on ir.tenant_id = p_tenant_id and ir.quote_id = wo.quote_id and ir.product_id = p.id where wo.tenant_id = p_tenant_id and wo.number = v_i;
      update public.inventory_reservations ir set status = 'consumed', released_at = now() where ir.tenant_id = p_tenant_id and ir.quote_id = (select wo.quote_id from public.work_orders wo where wo.tenant_id = p_tenant_id and wo.number = v_i) and ir.status = 'active';
      update public.inventory_balances b set physical_quantity = greatest(b.physical_quantity - 1, 0), reserved_quantity = greatest(b.reserved_quantity - 1, 0) where b.tenant_id = p_tenant_id and b.product_id = (select p.id from public.products p where p.tenant_id = p_tenant_id and p.sku = 'DEMO-P-' || lpad((((v_i - 1) % array_length(v_product_names, 1)) + 1)::text, 3, '0'));
      insert into public.inventory_movements(tenant_id, product_id, type, quantity, physical_delta, reserved_delta, reference_type, reference_id, notes, created_by_user_id, created_at) values(p_tenant_id, (select p.id from public.products p where p.tenant_id = p_tenant_id and p.sku = 'DEMO-P-' || lpad((((v_i - 1) % array_length(v_product_names, 1)) + 1)::text, 3, '0')), 'work_order_consumption', 1, -1, -1, 'work_order', (select wo.id from public.work_orders wo where wo.tenant_id = p_tenant_id and wo.number = v_i), 'Consumo fictício gerado por OS demonstrativa.', p_actor_profile_id, now() - interval '1 day');
      insert into public.revenues(tenant_id, work_order_id, customer_id, vehicle_id, amount, payment_method, status, due_at, received_at, notes, created_at) select p_tenant_id, wo.id, wo.customer_id, wo.vehicle_id, q.total, case when v_i % 3 = 0 then 'pix' when v_i % 3 = 1 then 'credit_card' else 'debit_card' end, case when v_operation_status = 'delivered' then 'received' else 'expected' end, now() + interval '7 days', case when v_operation_status = 'delivered' then now() - interval '1 day' else null end, 'Receita fictícia derivada de OS demonstrativa.', now() - interval '1 day' from public.work_orders wo join public.quotes q on q.id = wo.quote_id and q.tenant_id = p_tenant_id where wo.tenant_id = p_tenant_id and wo.number = v_i;
    end if;
  end loop;

  for v_i in 19..20 loop
    insert into public.work_orders(tenant_id, number, customer_id, vehicle_id, status, assigned_to_user_id, estimated_total, estimated_cost_total, warranty_days, notes, created_at, updated_at) select p_tenant_id, v_i, c.id, (select v.id from public.vehicles v where v.tenant_id = p_tenant_id and v.customer_id = c.id order by v.id limit 1), (case when v_i = 19 then 'awaiting_part' else 'cancelled' end)::public.operation_status, p_actor_profile_id, 980 + (v_i * 50), 540 + (v_i * 30), 90, 'OS fictícia sem orçamento vinculada para testar exceções e estados.', now() - interval '4 days', now() from public.customers c where c.tenant_id = p_tenant_id and c.name = v_customer_names[v_i];
  end loop;

  for v_i in 1..5 loop
    insert into public.purchase_orders(tenant_id, number, supplier_id, status, ordered_at, received_at, notes, created_by_user_id, created_at) values(p_tenant_id, v_i, (select s.id from public.suppliers s where s.tenant_id = p_tenant_id and s.name = v_supplier_names[v_i]), case when v_i <= 3 then 'received' when v_i = 4 then 'ordered' else 'draft' end, now() - make_interval(days => v_i * 4), case when v_i <= 3 then now() - make_interval(days => v_i * 3) else null end, 'Pedido de compra fictício para demonstrar abastecimento e pendência.', p_actor_profile_id, now() - make_interval(days => v_i * 4));
    for v_j in 1..3 loop insert into public.purchase_order_items(tenant_id, purchase_order_id, product_id, ordered_quantity, received_quantity, unit_cost) select p_tenant_id, po.id, p.id, 4 + v_j, case when v_i <= 3 then 4 + v_j else 0 end, p.current_cost from public.purchase_orders po join public.products p on p.tenant_id = p_tenant_id and p.sku = 'DEMO-P-' || lpad((((v_i - 1) * 3 + v_j)::text), 3, '0') where po.tenant_id = p_tenant_id and po.number = v_i; end loop;
  end loop;

  for v_i in 1..12 loop
    insert into public.expenses(tenant_id, category, amount, status, expense_date, due_at, recurrence, supplier_id, notes, created_by_user_id, created_at) values(p_tenant_id, case when v_i % 4 = 0 then 'Aluguel' when v_i % 4 = 1 then 'Peças e fornecedores' when v_i % 4 = 2 then 'Energia e utilidades' else 'Marketing' end, 480 + (v_i * 73), case when v_i <= 7 then 'paid' when v_i % 3 = 0 then 'overdue' else 'planned' end, now() - make_interval(days => v_i * 3), now() + make_interval(days => v_i - 4), case when v_i % 4 = 0 then 'monthly' else null end, (select s.id from public.suppliers s where s.tenant_id = p_tenant_id and s.name = v_supplier_names[((v_i - 1) % array_length(v_supplier_names, 1)) + 1]), 'Despesa fictícia para testar contas a pagar e resultado operacional.', p_actor_profile_id, now() - make_interval(days => v_i * 3));
  end loop;

  insert into public.notification_preferences(tenant_id, user_id, in_app_enabled, email_enabled, enabled_types) values(p_tenant_id, p_actor_profile_id, true, false, jsonb_build_array('quote_request.created', 'work_order.updated', 'inventory.low_stock'));
  for v_i in 1..8 loop
    insert into public.notifications(tenant_id, user_id, work_order_id, type, title, body, link, created_at) values(p_tenant_id, p_actor_profile_id, case when v_i <= 6 then (select wo.id from public.work_orders wo where wo.tenant_id = p_tenant_id order by wo.id offset (v_i - 1) limit 1) else null end, case when v_i % 3 = 0 then 'inventory.low_stock' else 'work_order.updated' end, case when v_i % 3 = 0 then 'Estoque em atenção' else 'Atualização na OS demo' end, 'Aviso fictício criado para validar a central de notificações da oficina.', case when v_i <= 6 then '/operacao' else '/estoque' end, now() - make_interval(hours => v_i * 7));
  end loop;
  insert into public.scheduled_tasks(tenant_id, key, cron_expression, active) values(p_tenant_id, 'operational_scan', '0 */30 * * * *', false), (p_tenant_id, 'quote_follow_up', '0 0 10 * * 1-5', false);
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, after, metadata) values(p_tenant_id, p_actor_profile_id, 'demo.full_provisioned', 'tenant', p_tenant_id, jsonb_build_object('scope', 'full_workflow', 'fictitious', true), jsonb_build_object('seedVersion', '20260827-full-v3', 'customers', 36, 'vehicles', 40, 'products', 48, 'services', 24, 'suppliers', 6, 'quoteRequests', 36, 'quotes', 24, 'appointments', 18, 'workOrders', 20, 'expenses', 12, 'notifications', 8));
end;
$$;

create or replace function private.platform_provision_full_demo()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_tenant_id bigint;
  v_actor_profile_id uuid := auth.uid();
  v_is_demo boolean;
begin
  perform private.assert_demo_operator();
  if v_actor_profile_id is null then select p.id into v_actor_profile_id from public.profiles p where p.platform_role = 'super_admin' order by p.created_at asc limit 1; end if;
  if v_actor_profile_id is null then raise exception 'Não há Super Admin disponível para auditar o provisionamento.' using errcode = '55000'; end if;
  select t.id, t.is_demo into v_tenant_id, v_is_demo from public.tenants t where t.slug = 'performance-garage' for update;
  if found and not v_is_demo then raise exception 'O slug performance-garage pertence a uma oficina que não é demo.' using errcode = '23505'; end if;
  if not found then
    insert into public.tenants(name, slug, status, active, is_demo) values('Auto Prime Centro Automotivo', 'performance-garage', 'active', true, true) returning id into v_tenant_id;
    insert into public.tenant_settings(tenant_id) values(v_tenant_id);
    insert into public.tenant_branding(tenant_id, public_title) values(v_tenant_id, 'Auto Prime Centro Automotivo');
  end if;
  perform private.clear_full_demo(v_tenant_id);
  perform private.seed_full_demo(v_tenant_id, v_actor_profile_id);
  return jsonb_build_object('tenantId', v_tenant_id, 'slug', 'performance-garage', 'created', true, 'alreadyProvisioned', false, 'scope', 'full_workflow');
end;
$$;

create or replace function private.platform_reset_full_demo()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_tenant_id bigint;
  v_actor_profile_id uuid := auth.uid();
begin
  perform private.assert_demo_operator();
  select t.id into v_tenant_id from public.tenants t where t.slug = 'performance-garage' and t.is_demo and t.active for update;
  if not found then raise exception 'A Oficina Demo completa não está provisionada.' using errcode = 'P0002'; end if;
  if v_actor_profile_id is null then select p.id into v_actor_profile_id from public.profiles p where p.platform_role = 'super_admin' order by p.created_at asc limit 1; end if;
  if v_actor_profile_id is null then raise exception 'Não há Super Admin disponível para auditar o reset.' using errcode = '55000'; end if;
  perform private.clear_full_demo(v_tenant_id);
  perform private.seed_full_demo(v_tenant_id, v_actor_profile_id);
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, metadata) values(v_tenant_id, v_actor_profile_id, 'demo.full_reset', 'tenant', v_tenant_id, jsonb_build_object('scope', 'full_workflow', 'fictitious', true, 'seedVersion', '20260827-full-v3'));
  return jsonb_build_object('tenantId', v_tenant_id, 'slug', 'performance-garage', 'reset', true, 'scope', 'full_workflow');
end;
$$;

create or replace function private.platform_demo_status()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_tenant_id bigint; v_active boolean; v_created_at timestamptz;
begin
  perform private.assert_demo_operator();
  select t.id, t.active, t.created_at into v_tenant_id, v_active, v_created_at from public.tenants t where t.slug = 'performance-garage' and t.is_demo;
  if not found then return jsonb_build_object('exists', false, 'slug', 'performance-garage'); end if;
  return jsonb_build_object('exists', true, 'tenantId', v_tenant_id, 'slug', 'performance-garage', 'name', coalesce((select b.public_title from public.tenant_branding b where b.tenant_id = v_tenant_id), 'Auto Prime Centro Automotivo'), 'active', v_active, 'createdAt', v_created_at, 'memberCount', (select count(*) from public.tenant_members tm where tm.tenant_id = v_tenant_id), 'customerCount', (select count(*) from public.customers c where c.tenant_id = v_tenant_id), 'vehicleCount', (select count(*) from public.vehicles v where v.tenant_id = v_tenant_id), 'productCount', (select count(*) from public.products p where p.tenant_id = v_tenant_id), 'serviceCount', (select count(*) from public.services s where s.tenant_id = v_tenant_id), 'kitCount', (select count(*) from public.kits k where k.tenant_id = v_tenant_id), 'supplierCount', (select count(*) from public.suppliers s where s.tenant_id = v_tenant_id), 'purchaseOrderCount', (select count(*) from public.purchase_orders po where po.tenant_id = v_tenant_id), 'quoteRequestCount', (select count(*) from public.quote_requests qr where qr.tenant_id = v_tenant_id), 'quoteCount', (select count(*) from public.quotes q where q.tenant_id = v_tenant_id), 'appointmentCount', (select count(*) from public.appointments a where a.tenant_id = v_tenant_id), 'workOrderCount', (select count(*) from public.work_orders wo where wo.tenant_id = v_tenant_id), 'revenueCount', (select count(*) from public.revenues r where r.tenant_id = v_tenant_id), 'expenseCount', (select count(*) from public.expenses e where e.tenant_id = v_tenant_id), 'notificationCount', (select count(*) from public.notifications n where n.tenant_id = v_tenant_id));
end;
$$;

create or replace function public.platform_provision_full_demo() returns jsonb language sql security invoker set search_path = '' as $$ select private.platform_provision_full_demo() $$;
create or replace function public.platform_reset_full_demo() returns jsonb language sql security invoker set search_path = '' as $$ select private.platform_reset_full_demo() $$;
create or replace function public.platform_demo_status() returns jsonb language sql security invoker set search_path = '' as $$ select private.platform_demo_status() $$;

revoke all on function private.platform_provision_full_demo(), private.platform_reset_full_demo(), private.platform_demo_status(), private.clear_full_demo(bigint), private.seed_full_demo(bigint, uuid) from public, anon, authenticated;
grant execute on function private.platform_provision_full_demo(), private.platform_reset_full_demo(), private.platform_demo_status() to authenticated;
revoke all on function public.platform_provision_full_demo(), public.platform_reset_full_demo(), public.platform_demo_status() from public, anon;
grant execute on function public.platform_provision_full_demo(), public.platform_reset_full_demo(), public.platform_demo_status() to authenticated;
