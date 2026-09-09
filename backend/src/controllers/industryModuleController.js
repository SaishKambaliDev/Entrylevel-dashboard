import mongoose from "mongoose";
import Industry from "../models/Industry.js";
import Institution from "../models/Institution.js";
import Problem from "../models/Problem.js";
import Project from "../models/Project.js";
import Milestone from "../models/Milestone.js";
import IndustryCollaboration from "../models/IndustryCollaboration.js";
import User from "../models/User.js";
import { PREDEFINED_DOMAINS, isValidDomain } from "../config/domains.js";

function sanitizeProblemForIndustry(problem) {
  if (!problem) return problem;
  const { reporterSnapshot, reporterUserId, attachments, ...safeProblem } = problem;
  return safeProblem;
}

// 1. Get Industry Domains Configuration
export async function getIndustryDomains(request, response, next) {
  try {
    const industry = await Industry.findById(request.user.organizationId)
      .populate("district", "name state")
      .lean();

    if (!industry) {
      return response.status(404).json({ success: false, message: "Industry organization not found." });
    }

    return response.status(200).json({
      success: true,
      data: {
        allDomains: PREDEFINED_DOMAINS,
        selectedDomains: industry.domains || [],
        organization: {
          _id: industry._id,
          organizationName: industry.organizationName,
          organizationType: industry.organizationType,
          district: industry.district?.name || "Jharkhand",
          state: industry.state,
          website: industry.website || "",
          description: industry.description || "",
          contactEmail: industry.contactEmail || "",
          contactPhone: industry.contactPhone || "",
        },
      },
    });
  } catch (error) {
    return next(error);
  }
}

// 2. Update Industry Domains Configuration (Admin only)
export async function updateIndustryDomains(request, response, next) {
  try {
    const { domains, description, website, contactEmail, contactPhone } = request.body;

    if (!Array.isArray(domains)) {
      return response.status(400).json({ success: false, message: "Domains must be provided as an array." });
    }

    const invalid = domains.filter((d) => !isValidDomain(d));
    if (invalid.length > 0) {
      return response.status(400).json({ success: false, message: `Invalid domain(s): ${invalid.join(", ")}` });
    }

    const updates = { domains };
    if (typeof description === "string") updates.description = description.trim();
    if (typeof website === "string") updates.website = website.trim();
    if (typeof contactEmail === "string") updates.contactEmail = contactEmail.trim();
    if (typeof contactPhone === "string") updates.contactPhone = contactPhone.trim();

    const industry = await Industry.findByIdAndUpdate(
      request.user.organizationId,
      { $set: updates },
      { new: true }
    ).lean();

    return response.status(200).json({
      success: true,
      message: "Domain expertise and profile updated successfully.",
      data: {
        selectedDomains: industry.domains,
      },
    });
  } catch (error) {
    return next(error);
  }
}

// 3. Explore Matching HEIs
export async function getMatchingHeis(request, response, next) {
  try {
    const industry = await Industry.findById(request.user.organizationId).select("domains").lean();
    const industryDomains = industry?.domains || [];

    const { search, domain, district } = request.query;
    const query = {};

    if (typeof search === "string" && search.trim()) {
      query.institutionName = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    }

    if (typeof domain === "string" && domain.trim()) {
      query.domains = domain.trim();
    }

    const institutions = await Institution.find(query)
      .populate("district", "name state")
      .lean();

    // Get active project counts per institution
    const activeProjectAgg = await Project.aggregate([
      {
        $match: {
          status: { $in: ["ACCEPTED", "UNDER_DEVELOPMENT", "VALIDATION", "DEPLOYED"] },
        },
      },
      {
        $group: {
          _id: "$institutionId",
          count: { $sum: 1 },
        },
      },
    ]);

    const activeProjectMap = {};
    for (const item of activeProjectAgg) {
      activeProjectMap[item._id.toString()] = item.count;
    }

    // Rank by domain overlap with industry
    const formatted = institutions.map((inst) => {
      const instDomains = inst.domains || [];
      const matchingDomains = instDomains.filter((d) => industryDomains.includes(d));
      return {
        _id: inst._id,
        institutionName: inst.institutionName,
        institutionType: inst.institutionType,
        aisheCode: inst.aisheCode,
        district: inst.district?.name || "Jharkhand",
        state: inst.state,
        domains: instDomains,
        matchingDomains,
        matchingDomainsCount: matchingDomains.length,
        activeProjectsCount: activeProjectMap[inst._id.toString()] || 0,
      };
    });

    // Sort: highest matching domains count first, then by active projects, then name
    formatted.sort((a, b) => {
      if (b.matchingDomainsCount !== a.matchingDomainsCount) {
        return b.matchingDomainsCount - a.matchingDomainsCount;
      }
      if (b.activeProjectsCount !== a.activeProjectsCount) {
        return b.activeProjectsCount - a.activeProjectsCount;
      }
      return a.institutionName.localeCompare(b.institutionName);
    });

    return response.status(200).json({ success: true, data: formatted });
  } catch (error) {
    return next(error);
  }
}

// 4. View Specific HEI Details
export async function getHeiDetails(request, response, next) {
  try {
    const institution = await Institution.findById(request.params.id)
      .populate("district", "name state")
      .lean();

    if (!institution) {
      return response.status(404).json({ success: false, message: "Institution not found." });
    }

    const [activeCount, completedCount] = await Promise.all([
      Project.countDocuments({
        institutionId: institution._id,
        status: { $in: ["ACCEPTED", "UNDER_DEVELOPMENT", "VALIDATION", "DEPLOYED"] },
      }),
      Project.countDocuments({
        institutionId: institution._id,
        status: "COMPLETED",
      }),
    ]);

    const industry = await Industry.findById(request.user.organizationId).select("domains").lean();
    const matchingDomains = (institution.domains || []).filter((d) => (industry?.domains || []).includes(d));

    return response.status(200).json({
      success: true,
      data: {
        institution: {
          _id: institution._id,
          institutionName: institution.institutionName,
          institutionType: institution.institutionType,
          aisheCode: institution.aisheCode,
          district: institution.district?.name || "Jharkhand",
          state: institution.state,
          domains: institution.domains || [],
          matchingDomains,
          activeProjectsCount: activeCount,
          completedProjectsCount: completedCount,
        },
      },
    });
  } catch (error) {
    return next(error);
  }
}

// 5. View Problems & Projects of a Specific HEI
export async function getHeiProjects(request, response, next) {
  try {
    const institutionId = request.params.id;
    const projects = await Project.find({ institutionId })
      .populate("problemId", "problemId title description domain location status")
      .sort({ updatedAt: -1 })
      .lean();

    const projectIds = projects.map((p) => p._id);
    const milestones = await Milestone.find({ projectId: { $in: projectIds } }).lean();

    // Check collaborations this industry already has with these projects
    const existingCollaborations = await IndustryCollaboration.find({
      industryId: request.user.organizationId,
      projectId: { $in: projectIds },
    }).select("projectId status capabilitiesOffered").lean();

    const collabMap = {};
    for (const c of existingCollaborations) {
      collabMap[c.projectId.toString()] = c;
    }

    const formatted = projects.map((proj) => {
      const projMilestones = milestones.filter((m) => m.projectId.toString() === proj._id.toString());
      const completedMilestones = projMilestones.filter((m) => m.status === "COMPLETED").length;
      const totalMilestones = projMilestones.length;
      const averagePercent = totalMilestones > 0
        ? Math.round(projMilestones.reduce((acc, m) => acc + (m.completionPercentage || 0), 0) / totalMilestones)
        : (proj.status === "COMPLETED" ? 100 : 25);

      return {
        _id: proj._id,
        title: proj.title,
        description: proj.description,
        status: proj.status,
        expectedCompletionDate: proj.expectedCompletionDate,
        proposedSolution: proj.proposedSolution,
        problem: sanitizeProblemForIndustry(proj.problemId),
        milestonesCount: totalMilestones,
        completedMilestonesCount: completedMilestones,
        progressPercentage: averagePercent,
        existingCollaboration: collabMap[proj._id.toString()] || null,
      };
    });

    return response.status(200).json({ success: true, data: formatted });
  } catch (error) {
    return next(error);
  }
}

// 6. Request Collaboration
export async function createCollaborationRequest(request, response, next) {
  try {
    const { institutionId, projectId, problemId, message, requestedCapabilities } = request.body;

    if (!institutionId || !projectId) {
      return response.status(400).json({ success: false, message: "Institution ID and Project ID are required." });
    }

    if (!Array.isArray(requestedCapabilities) || requestedCapabilities.length === 0) {
      return response.status(400).json({ success: false, message: "Select at least one capability you can provide." });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return response.status(404).json({ success: false, message: "Project not found." });
    }

    if (project.institutionId.toString() !== institutionId.toString()) {
      return response.status(400).json({ success: false, message: "Project does not belong to the selected institution." });
    }

    // Check if collaboration request already exists and is pending or active
    const existing = await IndustryCollaboration.findOne({
      industryId: request.user.organizationId,
      projectId: project._id,
      status: { $in: ["PENDING", "APPROVED", "ACTIVE"] },
    });

    if (existing) {
      return response.status(409).json({
        success: false,
        message: existing.status === "PENDING"
          ? "A collaboration request is already pending review by this HEI."
          : "An active collaboration already exists for this project.",
        data: existing,
      });
    }

    const collaboration = await IndustryCollaboration.create({
      industryId: request.user.organizationId,
      institutionId,
      problemId: project.problemId || problemId,
      projectId: project._id,
      requestedBy: request.user._id,
      message: typeof message === "string" ? message.trim() : "",
      capabilitiesOffered: requestedCapabilities,
      status: "PENDING",
    });

    return response.status(201).json({
      success: true,
      message: "Collaboration request sent successfully. Awaiting review and approval from the HEI.",
      data: collaboration,
    });
  } catch (error) {
    return next(error);
  }
}

// 7. Get Industry's Collaborations
export async function getIndustryCollaborations(request, response, next) {
  try {
    const query = { industryId: request.user.organizationId };
    if (request.query.status) {
      query.status = request.query.status.toUpperCase();
    }

    const collaborations = await IndustryCollaboration.find(query)
      .populate("institutionId", "institutionName institutionType aisheCode state")
      .populate("problemId", "problemId title domain location status")
      .populate("projectId", "title status expectedCompletionDate proposedSolution")
      .populate("requestedBy", "name email role")
      .populate("approvedBy", "name email")
      .populate("supportCommitments.mentorship.mentorId", "name email phone")
      .sort({ createdAt: -1 })
      .lean();

    return response.status(200).json({ success: true, data: collaborations });
  } catch (error) {
    return next(error);
  }
}

// 8. Get Collaboration Details
export async function getIndustryCollaborationDetails(request, response, next) {
  try {
    const collaboration = await IndustryCollaboration.findOne({
      _id: request.params.id,
      industryId: request.user.organizationId,
    })
      .populate("institutionId", "institutionName institutionType aisheCode state domains")
      .populate("problemId", "problemId title description domain location status")
      .populate("projectId")
      .populate("requestedBy", "name email role")
      .populate("approvedBy", "name email")
      .populate("supportCommitments.mentorship.mentorId", "name email phone")
      .lean();

    if (!collaboration) {
      return response.status(404).json({ success: false, message: "Collaboration not found." });
    }

    collaboration.problemId = sanitizeProblemForIndustry(collaboration.problemId);

    let milestones = [];
    if (collaboration.projectId) {
      milestones = await Milestone.find({ projectId: collaboration.projectId._id })
        .sort({ expectedCompletionDate: 1 })
        .lean();
    }

    return response.status(200).json({
      success: true,
      data: {
        collaboration,
        milestones,
      },
    });
  } catch (error) {
    return next(error);
  }
}

// 9. Update Collaboration Support / Commitments
export async function updateCollaborationSupport(request, response, next) {
  try {
    const collaboration = await IndustryCollaboration.findOne({
      _id: request.params.id,
      industryId: request.user.organizationId,
    });

    if (!collaboration) {
      return response.status(404).json({ success: false, message: "Collaboration not found." });
    }

    // Strict state check: MUST be APPROVED or ACTIVE
    if (collaboration.status === "PENDING") {
      return response.status(403).json({
        success: false,
        message: "Cannot assign commitments before the HEI approves the collaboration request.",
      });
    }

    if (["REJECTED", "CANCELLED"].includes(collaboration.status)) {
      return response.status(400).json({
        success: false,
        message: `Cannot update support commitments on a ${collaboration.status.toLowerCase()} collaboration.`,
      });
    }

    const { funding, prototype, technical, research, testing, mentorship, implementation, other } = request.body;

    const currentCommitments = collaboration.supportCommitments || {};

    if (funding) {
      currentCommitments.funding = {
        amount: Number(funding.amount) || 0,
        description: typeof funding.description === "string" ? funding.description.trim() : "",
      };
    }

    if (typeof prototype === "string") currentCommitments.prototype = prototype.trim();
    if (typeof technical === "string") currentCommitments.technical = technical.trim();
    if (typeof research === "string") currentCommitments.research = research.trim();
    if (typeof testing === "string") currentCommitments.testing = testing.trim();
    if (typeof implementation === "string") currentCommitments.implementation = implementation.trim();
    if (typeof other === "string") currentCommitments.other = other.trim();

    if (mentorship) {
      if (mentorship.mentorId) {
        if (!mongoose.Types.ObjectId.isValid(mentorship.mentorId)) {
          return response.status(400).json({ success: false, message: "Mentor ID is invalid." });
        }
        const mentor = await User.exists({
          _id: mentorship.mentorId,
          organizationId: request.user.organizationId,
          role: { $in: ["INDUSTRY_MENTOR", "INDUSTRY_ADMIN"] },
          status: { $in: ["APPROVED", "ACTIVE"] },
        });
        if (!mentor) {
          return response.status(400).json({ success: false, message: "Select an active mentor from your organization." });
        }
      }
      currentCommitments.mentorship = {
        mentorId: mentorship.mentorId || currentCommitments.mentorship?.mentorId,
        notes: typeof mentorship.notes === "string" ? mentorship.notes.trim() : (currentCommitments.mentorship?.notes || ""),
      };

      // Also assign mentor to Project assignedIndustryMentors if valid
      if (mentorship.mentorId) {
        await Project.findByIdAndUpdate(collaboration.projectId, {
          $addToSet: { assignedIndustryMentors: mentorship.mentorId },
        });
      }
    }

    collaboration.supportCommitments = currentCommitments;
    // Advance to ACTIVE once support commitments are recorded
    if (collaboration.status === "APPROVED") {
      collaboration.status = "ACTIVE";
    }

    await collaboration.save();

    return response.status(200).json({
      success: true,
      message: "Collaboration support commitments updated successfully.",
      data: collaboration,
    });
  } catch (error) {
    return next(error);
  }
}

// 10. Industry Overview / Analytics
export async function getIndustryOverview(request, response, next) {
  try {
    const industryId = request.user.organizationId;
    const industry = await Industry.findById(industryId).select("domains").lean();
    const domains = industry?.domains || [];

    const [
      matchingHeisCount,
      allCollaborations,
    ] = await Promise.all([
      Institution.countDocuments(domains.length > 0 ? { domains: { $in: domains } } : {}),
      IndustryCollaboration.find({ industryId }).select("status capabilitiesOffered").lean(),
    ]);

    const activeCount = allCollaborations.filter((c) => ["APPROVED", "ACTIVE"].includes(c.status)).length;
    const pendingCount = allCollaborations.filter((c) => c.status === "PENDING").length;
    const completedCount = allCollaborations.filter((c) => c.status === "COMPLETED").length;

    // Capabilities breakdown
    const capabilityCounts = {};
    for (const c of allCollaborations) {
      for (const cap of (c.capabilitiesOffered || [])) {
        capabilityCounts[cap] = (capabilityCounts[cap] || 0) + 1;
      }
    }

    return response.status(200).json({
      success: true,
      data: {
        matchingHeisCount,
        totalCollaborations: allCollaborations.length,
        activeCollaborations: activeCount,
        pendingRequests: pendingCount,
        completedProjects: completedCount,
        capabilityCounts,
      },
    });
  } catch (error) {
    return next(error);
  }
}

// 11. Get Industry Team / Mentors
export async function getIndustryMentors(request, response, next) {
  try {
    const mentors = await User.find({
      organizationId: request.user.organizationId,
      role: { $in: ["INDUSTRY_MENTOR", "INDUSTRY_ADMIN"] },
      status: { $in: ["APPROVED", "ACTIVE"] },
    })
      .select("name email phone role")
      .lean();

    return response.status(200).json({ success: true, data: mentors });
  } catch (error) {
    return next(error);
  }
}
