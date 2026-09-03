-- ============================================================
-- FutStats / futebol-analise - Script de Segurança e RLS
-- Execute este script no Supabase SQL Editor para ativar RLS seguro
-- ============================================================

-- 1. Ativar Row Level Security na tabela push_subscriptions
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 2. Revogar políticas legadas ou excessivamente permissivas
DROP POLICY IF EXISTS "Permitir upsert anonimo de push" ON push_subscriptions;
DROP POLICY IF EXISTS "Permitir update anonimo por endpoint" ON push_subscriptions;
DROP POLICY IF EXISTS "Permitir delete anonimo por endpoint" ON push_subscriptions;
DROP POLICY IF EXISTS "Permitir select de assinaturas" ON push_subscriptions;
DROP POLICY IF EXISTS "Permitir insert anonimo controlado" ON push_subscriptions;

-- 3. Apenas a role de backend (service_role) tem acesso total a push_subscriptions
-- Todas as operações de leitura, atualização e exclusão são mediadas com validação de segurança
-- pelo backend serverless em /api/subscribe e /api/cron-alerts
DROP POLICY IF EXISTS "Service role tem acesso total a push_subscriptions" ON push_subscriptions;
CREATE POLICY "Service role tem acesso total a push_subscriptions"
ON push_subscriptions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4. Clientes anônimos NÃO POSSUEM ACESSO A SELECT na tabela push_subscriptions
-- Isso impede que atacantes baixem endpoints e chaves criptográficas de todos os usuários.
-- Operações de leitura são estritamente reservadas para a service_role no backend.
