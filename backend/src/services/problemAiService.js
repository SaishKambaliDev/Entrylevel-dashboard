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

const MAX_AI_RETRIES = Number(process.env.AI_MAX_RETRIES || 4);

export async function processProblem(id) {
  // Load current problem to check retry state and avoid clobbering fields
  const existing = await Problem.findById(id).lean();
  if (!existing || existing.ai?.duplicateOf) return;
  const currentRetry = Number(existing.ai?.retryCount || 0);

  // Mark as processing (do this after reading the existing document)
  await Problem.findByIdAndUpdate(id, { $set: { "ai.processingStatus": "PROCESSING", "ai.error": null } }, { new: true });

  try {
    const problem = existing; // use the loaded document for context
    const prompt = `Return JSON only. Assess the report as a community problem. Fields: isCommunityProblem boolean, classification GENERAL_GOVERNMENT|COLLABORATIVE|PERSONAL|SPAM|NEEDS_REVIEW, confidence 0..1, responsibleStakeholder, responsibleGovernmentLevel RURAL|LOCAL|BLOCK|DISTRICT|STATE|null, domains [{domain,confidence}], priorityFactors {severity,urgency,communityImpact,healthSafetyImpact,affectedPopulation,environmentalImpact} all 0..100. Use only provided domain IDs; do not invent authorities, URLs, schemes or IDs.`;

    const locationType = problem.location?.ulbId ? "ULB" : (problem.location ? "VILLAGE" : null);
    const result = await askGemini(prompt, { description: problem.description, allowedDomains: DOMAIN_IDS, ...(locationType ? { locationType } : {}) });

    // Defensive validation: Gemini must return an object. If malformed, fail processing safely.
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Gemini returned a malformed assessment");

    const classification = valid(result.classification, allowed.classification, "NEEDS_REVIEW");
    const isCommunityProblem = Boolean(result.isCommunityProblem) && ["GENERAL_GOVERNMENT", "COLLABORATIVE"].includes(classification);
    const domains = (Array.isArray(result.domains) ? result.domains : []).filter((d) => DOMAIN_IDS.includes(d?.domain)).slice(0, 3).map((d) => ({ domain: d.domain, confidence: Math.max(0, Math.min(1, Number(d.confidence) || 0)) }));
    const relatedDomains = comparableDomains(problem, domains);

    // Candidate selection: only completed, non-duplicate, actionable community problems.
    let candidates = [];
    if (isCommunityProblem) {
      const query = {
        _id: { $ne: id },
        status: { $in: ["AVAILABLE", "UNDER_REVIEW", "ACCEPTED", "UNDER_DEVELOPMENT", "MILESTONE_PROGRESS", "VALIDATION", "DEPLOYED"] },
        "ai.duplicateOf": null,
        "ai.isCommunityProblem": true,
        "ai.classification": { $in: ["GENERAL_GOVERNMENT", "COLLABORATIVE"] },
        "ai.processingStatus": "COMPLETED",
        ...(relatedDomains.length ? { domain: { $in: relatedDomains } } : {})
      };

      // Only include keyword filter if problem has keywords
      if (Array.isArray(problem.keywords) && problem.keywords.length) query.keywords = { $in: problem.keywords };

      // Only include location clauses that exist on the incoming problem to avoid querying with undefined values
      const locationOr = [];
      if (problem.location?.districtId) locationOr.push({ "location.districtId": problem.location.districtId });
      if (problem.location?.blockId) locationOr.push({ "location.blockId": problem.location.blockId });
      if (problem.location?.ulbId) locationOr.push({ "location.ulbId": problem.location.ulbId });
      if (locationOr.length) query.$or = locationOr;

      candidates = await Problem.find(query).select("_id description domain").limit(8).lean();
    }

    let duplicate = null;

    if (candidates.length) {
      const check = await askGemini("Return JSON only {isDuplicate:boolean,confidence:number,candidateId:string}. Determine same underlying issue; never use location or exact text alone.", { report: problem.description, candidates: candidates.map((c) => ({ id: String(c._id), description: c.description, domain: c.domain })) });
      // Validate duplicate check response; if malformed, ignore duplicate suggestion.
      if (check && typeof check === "object" && typeof check.isDuplicate === "boolean" && (typeof check.confidence === "number" || typeof check.confidence === "string") && typeof check.candidateId === "string") {
        const conf = Number(check.confidence) || 0;
        if (check.isDuplicate && conf >= 0.7) duplicate = candidates.find((c) => String(c._id) === check.candidateId);
      }
    }

    if (duplicate) {
      // One atomic pipeline update prevents concurrent reports from inflating unique-reporter totals.
      await Problem.findByIdAndUpdate(duplicate._id, [{ $set: { "ai.reporterUserIds": { $setUnion: [{ $ifNull: ["$ai.reporterUserIds", ["$reporterUserId"]] }, [problem.reporterUserId]] }, "ai.reportCount": { $add: [{ $ifNull: ["$ai.reportCount", 1] }, 1] } } }, { $set: { "ai.uniqueReporterCount": { $size: "$ai.reporterUserIds" } } }]);
      await Problem.findByIdAndUpdate(id, { $set: { status: "DUPLICATE", "ai.processingStatus": "COMPLETED", "ai.duplicateOf": duplicate._id, "ai.processedAt": new Date(), "ai.model": MODEL } });
      return;
    }

    const projects = await Project.find({ status: { $in: ["DEPLOYED", "COMPLETED"] } }).populate({ path: "problemId", match: relatedDomains.length ? { domain: { $in: relatedDomains } } : { _id: null }, select: "domain" }).select("title description finalSolution proposedSolution problemId").limit(8).lean();
    const options = projects.filter((p) => p.problemId).map((p) => ({ id: String(p._id), type: "PROJECT", title: p.title, description: p.description || p.finalSolution || p.proposedSolution?.approach || "" }));

    // Fetch scheme candidates from the database now that relatedDomains is known.
    const schemes = relatedDomains.length ? await GovernmentScheme.find({ verified: true, status: "ACTIVE", domains: { $in: relatedDomains }, ...schemeLocationFilter(problem) }).select("schemeCode name description officialUrl governmentLevel").limit(8).lean() : [];
    const schemeOptions = schemes.map((scheme) => ({ id: String(scheme._id), type: "GOVERNMENT_SCHEME", title: scheme.name, description: scheme.description, schemeCode: scheme.schemeCode, officialUrl: scheme.officialUrl, governmentLevel: scheme.governmentLevel }));

    // Use only canonical schemeOptions built from DB; do NOT accept any scheme data from Gemini directly.
    const recommendationOptions = [...options, ...schemeOptions];
    const solution = await askGemini("Return JSON only: {solutionStatus:string,recommendations:[{id:string}],reason:string}. A recommendation ID must be one of the supplied candidates. GOVERNMENT_SCHEME may be selected only for a supplied GOVERNMENT_SCHEME candidate. Never invent names, IDs, schemes or URLs.", { report: problem.description, candidates: recommendationOptions });

    // Defensive validation of solution shape.
    const optionById = new Map(recommendationOptions.map((option) => [option.id, option]));
    const rawRecs = Array.isArray(solution?.recommendations) ? solution.recommendations : [];
    const seen = new Set();
    const recommendations = [];
    for (const item of rawRecs) {
      if (!item || typeof item !== "object" || typeof item.id !== "string") continue;
      if (!optionById.has(item.id)) continue; // only allow DB-backed candidates
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      const canonical = optionById.get(item.id);
      // For government schemes, ensure canonical fields (schemeCode, officialUrl) come from DB record only.
      if (canonical.type === "GOVERNMENT_SCHEME") {
        recommendations.push({ id: canonical.id, type: canonical.type, title: canonical.title, schemeCode: canonical.schemeCode, officialUrl: canonical.officialUrl });
      } else {
        recommendations.push({ id: canonical.id, type: canonical.type, title: canonical.title });
      }
      if (recommendations.length >= 5) break;
    }

    const requestedStatus = valid(solution?.solutionStatus, ["EXISTING_SOLUTION", "GOVERNMENT_SCHEME", "COLLABORATIVE_SOLUTION_NEEDED", "NONE_FOUND"], "NONE_FOUND");
    const hasProjectRecommendation = recommendations.some((item) => item.type === "PROJECT");
    const hasSchemeRecommendation = recommendations.some((item) => item.type === "GOVERNMENT_SCHEME");
    const solutionStatus = requestedStatus === "GOVERNMENT_SCHEME" && !hasSchemeRecommendation ? "NONE_FOUND" : requestedStatus === "EXISTING_SOLUTION" && !hasProjectRecommendation ? "NONE_FOUND" : requestedStatus;

    const priorityFactors = sanitizePriorityFactors(result?.priorityFactors);
    const data = calculateDataPriority(problem); const aiScore = calculateAiPriority(priorityFactors);
    const workflowStatus = classification === "NEEDS_REVIEW" ? "UNDER_REVIEW" : isCommunityProblem ? "AVAILABLE" : "REJECTED";
    await Problem.findByIdAndUpdate(id, { $set: { status: workflowStatus, "ai.processingStatus": classification === "NEEDS_REVIEW" ? "NEEDS_REVIEW" : "COMPLETED", "ai.isCommunityProblem": isCommunityProblem, "ai.classification": classification, "ai.responsibleStakeholder": valid(result.responsibleStakeholder, allowed.stakeholder), "ai.responsibleGovernmentLevel": valid(result.responsibleGovernmentLevel, allowed.level), "ai.domains": domains, "ai.confidence": Math.max(0, Math.min(1, Number(result.confidence) || 0)), "ai.solutionStatus": solutionStatus, "ai.recommendations": recommendations, "ai.aiPriorityScore": aiScore, "ai.dataPriorityScore": data.score, "ai.finalPriorityScore": Math.round((aiScore + data.score) / 2), "ai.priorityBreakdown": { aiFactors: priorityFactors, data: data.breakdown }, "ai.processedAt": new Date(), "ai.model": MODEL, domain: domains[0]?.domain || problem.domain } });
  } catch (error) {
    // Determine if the error looks transient (network / 5xx / timeouts)
    const msg = String(error?.message || error || "");
    const isTransient = /AbortError|ECONNRESET|ENOTFOUND|ETIMEDOUT|network|AI services unavailable|Gemini request failed \(5/i.test(msg);
    const nextRetry = currentRetry + 1;

    if (isTransient && nextRetry <= MAX_AI_RETRIES) {
      // Record retry count and set status back to PENDING so it will be retried
      const backoffSec = Math.min(60, 5 * (2 ** currentRetry));
      await Problem.findByIdAndUpdate(id, { $set: { "ai.processingStatus": "PENDING", "ai.error": msg.slice(0, 500), "ai.retryCount": nextRetry, "ai.processedAt": new Date() } });
      // Schedule a retry with exponential backoff
      setTimeout(() => {
        processProblem(id).catch((err) => console.error("Problem AI retry failed:", err));
      }, backoffSec * 1000);
      return;
    }

    await Problem.findByIdAndUpdate(id, { $set: { "ai.processingStatus": "FAILED", "ai.error": msg.slice(0, 500), "ai.processedAt": new Date(), "ai.retryCount": nextRetry } });
  }
}
