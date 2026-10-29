// Regras de gol compartilhadas entre a tela da partida e os alertas push (lib/push-events.js).

const isOwnGoalEvent = e => e?.detail === "Own Goal" || Boolean(e?.comments && /own goal/i.test(e.comments));

// Cobrança convertida na disputa de pênaltis: a API marca com comments = "Penalty Shootout".
const isShootoutKick = e => Boolean(e?.comments && /shootout/i.test(e.comments));

// A API-Football registra o gol contra no time BENEFICIADO (ex.: Kaio Jorge, do
// Cruzeiro, vem com team = RB Bragantino). Quando o time real do jogador é
// conhecido (playerTeamOf), o beneficiado é o adversário dele.
function isGoalForTeam(e, targetTeam, otherTeam, playerTeamOf = null) {
  if (!e || e.type !== "Goal" || e.detail === "Missed Penalty") return false;
  const targetId = targetTeam?.id != null ? String(targetTeam.id) : "";
  const otherId = otherTeam?.id != null ? String(otherTeam.id) : "";
  const eventTeamId = e.team?.id != null ? String(e.team.id) : "";
  const eventTeamName = String(e.team?.name || "").toLowerCase().trim();
  const targetName = String(targetTeam?.name || "").toLowerCase().trim();

  const isTargetTeam = Boolean((targetId && eventTeamId === targetId) || (targetName && eventTeamName === targetName));
  if (!isOwnGoalEvent(e)) return isTargetTeam;

  const found = e.player?.id != null && playerTeamOf ? playerTeamOf(e.player.id) : null;
  const playerTeam = found != null ? String(found) : null;
  if (playerTeam && (playerTeam === targetId || playerTeam === otherId)) return playerTeam === otherId;
  return isTargetTeam;
}

if (typeof module !== "undefined") module.exports = { isOwnGoalEvent, isShootoutKick, isGoalForTeam };
