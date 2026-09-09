import mongoose from "mongoose";
import Institution from "../models/Institution.js";
import Problem from "../models/Problem.js";
import Project from "../models/Project.js";
import Milestone from "../models/Milestone.js";
import IndustryCollaboration from "../models/IndustryCollaboration.js";
import { PREDEFINED_DOMAINS, DOMAIN_IDS, isValidDomain } from "../config/domains.js";

const isObjectId = (val) => mongoose.Types.ObjectId.isValid(val);

function sanitizeProblemForReporter(problem) {
  const obj = problem.toObject ? problem.toObject() : { ...problem };
  if (obj.isAnonymous) {
    delete obj.reporterSnapshot;
  }
  return obj;
}

// 1. Domain Configuration
export async function getHeiDomains(request, response, next) {
  try {
    const institution = await Institution.findById(request.user.institutionId).select("institutionName aisheCode domains").lean();
    if (!institution) {
      return response.status(404).json({ success: false, message: "Institution not found." });
    }

    return response.status(200).json({
      success: true,
      data: {
        allDomains: PREDEFINED_DOMAINS,
        selectedDomains: institution.domains || [],
        institutionName: institution.institutionName,
      },
    });
  } catch (error) {
    return next(error);
  }
}

export async function updateHeiDomains(request, response, next) {
  try {
    const incomingDomains = Array.isArray(request.body.domains) ? request.body.domains : [];
    const validDomains = incomingDomains.filter((id) => isValidDomain(id));

    const updated = await Institution.findByIdAndUpdate(
      request.user.institutionId,
      { $set: { domains: validDomains } },
      { new: true }
    ).select("domains institutionName");

    if (!updated) {
      return response.status(404).json({ success: false, message: "Institution not found." });
    }

    return response.status(200).json({
      success: true,
      message: "Domain expertise updated successfully.",
      data: { selectedDomains: updated.domains },
    });
  } catch (error) {
    return next(error);
  }
}

// 2. Problem Discovery
export async function getAvailableProblems(request, response, next) {
  try {
    const institutionId = request.user.institutionId;
    const institution = await Institution.findById(institutionId).select("domains").lean();
    const selectedDomains = institution?.domains || [];

    const domainFilter = request.query.domain;
    const query = {
      status: "AVAILABLE",
      "ai.classification": { $ne: "GENERAL_GOVERNMENT" },
      "ai.isCommunityProblem": { $ne: false },
      "ai.duplicateOf": null,
      acceptedByInstitutionId: null,
      "rejectedBy.institutionId": { $ne: institutionId },
    };

    if (domainFilter && isValidDomain(domainFilter)) {
      query.domain = domainFilter;
    } else if (selectedDomains.length > 0 && request.query.showAll !== "true") {
      query.domain = { $in: selectedDomains };
    }

    const problems = await Problem.find(query)
      .sort({ createdAt: -1 })
      .lean();

    const sanitized = problems.map((p) => sanitizeProblemForReporter(p));
    return response.status(200).json({ success: true, data: sanitized });
  } catch (error) {
    return next(error);
  }
}

export async function getProblemDetails(request, response, next) {
  try {
    const { id } = request.params;
    const query = isObjectId(id) ? { _id: id } : { problemId: id };
    const problem = await Problem.findOne(query).lean();

    if (!problem) {
      return response.status(404).json({ success: false, message: "Problem not found." });
    }

    return response.status(200).json({ success: true, data: sanitizeProblemForReporter(problem) });
  } catch (error) {
    return next(error);
  }
}

// 3. Atomic Problem Acceptance (Concurrency-Safe)
export async function acceptProblem(request, response, next) {
  try {
    const { id } = request.params;
    const institutionId = request.user.institutionId;
    const findCondition = {
      ...(isObjectId(id) ? { _id: id } : { problemId: id }),
      status: "AVAILABLE",
      "ai.classification": { $ne: "GENERAL_GOVERNMENT" },
      "ai.isCommunityProblem": { $ne: false },
      "ai.duplicateOf": null,
      acceptedByInstitutionId: null,
    };

    // Atomic conditional update ensures only ONE HEI can ever accept this problem
    const updatedProblem = await Problem.findOneAndUpdate(
      findCondition,
      {
        $set: {
          status: "ACCEPTED",
          acceptedByInstitutionId: institutionId,
          acceptedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!updatedProblem) {
      return response.status(409).json({
        success: false,
        message: "Problem has already been accepted by another HEI or is no longer available.",
      });
    }

    // Automatically initialize or link HEI Project
    let project = await Project.findOne({ problemId: updatedProblem._id });
    if (!project) {
      project = await Project.create({
        problemId: updatedProblem._id,
        institutionId,
        title: `Project: ${updatedProblem.problemId}`,
        description: updatedProblem.description,
        status: "ACCEPTED",
      });
    }

    return response.status(200).json({
      success: true,
      message: "Problem accepted successfully.",
      data: { problem: sanitizeProblemForReporter(updatedProblem), project },
    });
  } catch (error) {
    return next(error);
  }
}

// 4. Reject Problem (Excludes only for this HEI)
export async function rejectProblem(request, response, next) {
  try {
    const { id } = request.params;
    const institutionId = request.user.institutionId;
    const query = isObjectId(id) ? { _id: id } : { problemId: id };

    const problem = await Problem.findOne(query);
    if (!problem) {
      return response.status(404).json({ success: false, message: "Problem not found." });
    }

    if (problem.status !== "AVAILABLE") {
      return response.status(400).json({ success: false, message: "Only available problems can be rejected." });
    }

    const alreadyRejected = problem.rejectedBy.some((r) => r.institutionId?.equals(institutionId));
    if (alreadyRejected) {
      return response.status(400).json({ success: false, message: "You have already rejected this problem." });
    }

    const rejectionReason = (request.body.rejectionReason || "").trim() || "Outside current institutional scope";

    problem.rejectedBy.push({
      institutionId,
      rejectionReason,
      rejectedAt: new Date(),
    });

    await problem.save();

    return response.status(200).json({
      success: true,
      message: "Problem rejected. It will remain available for other eligible HEIs.",
    });
  } catch (error) {
    return next(error);
  }
}

// 5. HEI Project Management
export async function getProjects(request, response, next) {
  try {
    const projects = await Project.find({ institutionId: request.user.institutionId })
      .populate("problemId", "problemId description location domain status createdAt")
      .sort({ updatedAt: -1 })
      .lean();

    return response.status(200).json({ success: true, data: projects });
  } catch (error) {
    return next(error);
  }
}

export async function getProjectDetails(request, response, next) {
  try {
    const { id } = request.params;
    if (!isObjectId(id)) {
      return response.status(400).json({ success: false, message: "Invalid project ID." });
    }

    const project = await Project.findOne({ _id: id, institutionId: request.user.institutionId })
      .populate("problemId")
      .populate("assignedStudents", "name email")
      .populate("assignedFaculty", "name email")
      .populate("assignedIndustryMentors", "name email organizationName")
      .lean();

    if (!project) {
      return response.status(404).json({ success: false, message: "Project not found." });
    }

    const milestones = await Milestone.find({ projectId: project._id })
      .sort({ expectedCompletionDate: 1, createdAt: 1 })
      .lean();

    if (project.problemId) {
      project.problemId = sanitizeProblemForReporter(project.problemId);
    }

    return response.status(200).json({ success: true, data: { project, milestones } });
  } catch (error) {
    return next(error);
  }
}

export async function updateProject(request, response, next) {
  try {
    const { id } = request.params;
    if (!isObjectId(id)) {
      return response.status(400).json({ success: false, message: "Invalid project ID." });
    }

    const {
      title,
      description,
      proposedSolution,
      expectedCompletionDate,
      actualCompletionDate,
      status,
      assignedStudents,
      assignedFaculty,
      assignedIndustryMentors,
      finalSolution,
    } = request.body;

    const updates = {};
    if (typeof title === "string" && title.trim()) updates.title = title.trim();
    if (typeof description === "string") updates.description = description.trim();
    if (proposedSolution && typeof proposedSolution === "object") updates.proposedSolution = proposedSolution;
    if (expectedCompletionDate) updates.expectedCompletionDate = new Date(expectedCompletionDate);
    if (actualCompletionDate) updates.actualCompletionDate = new Date(actualCompletionDate);
    if (Array.isArray(assignedStudents)) updates.assignedStudents = assignedStudents.filter(isObjectId);
    if (Array.isArray(assignedFaculty)) updates.assignedFaculty = assignedFaculty.filter(isObjectId);
    if (Array.isArray(assignedIndustryMentors)) updates.assignedIndustryMentors = assignedIndustryMentors.filter(isObjectId);
    if (typeof finalSolution === "string") updates.finalSolution = finalSolution.trim();

    if (status) {
      const validStatuses = ["ACCEPTED", "UNDER_DEVELOPMENT", "VALIDATION", "DEPLOYED", "COMPLETED", "ON_HOLD"];
      if (validStatuses.includes(status)) {
        updates.status = status;
      }
    }

    const project = await Project.findOneAndUpdate(
      { _id: id, institutionId: request.user.institutionId },
      { $set: updates },
      { new: true }
    );

    if (!project) {
      return response.status(404).json({ success: false, message: "Project not found." });
    }

    // Synchronize status to referenced Problem if status changed
    if (updates.status) {
      await Problem.findByIdAndUpdate(project.problemId, { $set: { status: updates.status } });
    }

    return response.status(200).json({ success: true, message: "Project updated successfully.", data: project });
  } catch (error) {
    return next(error);
  }
}

// 6. Project Milestones
export async function getProjectMilestones(request, response, next) {
  try {
    const { id } = request.params;
    if (!isObjectId(id)) return response.status(400).json({ success: false, message: "Invalid project ID." });

    const projectExists = await Project.exists({ _id: id, institutionId: request.user.institutionId });
    if (!projectExists) return response.status(404).json({ success: false, message: "Project not found." });

    const milestones = await Milestone.find({ projectId: id }).sort({ expectedCompletionDate: 1, createdAt: 1 }).lean();
    return response.status(200).json({ success: true, data: milestones });
  } catch (error) {
    return next(error);
  }
}

export async function createMilestone(request, response, next) {
  try {
    const { id } = request.params;
    if (!isObjectId(id)) return response.status(400).json({ success: false, message: "Invalid project ID." });

    const project = await Project.findOne({ _id: id, institutionId: request.user.institutionId });
    if (!project) return response.status(404).json({ success: false, message: "Project not found." });

    const { title, description, expectedCompletionDate, status, completionPercentage, report, remarks, geotaggedPhotos } = request.body;
    if (!title || typeof title !== "string" || !title.trim()) {
      return response.status(400).json({ success: false, message: "Milestone title is required." });
    }

    const milestone = await Milestone.create({
      projectId: project._id,
      title: title.trim(),
      description: typeof description === "string" ? description.trim() : "",
      expectedCompletionDate: expectedCompletionDate ? new Date(expectedCompletionDate) : undefined,
      status: status || "NOT_STARTED",
      completionPercentage: Number.isFinite(completionPercentage) ? Math.min(100, Math.max(0, completionPercentage)) : 0,
      report: typeof report === "string" ? report.trim() : "",
      remarks: typeof remarks === "string" ? remarks.trim() : "",
      geotaggedPhotos: Array.isArray(geotaggedPhotos) ? geotaggedPhotos : [],
    });

    // Advance project to UNDER_DEVELOPMENT if it was ACCEPTED
    if (project.status === "ACCEPTED") {
      project.status = "UNDER_DEVELOPMENT";
      await project.save();
      await Problem.findByIdAndUpdate(project.problemId, { $set: { status: "UNDER_DEVELOPMENT" } });
    }

    return response.status(201).json({ success: true, message: "Milestone created.", data: milestone });
  } catch (error) {
    return next(error);
  }
}

export async function updateMilestone(request, response, next) {
  try {
    const { id } = request.params;
    if (!isObjectId(id)) return response.status(400).json({ success: false, message: "Invalid milestone ID." });

    const milestone = await Milestone.findById(id);
    if (!milestone) return response.status(404).json({ success: false, message: "Milestone not found." });

    // Verify ownership via Project
    const project = await Project.findOne({ _id: milestone.projectId, institutionId: request.user.institutionId });
    if (!project) return response.status(403).json({ success: false, message: "Unauthorized." });

    const { title, description, expectedCompletionDate, status, completionPercentage, report, remarks, geotaggedPhotos } = request.body;
    if (typeof title === "string" && title.trim()) milestone.title = title.trim();
    if (typeof description === "string") milestone.description = description.trim();
    if (expectedCompletionDate) milestone.expectedCompletionDate = new Date(expectedCompletionDate);
    if (status && ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "DELAYED"].includes(status)) milestone.status = status;
    if (Number.isFinite(completionPercentage)) milestone.completionPercentage = Math.min(100, Math.max(0, completionPercentage));
    if (typeof report === "string") milestone.report = report.trim();
    if (typeof remarks === "string") milestone.remarks = remarks.trim();
    if (Array.isArray(geotaggedPhotos)) milestone.geotaggedPhotos = geotaggedPhotos;
    milestone.updateDate = new Date();

    await milestone.save();

    return response.status(200).json({ success: true, message: "Milestone updated.", data: milestone });
  } catch (error) {
    return next(error);
  }
}

// 7. HEI Overview & Analytics
export async function getHeiAnalytics(request, response, next) {
  try {
    const institutionId = request.user.institutionId;
    const institution = await Institution.findById(institutionId).select("domains").lean();
    const domains = institution?.domains || [];

    const now = new Date();

    const [
      availableCount,
      acceptedCount,
      rejectedProblems,
      projects,
    ] = await Promise.all([
      Problem.countDocuments({
        status: "AVAILABLE",
        "ai.classification": { $ne: "GENERAL_GOVERNMENT" },
        "ai.isCommunityProblem": { $ne: false },
        "ai.duplicateOf": null,
        acceptedByInstitutionId: null,
        "rejectedBy.institutionId": { $ne: institutionId },
        ...(domains.length > 0 ? { domain: { $in: domains } } : {}),
      }),
      Problem.countDocuments({ acceptedByInstitutionId: institutionId }),
      Problem.countDocuments({ "rejectedBy.institutionId": institutionId }),
      Project.find({ institutionId }).select("status expectedCompletionDate").lean(),
    ]);

    const activeProjects = projects.filter((p) => ["ACCEPTED", "UNDER_DEVELOPMENT", "VALIDATION", "DEPLOYED"].includes(p.status)).length;
    const completedProjects = projects.filter((p) => p.status === "COMPLETED").length;
    const underDevelopment = projects.filter((p) => p.status === "UNDER_DEVELOPMENT").length;
    const delayedProjects = projects.filter((p) => p.status !== "COMPLETED" && p.expectedCompletionDate && new Date(p.expectedCompletionDate) < now).length;
    const totalProjects = projects.length;
    const completionRate = totalProjects > 0 ? Math.round((completedProjects / totalProjects) * 100) : 0;

    return response.status(200).json({
      success: true,
      data: {
        totalAvailableProblems: availableCount,
        totalAccepted: acceptedCount,
        totalRejected: rejectedProblems,
        activeProjects,
        completedProjects,
        projectsUnderDevelopment: underDevelopment,
        delayedProjects,
        completionRate,
      },
    });
  } catch (error) {
    return next(error);
  }
}

// 8. HEI Collaboration Requests
export async function getCollaborationRequests(request, response, next) {
  try {
    const institutionId = request.user.institutionId;
    const requests = await IndustryCollaboration.find({ institutionId })
      .populate("industryId", "organizationName organizationType domains district state contactEmail contactPhone website")
      .populate("projectId", "title status expectedCompletionDate proposedSolution")
      .populate("problemId", "problemId title domain location")
      .populate("requestedBy", "name email phone")
      .populate("approvedBy", "name email")
      .sort({ createdAt: -1 })
      .lean();

    return response.status(200).json({ success: true, data: requests });
  } catch (error) {
    return next(error);
  }
}

export async function approveCollaborationRequest(request, response, next) {
  try {
    const institutionId = request.user.institutionId;
    const collaboration = await IndustryCollaboration.findOne({
      _id: request.params.id,
      institutionId,
      status: "PENDING",
    });

    if (!collaboration) {
      return response.status(404).json({
        success: false,
        message: "Collaboration request not found or not in pending status.",
      });
    }

    collaboration.status = "APPROVED";
    collaboration.approvedAt = new Date();
    collaboration.approvedBy = request.user._id;
    await collaboration.save();

    return response.status(200).json({
      success: true,
      message: "Collaboration request approved successfully.",
      data: collaboration,
    });
  } catch (error) {
    return next(error);
  }
}

export async function rejectCollaborationRequest(request, response, next) {
  try {
    const institutionId = request.user.institutionId;
    const collaboration = await IndustryCollaboration.findOne({
      _id: request.params.id,
      institutionId,
      status: "PENDING",
    });

    if (!collaboration) {
      return response.status(404).json({
        success: false,
        message: "Collaboration request not found or not in pending status.",
      });
    }

    collaboration.status = "REJECTED";
    collaboration.rejectedAt = new Date();
    collaboration.rejectionReason = typeof request.body.rejectionReason === "string"
      ? request.body.rejectionReason.trim()
      : "";
    await collaboration.save();

    return response.status(200).json({
      success: true,
      message: "Collaboration request rejected.",
      data: collaboration,
    });
  } catch (error) {
    return next(error);
  }
}
