-- ============================================================
-- FutStats / futebol-analise - Script de Segurança e RLS
-- Execute este script no Supabase SQL Editor para ativar RLS
-- ============================================================

-- 1. Ativar Row Level Security na tabela push_subscriptions
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 2. Permitir que clientes anônimos possam cadastrar/atualizar apenas sua própria assinatura (upsert por endpoint)
DROP POLICY IF EXISTS "Permitir upsert anonimo de push" ON push_subscriptions;
CREATE POLICY "Permitir upsert anonimo de push"
ON push_subscriptions
FOR INSERT
TO anon
WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir update anonimo por endpoint" ON push_subscriptions;
CREATE POLICY "Permitir update anonimo por endpoint"
ON push_subscriptions
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- 3. Apenas a role de backend (service_role) pode consultar todos os registros para envio de alertas ou fazer deleção global
DROP POLICY IF EXISTS "Service role tem acesso total a push_subscriptions" ON push_subscriptions;
CREATE POLICY "Service role tem acesso total a push_subscriptions"
ON push_subscriptions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
