import { PersonalClimb } from '@/services/climblog';

export type ClimbAggregates = {
  sendCount:    number;
  attemptCount: number;
  avgGrade:     number | null;  // 0–4 for KBC; null if no votes
  avgQuality:   number | null;  // 1–3; null if no votes
  topBadges:    string[];       // up to 5, by frequency (setter pick counts as 1 initial vote)
};

export function computeAggregates(
  logs: PersonalClimb[],
  setterGradeVote?: number | null,
  setterBadges?: string[],
): ClimbAggregates {
  let sendCount    = 0;
  let attemptCount = 0;
  const gradeVotes: number[]                = [];
  const qualityVotes: number[]              = [];
  const badgeCounts: Record<string, number> = {};

  // Setter's initial grade vote counts like a community vote
  if (setterGradeVote !== null && setterGradeVote !== undefined) {
    gradeVotes.push(setterGradeVote);
  }
  // Setter's badge picks each count as one initial vote
  for (const b of setterBadges ?? []) {
    badgeCounts[b] = (badgeCounts[b] ?? 0) + 1;
  }

  for (const log of logs) {
    if (log.type === 'ascent') sendCount++;
    else                       attemptCount++;

    if (log.gradeVote !== null && log.gradeVote !== undefined) {
      gradeVotes.push(log.gradeVote);
    }
    if (log.quality > 0) {
      qualityVotes.push(log.quality);
    }
    for (const b of log.badges ?? []) {
      badgeCounts[b] = (badgeCounts[b] ?? 0) + 1;
    }
  }

  const avgGrade = gradeVotes.length > 0
    ? gradeVotes.reduce((s, v) => s + v, 0) / gradeVotes.length
    : null;

  const avgQuality = qualityVotes.length > 0
    ? qualityVotes.reduce((s, v) => s + v, 0) / qualityVotes.length
    : null;

  const topBadges = Object.entries(badgeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([badge]) => badge);

  return { sendCount, attemptCount, avgGrade, avgQuality, topBadges };
}

/** Returns the most recent log entry for the given user, or null. */
export function getPersonalStatus(
  logs: PersonalClimb[],
  uid: string,
): PersonalClimb | null {
  // logs are sorted timestamp desc — first match is the most recent
  return logs.find(l => l.uid === uid) ?? null;
}
