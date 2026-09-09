import mongoose from "mongoose";
import Problem from "../models/Problem.js";
import Project from "../models/Project.js";
import Milestone from "../models/Milestone.js";
import Institution from "../models/Institution.js";
import IndustryCollaboration from "../models/IndustryCollaboration.js";
import { isValidDomain } from "../config/domains.js";

const isObjectId = (val) => mongoose.Types.ObjectId.isValid(val);

/**
 * Build a deny-by-default LGD scope directly from the authenticated account.
 * Request parameters are never used to determine authorization.
 */
function jurisdictionFilter(user) {
  switch (user.governmentLevel?.toUpperCase()) {
    case "STATE": return {};
    case "DISTRICT": return user.districtId ? { "location.districtId": user.districtId } : { _id: { $in: [] } };
    case "BLOCK": return user.blockId ? { "location.blockId": user.blockId } : { _id: { $in: [] } };
    case "RURAL": return user.villageId ? { "location.villageId": user.villageId } : { _id: { $in: [] } };
    case "LOCAL": return user.ulbId ? { "location.ulbId": user.ulbId } : { _id: { $in: [] } };
    default: return { _id: { $in: [] } };
  }
}

function jurisdictionLabel(user) {
  if (user.governmentLevel?.toUpperCase() === "STATE") return "Jharkhand — Statewide";
  if (user.districtName) return `${user.districtName} District`;
  return "Assigned Jurisdiction";
}

// GET /api/government/stats
export async function getGovernmentStats(request, response, next) {
  try {
    const user = request.user;
    const jFilter = jurisdictionFilter(user);

    const [
      totalProblemsInArea,
      mySubmissions,
      activeProjects,
      completedProjects,
      delayedMilestones,
    ] = await Promise.all([
      Problem.countDocuments(jFilter),
      Problem.countDocuments({ reporterUserId: user._id }),
      Problem.countDocuments({ ...jFilter, status: { $in: ["UNDER_DEVELOPMENT", "MILESTONE_PROGRESS", "VALIDATION", "ACCEPTED"] } }),
      Problem.countDocuments({ ...jFilter, status: { $in: ["DEPLOYED", "COMPLETED"] } }),
      countDelayedMilestonesInJurisdiction(jFilter),
    ]);

    return response.status(200).json({
      success: true,
      data: {
        jurisdiction: jurisdictionLabel(user),
        governmentLevel: user.governmentLevel,
        department: user.department,
        totalProblemsInArea,
        mySubmissions,
        activeProjects,
        completedProjects,
        delayedMilestones,
      },
    });
  } catch (error) {
    return next(error);
  }
}

// GET /api/government/problems?domain=&status=&search=&page=1&limit=20
export async function getJurisdictionProblems(request, response, next) {
  try {
    const user = request.user;
    const jFilter = jurisdictionFilter(user);

    const { domain, status, search } = request.query;
    const page = Math.max(1, parseInt(request.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(request.query.limit, 10) || 20));

    const query = { ...jFilter };
    if (domain && isValidDomain(domain)) query.domain = domain;
    if (status) query.status = status;
    if (search && search.trim()) {
      query.description = { $regex: search.trim(), $options: "i" };
    }

    const [problems, total] = await Promise.all([
      Problem.find(query)
        .populate("acceptedByInstitutionId", "institutionName aisheCode")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Problem.countDocuments(query),
    ]);

    // Enrich with project status/completion
    const problemIds = problems.map((p) => p._id);
    const projects = await Project.find({ problemId: { $in: problemIds } })
      .select("problemId status expectedCompletionDate title")
      .lean();
    const projectMap = new Map(projects.map((pr) => [String(pr.problemId), pr]));

    const enriched = problems.map((p) => ({
      ...p,
      assignedHeiName: p.acceptedByInstitutionId?.institutionName || null,
      project: projectMap.get(String(p._id)) || null,
    }));

    return response.status(200).json({
      success: true,
      data: {
        problems: enriched,
        total,
        page,
        pages: Math.ceil(total / limit),
        jurisdiction: jurisdictionLabel(user),
      },
    });
  } catch (error) {
    return next(error);
  }
}

// General government issues are intentionally separate from HEI/industry collaboration work.
export async function getGeneralProblems(request, response, next) {
  try {
    const page = Math.max(1, parseInt(request.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(request.query.limit, 10) || 20));
    const query = { ...jurisdictionFilter(request.user), "ai.classification": "GENERAL_GOVERNMENT", "ai.duplicateOf": null };
    if (request.user.governmentLevel?.toUpperCase() !== "STATE") query["ai.responsibleGovernmentLevel"] = request.user.governmentLevel?.toUpperCase();
    const [problems, total] = await Promise.all([
      Problem.find(query).sort({ "ai.finalPriorityScore": -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Problem.countDocuments(query),
    ]);
    return response.status(200).json({ success: true, data: { problems, total, page, pages: Math.ceil(total / limit), jurisdiction: jurisdictionLabel(request.user) } });
  } catch (error) { return next(error); }
}

// GET /api/government/projects?domain=&status=&page=1&limit=20
export async function getJurisdictionProjects(request, response, next) {
  try {
    const user = request.user;
    const jFilter = jurisdictionFilter(user);

    const { domain, status, search } = request.query;
    const page = Math.max(1, parseInt(request.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(request.query.limit, 10) || 20));

    // First, find problems in jurisdiction matching filters
    const problemQuery = { ...jFilter, acceptedByInstitutionId: { $ne: null } };
    if (domain && isValidDomain(domain)) problemQuery.domain = domain;
    if (search && search.trim()) {
      problemQuery.description = { $regex: search.trim(), $options: "i" };
    }

    const matchingProblems = await Problem.find(problemQuery)
      .select("_id description domain location acceptedByInstitutionId status")
      .lean();
    const problemIds = matchingProblems.map((p) => p._id);
    const problemMap = new Map(matchingProblems.map((p) => [String(p._id), p]));

    // Then find projects for those problems
    const projectQuery = { problemId: { $in: problemIds } };
    if (status) projectQuery.status = status;

    const [projects, total] = await Promise.all([
      Project.find(projectQuery)
        .populate("institutionId", "institutionName aisheCode district")
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Project.countDocuments(projectQuery),
    ]);

    // Attach milestone counts
    const projectIds = projects.map((pr) => pr._id);
    const milestoneCounts = await Milestone.aggregate([
      { $match: { projectId: { $in: projectIds } } },
      { $group: { _id: "$projectId", total: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] } }, delayed: { $sum: { $cond: [{ $eq: ["$status", "DELAYED"] }, 1, 0] } } } },
    ]);
    const milestoneMap = new Map(milestoneCounts.map((m) => [String(m._id), m]));

    const enriched = projects.map((pr) => {
      const problem = problemMap.get(String(pr.problemId)) || {};
      const ms = milestoneMap.get(String(pr._id)) || { total: 0, completed: 0, delayed: 0 };
      const progress = ms.total > 0 ? Math.round((ms.completed / ms.total) * 100) : 0;
      return {
        ...pr,
        problem: {
          _id: problem._id,
          description: problem.description,
          domain: problem.domain,
          location: problem.location,
          status: problem.status,
        },
        milestones: ms,
        progress,
      };
    });

    return response.status(200).json({
      success: true,
      data: {
        projects: enriched,
        total,
        page,
        pages: Math.ceil(total / limit),
        jurisdiction: jurisdictionLabel(user),
      },
    });
  } catch (error) {
    return next(error);
  }
}

// GET /api/government/projects/:id
export async function getProjectDetails(request, response, next) {
  try {
    const user = request.user;
    const { id } = request.params;

    if (!isObjectId(id)) {
      return response.status(400).json({ success: false, message: "Invalid project ID." });
    }

    const project = await Project.findById(id)
      .populate("institutionId", "institutionName aisheCode institutionType district")
      .populate("assignedFaculty", "name email")
      .lean();

    if (!project) {
      return response.status(404).json({ success: false, message: "Project not found." });
    }

    // Load the associated problem and enforce jurisdiction
    const problem = await Problem.findById(project.problemId)
      .populate("acceptedByInstitutionId", "institutionName")
      .lean();

    if (!problem) {
      return response.status(404).json({ success: false, message: "Associated problem not found." });
    }

    // Apply the same deny-by-default filter used by the list endpoints. This
    // avoids a direct project URL bypass for users with no assigned district.
    const inJurisdiction = await Problem.exists({
      _id: problem._id,
      ...jurisdictionFilter(user),
    });
    if (!inJurisdiction) {
      return response.status(403).json({ success: false, message: "This project is outside your jurisdiction." });
    }

    const milestones = await Milestone.find({ projectId: project._id })
      .sort({ expectedCompletionDate: 1, createdAt: 1 })
      .lean();

    // Load approved/active industry collaboration for this project
    const collaboration = await IndustryCollaboration.findOne({
      projectId: project._id,
      status: { $in: ["APPROVED", "ACTIVE", "COMPLETED"] },
    })
      .populate("industryId", "organizationName organizationType")
      .populate("requestedBy", "name email")
      .lean();

    const totalMilestones = milestones.length;
    const completedMilestones = milestones.filter((m) => m.status === "COMPLETED").length;
    const progress = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

    return response.status(200).json({
      success: true,
      data: {
        project,
        problem,
        milestones,
        progress,
        collaboration: collaboration || null,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function countDelayedMilestonesInJurisdiction(problemFilter) {
  const problems = await Problem.find(problemFilter).select("_id").lean();
  const problemIds = problems.map((problem) => problem._id);
  if (problemIds.length === 0) return 0;

  const projects = await Project.find({ problemId: { $in: problemIds } }).select("_id").lean();
  const projectIds = projects.map((project) => project._id);
  if (projectIds.length === 0) return 0;

  return Milestone.countDocuments({ projectId: { $in: projectIds }, status: "DELAYED" });
}
