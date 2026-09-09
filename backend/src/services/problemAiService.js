import Problem from "../models/Problem.js";
import Project from "../models/Project.js";
import GovernmentScheme from "../models/GovernmentScheme.js";
import { DOMAIN_IDS } from "../config/domains.js";
import { askGemini, MODEL } from "./geminiService.js";
import { calculateAiPriority, calculateDataPriority } from "./priorityEngine.js";

const allowed = { classification: ["GENERAL_GOVERNMENT", "COLLABORATIVE", "PERSONAL", "SPAM", "NEEDS_REVIEW"], stakeholder: ["GOVERNMENT", "HEI", "INDUSTRY", "HEI_INDUSTRY", "GOVERNMENT_HEI", "GOVERNMENT_INDUSTRY", "GOVERNMENT_HEI_INDUSTRY"], level: ["RURAL", "LOCAL", "BLOCK", "DISTRICT", "STATE"] };
const valid = (value, list, fallback = null) => list.includes(value) ? value : fallback;
const normalise = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
const keywords = (text) => [...new Set(normalise(text).split(" ").filter((word) => word.length > 3))].slice(0, 15);
export const problemSearchMetadata = (description) => ({ normalizedDescription: normalise(description), keywords: keywords(description) });
const priorityKeys = ["severity", "urgency", "communityImpact", "healthSafetyImpact", "affectedPopulation", "environmentalImpact"];
function sanitizePriorityFactors(raw) {
  const factors = {};
  for (const key of priorityKeys) {
    const score = Number(raw?.[key]);
    factors[key] = Number.isFinite(score) && score >= 0 && score <= 100 ? score : 0;
  }
  return factors;
}
function comparableDomains(problem, domains) {
  return [...new Set([...domains.map((item) => item.domain), problem.domain].filter((domain) => DOMAIN_IDS.includes(domain) && domain !== "OTHER"))];
}
function schemeLocationFilter(problem) {
  const location = problem.location || {};
  const scopes = [{ governmentLevel: "STATE" }];
  if (location.districtId) scopes.push({ districtId: location.districtId });
  if (location.blockId) scopes.push({ blockId: location.blockId });
  if (location.villageId) scopes.push({ villageId: location.villageId });
  if (location.ulbId) scopes.push({ ulbId: location.ulbId });
  return { $or: scopes };
}

export async function processProblem(id) {
  const problem = await Problem.findByIdAndUpdate(id, { $set: { "ai.processingStatus": "PROCESSING", "ai.error": null } }, { new: true });
  if (!problem || problem.ai?.duplicateOf) return;
  try {
    const prompt = `Return JSON only. Assess the report as a community problem. Fields: isCommunityProblem boolean, classification GENERAL_GOVERNMENT|COLLABORATIVE|PERSONAL|SPAM|NEEDS_REVIEW, confidence 0..1, responsibleStakeholder, responsibleGovernmentLevel RURAL|LOCAL|BLOCK|DISTRICT|STATE|null, domains [{domain,confidence}], priorityFactors {severity,urgency,communityImpact,healthSafetyImpact,affectedPopulation,environmentalImpact} all 0..100. Use only provided domain IDs; do not invent authorities, URLs, schemes or IDs.`;
    const result = await askGemini(prompt, { description: problem.description, allowedDomains: DOMAIN_IDS, locationType: problem.location.ulbId ? "ULB" : "VILLAGE" });
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Gemini returned a malformed assessment");
    const classification = valid(result.classification, allowed.classification, "NEEDS_REVIEW");
    const isCommunityProblem = Boolean(result.isCommunityProblem) && ["GENERAL_GOVERNMENT", "COLLABORATIVE"].includes(classification);
    const domains = (Array.isArray(result.domains) ? result.domains : []).filter((d) => DOMAIN_IDS.includes(d?.domain)).slice(0, 3).map((d) => ({ domain: d.domain, confidence: Math.max(0, Math.min(1, Number(d.confidence) || 0)) }));
    const relatedDomains = comparableDomains(problem, domains);
    const candidates = isCommunityProblem ? await Problem.find({ _id: { $ne: id }, status: { $in: ["AVAILABLE", "UNDER_REVIEW", "ACCEPTED", "UNDER_DEVELOPMENT", "MILESTONE_PROGRESS", "VALIDATION", "DEPLOYED"] }, "ai.duplicateOf": null, "ai.isCommunityProblem": true, "ai.classification": { $in: ["GENERAL_GOVERNMENT", "COLLABORATIVE"] }, ...(relatedDomains.length ? { domain: { $in: relatedDomains } } : {}), keywords: { $in: problem.keywords }, $or: [{ "location.districtId": problem.location.districtId }, { "location.blockId": problem.location.blockId }, { "location.ulbId": problem.location.ulbId }] }).select("_id description domain").limit(8).lean() : [];
    let duplicate = null;
    if (candidates.length) { const check = await askGemini("Return JSON only {isDuplicate:boolean,confidence:number,candidateId:string}. Determine same underlying issue; never use location or exact text alone.", { report: problem.description, candidates: candidates.map((c) => ({ id: String(c._id), description: c.description, domain: c.domain })) }); duplicate = check.isDuplicate && Number(check.confidence) >= .7 && candidates.find((c) => String(c._id) === check.candidateId); }
    if (duplicate) {
      // One atomic pipeline update prevents concurrent reports from inflating unique-reporter totals.
      await Problem.findByIdAndUpdate(duplicate._id, [{ $set: { "ai.reporterUserIds": { $setUnion: [{ $ifNull: ["$ai.reporterUserIds", ["$reporterUserId"]] }, [problem.reporterUserId]] }, "ai.reportCount": { $add: [{ $ifNull: ["$ai.reportCount", 1] }, 1] } } }, { $set: { "ai.uniqueReporterCount": { $size: "$ai.reporterUserIds" } } }]);
      await Problem.findByIdAndUpdate(id, { $set: { status: "DUPLICATE", "ai.processingStatus": "COMPLETED", "ai.duplicateOf": duplicate._id, "ai.processedAt": new Date(), "ai.model": MODEL } });
      return;
    }
    const projects = await Project.find({ status: { $in: ["DEPLOYED", "COMPLETED"] } }).populate({ path: "problemId", match: relatedDomains.length ? { domain: { $in: relatedDomains } } : { _id: null }, select: "domain" }).select("title description finalSolution proposedSolution problemId").limit(8).lean();
    const options = projects.filter((p) => p.problemId).map((p) => ({ id: String(p._id), type: "PROJECT", title: p.title, description: p.description || p.finalSolution || p.proposedSolution?.approach || "" }));
    const schemes = relatedDomains.length ? await GovernmentScheme.find({ verified: true, status: "ACTIVE", domains: { $in: relatedDomains }, ...schemeLocationFilter(problem) }).select("schemeCode name description officialUrl governmentLevel").limit(8).lean() : [];
    const schemeOptions = schemes.map((scheme) => ({ id: String(scheme._id), type: "GOVERNMENT_SCHEME", title: scheme.name, description: scheme.description, schemeCode: scheme.schemeCode, officialUrl: scheme.officialUrl, governmentLevel: scheme.governmentLevel }));
    const recommendationOptions = [...options, ...schemeOptions];
    const solution = await askGemini("Return JSON only: {solutionStatus:string,recommendations:[{id:string}],reason:string}. A recommendation ID must be one of the supplied candidates. GOVERNMENT_SCHEME may be selected only for a supplied GOVERNMENT_SCHEME candidate. Never invent names, IDs, schemes or URLs.", { report: problem.description, candidates: recommendationOptions });
    const optionById = new Map(recommendationOptions.map((option) => [option.id, option]));
    const recommendations = (Array.isArray(solution?.recommendations) ? solution.recommendations : []).filter((item) => item && typeof item === "object" && typeof item.id === "string" && optionById.has(item.id)).map((item) => optionById.get(item.id)).filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index).slice(0, 5).map((item) => ({ id: item.id, type: item.type, title: item.title, ...(item.type === "GOVERNMENT_SCHEME" ? { schemeCode: item.schemeCode, officialUrl: item.officialUrl } : {}) }));
    const requestedStatus = valid(solution?.solutionStatus, ["EXISTING_SOLUTION", "GOVERNMENT_SCHEME", "COLLABORATIVE_SOLUTION_NEEDED", "NONE_FOUND"], "NONE_FOUND");
    const hasProjectRecommendation = recommendations.some((item) => item.type === "PROJECT");
    const hasSchemeRecommendation = recommendations.some((item) => item.type === "GOVERNMENT_SCHEME");
    const solutionStatus = requestedStatus === "GOVERNMENT_SCHEME" && !hasSchemeRecommendation ? "NONE_FOUND" : requestedStatus === "EXISTING_SOLUTION" && !hasProjectRecommendation ? "NONE_FOUND" : requestedStatus;
    const priorityFactors = sanitizePriorityFactors(result?.priorityFactors);
    const data = calculateDataPriority(problem); const aiScore = calculateAiPriority(priorityFactors);
    const workflowStatus = classification === "NEEDS_REVIEW" ? "UNDER_REVIEW" : isCommunityProblem ? "AVAILABLE" : "REJECTED";
    await Problem.findByIdAndUpdate(id, { $set: { status: workflowStatus, "ai.processingStatus": classification === "NEEDS_REVIEW" ? "NEEDS_REVIEW" : "COMPLETED", "ai.isCommunityProblem": isCommunityProblem, "ai.classification": classification, "ai.responsibleStakeholder": valid(result.responsibleStakeholder, allowed.stakeholder), "ai.responsibleGovernmentLevel": valid(result.responsibleGovernmentLevel, allowed.level), "ai.domains": domains, "ai.confidence": Math.max(0, Math.min(1, Number(result.confidence) || 0)), "ai.solutionStatus": solutionStatus, "ai.recommendations": recommendations, "ai.aiPriorityScore": aiScore, "ai.dataPriorityScore": data.score, "ai.finalPriorityScore": Math.round((aiScore + data.score) / 2), "ai.priorityBreakdown": { aiFactors: priorityFactors, data: data.breakdown }, "ai.processedAt": new Date(), "ai.model": MODEL, domain: domains[0]?.domain || problem.domain } });
  } catch (error) { await Problem.findByIdAndUpdate(id, { $set: { "ai.processingStatus": "FAILED", "ai.error": String(error.message || error).slice(0, 500), "ai.processedAt": new Date() } }); }
}
