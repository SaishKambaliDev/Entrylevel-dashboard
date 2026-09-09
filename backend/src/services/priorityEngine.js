const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
export function calculateDataPriority(problem, now = Date.now()) {
  const reports = Math.min(30, Math.max(0, ((problem.ai?.reportCount || 1) - 1) * 5));
  const uniqueReporters = Math.min(25, Math.max(0, ((problem.ai?.uniqueReporterCount || 1) - 1) * 5));
  const geography = [problem.location?.districtId, problem.location?.subdivisionId, problem.location?.blockId, problem.location?.villageId || problem.location?.ulbId].filter(Boolean).length * 3;
  const age = Math.min(15, Math.floor(Math.max(0, now - new Date(problem.createdAt || now)) / 604800000));
  const urgency = /\b(urgent|emergency|accident|danger|death|outbreak|flood|fire)\b/i.test(problem.description) ? 18 : 0;
  return { score: clamp(reports + uniqueReporters + geography + age + urgency), breakdown: { reports, uniqueReporters, geography, age, urgency } };
}
export function calculateAiPriority(factors = {}) { const w = { severity: .25, urgency: .2, communityImpact: .25, healthSafetyImpact: .2, affectedPopulation: .05, environmentalImpact: .05 }; return clamp(Object.entries(w).reduce((n, [k, v]) => n + (Number(factors[k]) || 0) * v, 0)); }
