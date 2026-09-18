-- Bolão FutStats — Database Schema & RPC Functions
BEGIN;

CREATE TABLE IF NOT EXISTS public.bolao_leagues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) >= 3 AND char_length(name) <= 50),
  invite_code text NOT NULL UNIQUE CHECK (char_length(invite_code) = 8),
  competitions jsonb NOT NULL CHECK (jsonb_typeof(competitions) = 'array'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bolao_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.bolao_leagues(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL,
  participant_token text NOT NULL,
  participant_name text NOT NULL CHECK (char_length(participant_name) >= 2 AND char_length(participant_name) <= 40),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, participant_id)
);

CREATE TABLE IF NOT EXISTS public.bolao_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.bolao_leagues(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL,
  fixture_id bigint NOT NULL,
  fixture_date timestamptz NOT NULL,
  home_score smallint NOT NULL CHECK (home_score >= 0 AND home_score <= 99),
  away_score smallint NOT NULL CHECK (away_score >= 0 AND away_score <= 99),
  points smallint DEFAULT NULL CHECK (points IS NULL OR points IN (0, 1, 3)),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'evaluated', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, participant_id, fixture_id)
);

CREATE INDEX IF NOT EXISTS bolao_participants_league_idx ON public.bolao_participants(league_id);
CREATE INDEX IF NOT EXISTS bolao_participants_user_idx ON public.bolao_participants(participant_id);
CREATE INDEX IF NOT EXISTS bolao_predictions_league_idx ON public.bolao_predictions(league_id);
CREATE INDEX IF NOT EXISTS bolao_predictions_user_idx ON public.bolao_predictions(participant_id);
CREATE INDEX IF NOT EXISTS bolao_predictions_fixture_idx ON public.bolao_predictions(fixture_id);

ALTER TABLE public.bolao_leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bolao_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bolao_predictions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.bolao_leagues, public.bolao_participants, public.bolao_predictions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bolao_leagues, public.bolao_participants, public.bolao_predictions TO service_role;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('bolao_leagues', 'bolao_participants', 'bolao_predictions') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

CREATE POLICY bolao_service_only ON public.bolao_leagues FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY bolao_service_only ON public.bolao_participants FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY bolao_service_only ON public.bolao_predictions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RPC: Criar liga e adicionar criador
CREATE OR REPLACE FUNCTION public.create_bolao_league(
  p_name text,
  p_competitions jsonb,
  p_creator_id uuid,
  p_creator_token text,
  p_creator_name text,
  p_invite_code text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_league_id uuid;
  v_trimmed_name text;
  v_trimmed_creator text;
BEGIN
  v_trimmed_name := trim(p_name);
  v_trimmed_creator := trim(p_creator_name);

  IF char_length(v_trimmed_name) < 3 OR char_length(v_trimmed_name) > 50 THEN
    RAISE EXCEPTION 'Nome da liga deve ter entre 3 e 50 caracteres.';
  END IF;
  IF jsonb_typeof(p_competitions) IS DISTINCT FROM 'array' OR jsonb_array_length(p_competitions) < 1 THEN
    RAISE EXCEPTION 'Selecione ao menos uma competição.';
  END IF;
  IF char_length(v_trimmed_creator) < 2 OR char_length(v_trimmed_creator) > 40 THEN
    RAISE EXCEPTION 'Nome do participante deve ter entre 2 e 40 caracteres.';
  END IF;
  IF p_invite_code IS NULL OR char_length(p_invite_code) <> 8 THEN
    RAISE EXCEPTION 'Código de convite inválido.';
  END IF;

  INSERT INTO public.bolao_leagues (name, invite_code, competitions, created_by, created_at)
  VALUES (v_trimmed_name, upper(p_invite_code), p_competitions, p_creator_id, now())
  RETURNING id INTO v_league_id;

  INSERT INTO public.bolao_participants (league_id, participant_id, participant_token, participant_name, joined_at)
  VALUES (v_league_id, p_creator_id, p_creator_token, v_trimmed_creator, now());

  RETURN jsonb_build_object(
    'league_id', v_league_id,
    'name', v_trimmed_name,
    'invite_code', upper(p_invite_code),
    'competitions', p_competitions
  );
END $$;

-- RPC: Ingressar em liga via código de convite
CREATE OR REPLACE FUNCTION public.join_bolao_league(
  p_invite_code text,
  p_participant_id uuid,
  p_participant_token text,
  p_participant_name text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_league record;
  v_trimmed_name text;
BEGIN
  v_trimmed_name := trim(p_participant_name);

  IF char_length(v_trimmed_name) < 2 OR char_length(v_trimmed_name) > 40 THEN
    RAISE EXCEPTION 'Nome do participante deve ter entre 2 e 40 caracteres.';
  END IF;

  SELECT id, name, competitions, created_by
  INTO v_league
  FROM public.bolao_leagues
  WHERE invite_code = upper(trim(p_invite_code));

  IF v_league.id IS NULL THEN
    RAISE EXCEPTION 'Liga não encontrada com este código de convite.';
  END IF;

  INSERT INTO public.bolao_participants (league_id, participant_id, participant_token, participant_name, joined_at)
  VALUES (v_league.id, p_participant_id, p_participant_token, v_trimmed_name, now())
  ON CONFLICT (league_id, participant_id) DO UPDATE
    SET participant_name = EXCLUDED.participant_name,
        participant_token = EXCLUDED.participant_token;

  RETURN jsonb_build_object(
    'league_id', v_league.id,
    'name', v_league.name,
    'competitions', v_league.competitions
  );
END $$;

-- RPC: Salvar / Atualizar Palpite (com bloqueio rígido de 10 minutos antes do jogo)
CREATE OR REPLACE FUNCTION public.save_bolao_prediction(
  p_league_id uuid,
  p_participant_id uuid,
  p_participant_token text,
  p_fixture_id bigint,
  p_fixture_date timestamptz,
  p_home_score smallint,
  p_away_score smallint
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_authorized boolean;
BEGIN
  -- Verifica autenticação do participante na liga
  SELECT (participant_token = p_participant_token)
  INTO v_authorized
  FROM public.bolao_participants
  WHERE league_id = p_league_id AND participant_id = p_participant_id;

  IF v_authorized IS NOT TRUE THEN
    RAISE EXCEPTION 'Participante não autorizado ou não pertence a esta liga.';
  END IF;

  -- Regra do documento: Pode colocar o palpite no bolão até 10min antes do começo da partida
  IF p_fixture_date - now() < INTERVAL '10 minutes' THEN
    RAISE EXCEPTION 'Prazo de palpites encerrado para esta partida (10 min antes do jogo).';
  END IF;

  IF p_home_score < 0 OR p_home_score > 99 OR p_away_score < 0 OR p_away_score > 99 THEN
    RAISE EXCEPTION 'Placar deve estar entre 0 e 99.';
  END IF;

  INSERT INTO public.bolao_predictions (
    league_id, participant_id, fixture_id, fixture_date,
    home_score, away_score, status, updated_at
  )
  VALUES (
    p_league_id, p_participant_id, p_fixture_id, p_fixture_date,
    p_home_score, p_away_score, 'pending', now()
  )
  ON CONFLICT (league_id, participant_id, fixture_id) DO UPDATE
    SET home_score = EXCLUDED.home_score,
        away_score = EXCLUDED.away_score,
        fixture_date = EXCLUDED.fixture_date,
        updated_at = now()
    WHERE public.bolao_predictions.status = 'pending';

  RETURN true;
END $$;

-- RPC: Apuração de pontos para partida finalizada
-- Regras: Acertou placar exato = 3 pts; acertou resultado (vencedor/empate com outro placar) = 1 pt; errou = 0 pts
CREATE OR REPLACE FUNCTION public.evaluate_bolao_fixture(
  p_fixture_id bigint,
  p_actual_home smallint,
  p_actual_away smallint
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_actual_home < 0 OR p_actual_home > 99 OR p_actual_away < 0 OR p_actual_away > 99 THEN
    RAISE EXCEPTION 'Placar da partida inválido.';
  END IF;

  UPDATE public.bolao_predictions
  SET points = CASE
    -- 1. Placar Exato: 3 pontos
    WHEN home_score = p_actual_home AND away_score = p_actual_away THEN 3
    -- 2. Acertou resultado (mesmo sinal de saldo de gols): 1 ponto
    WHEN (home_score > away_score AND p_actual_home > p_actual_away)
      OR (home_score < away_score AND p_actual_home < p_actual_away)
      OR (home_score = away_score AND p_actual_home = p_actual_away) THEN 1
    -- 3. Errou tudo: 0 pontos
    ELSE 0
  END,
  status = 'evaluated',
  updated_at = now()
  WHERE fixture_id = p_fixture_id AND status = 'pending';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END $$;

-- RPC: Buscar classificação da liga
CREATE OR REPLACE FUNCTION public.get_bolao_ranking(p_league_id uuid)
RETURNS TABLE (
  participant_id uuid,
  participant_name text,
  joined_at timestamptz,
  total_points integer,
  exact_count integer,
  result_count integer,
  wrong_count integer,
  total_predictions integer
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.participant_id,
    p.participant_name,
    p.joined_at,
    COALESCE(SUM(pr.points), 0)::integer AS total_points,
    COALESCE(COUNT(CASE WHEN pr.points = 3 THEN 1 END), 0)::integer AS exact_count,
    COALESCE(COUNT(CASE WHEN pr.points = 1 THEN 1 END), 0)::integer AS result_count,
    COALESCE(COUNT(CASE WHEN pr.points = 0 THEN 1 END), 0)::integer AS wrong_count,
    COALESCE(COUNT(pr.id), 0)::integer AS total_predictions
  FROM public.bolao_participants p
  LEFT JOIN public.bolao_predictions pr
    ON pr.league_id = p.league_id
    AND pr.participant_id = p.participant_id
    AND pr.status = 'evaluated'
  WHERE p.league_id = p_league_id
  GROUP BY p.participant_id, p.participant_name, p.joined_at
  ORDER BY total_points DESC, exact_count DESC, result_count DESC, p.joined_at ASC;
END $$;

GRANT EXECUTE ON FUNCTION public.create_bolao_league(text, jsonb, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.join_bolao_league(text, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_bolao_prediction(uuid, uuid, text, bigint, timestamptz, smallint, smallint) TO service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_bolao_fixture(bigint, smallint, smallint) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_bolao_ranking(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
