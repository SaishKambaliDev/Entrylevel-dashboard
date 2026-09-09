import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import mongoose from "mongoose";
import Problem from "../models/Problem.js";
import Project from "../models/Project.js";
import Milestone from "../models/Milestone.js";
import District from "../models/District.js";
import Subdivision from "../models/Subdivision.js";
import Block from "../models/Block.js";
import Village from "../models/Village.js";
import Ulb from "../models/Ulb.js";
import { processProblem, problemSearchMetadata } from "../services/problemAiService.js";

const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;
const uploadDirectory = path.resolve("uploads/problems");
const allowedMimeTypes = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "video/mp4", "video/webm", "video/quicktime",
  "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

function clientError(message) {
  const error = new Error(message);
  error.isClientError = true;
  return error;
}

function parseMultipart(body, contentType) {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType || "");
  if (!boundaryMatch) throw clientError("Attachment data is invalid.");
  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const separator = Buffer.from("\r\n\r\n");
  const nextBoundary = Buffer.from(`\r\n--${boundaryMatch[1] || boundaryMatch[2]}`);
  const entries = [];
  let start = body.indexOf(boundary);
  if (start < 0) throw clientError("Attachment data is invalid.");
  start += boundary.length + 2;

  while (start < body.length) {
    const end = body.indexOf(nextBoundary, start);
    if (end < 0) break;
    const part = body.subarray(start, end);
    const headerEnd = part.indexOf(separator);
    if (headerEnd >= 0) {
      const headers = part.subarray(0, headerEnd).toString("utf8");
      const disposition = /content-disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i.exec(headers);
      if (disposition) {
        const mimeType = (/content-type:\s*([^\r\n;]+)/i.exec(headers)?.[1] || "text/plain").trim().toLowerCase();
        entries.push({ name: disposition[1], filename: disposition[2], mimeType, value: part.subarray(headerEnd + separator.length) });
      }
    }
    start = end + nextBoundary.length;
    if (body.subarray(start, start + 2).equals(Buffer.from("--"))) break;
    start += 2;
  }
  return entries;
}

function parseRequest(body, contentType) {
  const fields = {};
  const files = [];
  for (const entry of parseMultipart(body, contentType)) {
    if (entry.filename !== undefined) files.push(entry);
    else fields[entry.name] = entry.value.toString("utf8");
  }
  return { fields, files };
}

async function createProblemId() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const problemId = `JS-PROB-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    if (!(await Problem.exists({ problemId }))) return problemId;
  }
  throw new Error("Unable to generate a unique problem ID.");
}

async function validatedGeography(location) {
  const geography = location?.geography;
  if (!geography || typeof geography !== "object") return {};
  const ids = ["districtId", "subdivisionId", "blockId", "villageId", "ulbId"];
  for (const id of ids) {
    if (geography[id] != null && !mongoose.Types.ObjectId.isValid(geography[id])) throw clientError("The selected administrative location is invalid.");
  }
  if (!geography.districtId) throw clientError("Choose a complete administrative location.");
  const district = await District.findById(geography.districtId).lean();
  if (!district) throw clientError("The selected district no longer exists.");

  if (geography.ulbId) {
    if (geography.blockId || geography.villageId) throw clientError("Choose either a ULB or a village location.");
    const ulb = await Ulb.findOne({ _id: geography.ulbId, districtId: district._id }).lean();
    if (!ulb) throw clientError("The selected ULB does not belong to the selected district.");
    return { districtId: district._id, ulbId: ulb._id };
  }

  if (!geography.subdivisionId || !geography.blockId || !geography.villageId) throw clientError("Choose a district, subdivision, block, and village.");
  const subdivision = await Subdivision.findOne({ _id: geography.subdivisionId, districtId: district._id }).lean();
  const block = await Block.findOne({ _id: geography.blockId, districtId: district._id, subdivisionIds: geography.subdivisionId }).lean();
  const village = await Village.findOne({ _id: geography.villageId, districtId: district._id, subdivisionId: geography.subdivisionId, blockId: geography.blockId }).lean();
  if (!subdivision || !block || !village) throw clientError("The selected village hierarchy is inconsistent.");
  return { districtId: district._id, subdivisionId: subdivision._id, blockId: block._id, villageId: village._id };
}

export async function createProblem(request, response, next) {
  let savedFiles = [];
  let submissionKey = "";
  try {
    const { fields, files } = parseRequest(request.body, request.headers["content-type"]);
    const description = (fields.description || "").trim();
    if (!description) throw clientError("Please describe the problem.");
    if (description.length > 5000) throw clientError("Problem description must be 5,000 characters or fewer.");
    submissionKey = (fields.submissionKey || "").trim();
    if (submissionKey && !/^[a-zA-Z0-9-]{16,100}$/.test(submissionKey)) throw clientError("Submission key is invalid.");
    if (submissionKey) {
      const existing = await Problem.findOne({ reporterUserId: request.user._id, submissionKey }).select("problemId status ai.processingStatus").lean();
      if (existing) return response.status(200).json({ success: true, data: { problemId: existing.problemId, status: existing.status, processingStatus: existing.ai?.processingStatus, duplicateSubmission: true } });
    }

    let location;
    try { location = JSON.parse(fields.location || ""); } catch (_error) { throw clientError("Select a valid problem location."); }
    if (!Number.isFinite(location?.latitude) || !Number.isFinite(location?.longitude) || location.latitude < -90 || location.latitude > 90 || location.longitude < -180 || location.longitude > 180) {
      throw clientError("Select a valid problem location.");
    }
    const geography = await validatedGeography(location);

    const totalSize = files.reduce((total, file) => total + file.value.length, 0);
    if (totalSize > MAX_ATTACHMENT_BYTES) throw clientError("Total attachments must not exceed 100 MB.");
    for (const file of files) {
      if (!file.filename || !file.value.length) throw clientError("Attachments cannot be empty.");
      if (!allowedMimeTypes.has(file.mimeType)) throw clientError("One or more attachments have an unsupported file type.");
    }

    await fs.mkdir(uploadDirectory, { recursive: true });
    savedFiles = await Promise.all(files.map(async (file) => {
      const extension = path.extname(file.filename).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10);
      const filename = `${crypto.randomUUID()}${extension}`;
      await fs.writeFile(path.join(uploadDirectory, filename), file.value);
      return { filename, originalName: path.basename(file.filename).slice(0, 255), mimeType: file.mimeType, size: file.value.length, path: `/uploads/problems/${filename}` };
    }));

    const isAnonymous = fields.isAnonymous === "true";
    const problem = await Problem.create({
      problemId: await createProblemId(),
      description,
      // The reporter does not classify their own report; Gemini assigns a
      // predefined domain during asynchronous processing.
      domain: "OTHER",
      reporterUserId: request.user._id,
      ...(submissionKey ? { submissionKey } : {}),
      ai: { reporterUserIds: [request.user._id] },
      isAnonymous,
      ...(isAnonymous ? {} : { reporterSnapshot: { name: request.user.name, email: request.user.email, phone: request.user.phone } }),
      location: {
        latitude: location.latitude,
        longitude: location.longitude,
        ...(typeof location.displayName === "string" ? { displayName: location.displayName } : {}),
        ...(typeof location.district === "string" ? { district: location.district } : {}),
        ...geography,
      },
      attachments: savedFiles,
      status: "SUBMITTED",
      ...problemSearchMetadata(description),
    });

    // This is intentionally detached: API success never depends on Gemini.
    setImmediate(() => processProblem(problem._id).catch((error) => console.error("Problem AI processing failed:", error)));
    return response.status(201).json({ success: true, data: { problemId: problem.problemId, status: problem.status, processingStatus: "PENDING" } });
  } catch (error) {
    await Promise.all(savedFiles.map((file) => fs.unlink(path.join(uploadDirectory, file.filename)).catch(() => {})));
    if (error?.code === 11000 && submissionKey) {
      const existing = await Problem.findOne({ reporterUserId: request.user._id, submissionKey }).select("problemId status ai.processingStatus").lean();
      if (existing) return response.status(200).json({ success: true, data: { problemId: existing.problemId, status: existing.status, processingStatus: existing.ai?.processingStatus, duplicateSubmission: true } });
    }
    if (error.isClientError) return response.status(400).json({ success: false, message: error.message });
    if (["ValidationError", "CastError"].includes(error?.name)) return response.status(400).json({ success: false, message: "The report contains invalid data. Please review the fields and try again." });
    console.error("Problem submission failed:", error);
    return next(error);
  }
}

export async function retryAiProcessing(request, response, next) {
  try {
    const problem = await Problem.findOneAndUpdate(
      { problemId: request.params.id, reporterUserId: request.user._id, "ai.duplicateOf": null, "ai.processingStatus": { $in: ["FAILED", "NEEDS_REVIEW"] } },
      { $set: { status: "SUBMITTED", "ai.processingStatus": "PENDING", "ai.error": null } },
      { new: true },
    ).select("_id");
    if (!problem) return response.status(409).json({ success: false, message: "Only failed or review-required AI processing can be retried." });
    setImmediate(() => processProblem(problem._id).catch(() => {}));
    return response.status(202).json({ success: true, data: { processingStatus: "PENDING" } });
  } catch (error) { return next(error); }
}

const STATUS_DISPLAY_MAP = {
  SUBMITTED: "Submitted",
  AVAILABLE: "Available for HEIs",
  UNDER_REVIEW: "Under Review",
  ACCEPTED: "Under Review",
  UNDER_DEVELOPMENT: "Under Development",
  MILESTONE_PROGRESS: "Under Development",
  VALIDATION: "Validation",
  DEPLOYED: "Deployed",
  COMPLETED: "Completed",
  REJECTED: "On Hold",
  ON_HOLD: "On Hold",
  CANCELLED: "Cancelled",
  DUPLICATE: "Merged with an existing report",
};

export async function getMyProblems(request, response, next) {
  try {
    const problems = await Problem.find({ reporterUserId: request.user._id })
      .populate("acceptedByInstitutionId", "institutionName aisheCode")
      .sort({ createdAt: -1 })
      .lean();

    const problemIds = problems.map((p) => p._id);
    const projects = await Project.find({ problemId: { $in: problemIds } })
      .select("problemId status expectedCompletionDate")
      .lean();
    const projectMap = new Map(projects.map((pr) => [String(pr.problemId), pr]));

    const enriched = problems.map((p) => {
      const pr = projectMap.get(String(p._id));
      return {
        ...p,
        displayStatus: STATUS_DISPLAY_MAP[p.status] || p.status,
        assignedHeiName: p.acceptedByInstitutionId?.institutionName || null,
        expectedCompletionDate: pr?.expectedCompletionDate || null,
      };
    });

    return response.status(200).json({ success: true, data: enriched });
  } catch (error) {
    return next(error);
  }
}

export async function getMyProblemDetails(request, response, next) {
  try {
    const { id } = request.params;
    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const query = {
      ...(isObjectId ? { _id: id } : { problemId: id }),
      reporterUserId: request.user._id,
    };

    const problem = await Problem.findOne(query)
      .populate("acceptedByInstitutionId", "institutionName aisheCode")
      .lean();

    if (!problem) {
      return response.status(404).json({ success: false, message: "Problem not found." });
    }

    let project = null;
    let milestones = [];
    if (problem.acceptedByInstitutionId) {
      project = await Project.findOne({ problemId: problem._id })
        .select("title description status expectedCompletionDate actualCompletionDate proposedSolution")
        .lean();

      if (project) {
        milestones = await Milestone.find({ projectId: project._id })
          .select("title description expectedCompletionDate status completionPercentage updateDate remarks")
          .sort({ expectedCompletionDate: 1, createdAt: 1 })
          .lean();
      }
    }

    return response.status(200).json({
      success: true,
      data: {
        problem,
        displayStatus: STATUS_DISPLAY_MAP[problem.status] || problem.status,
        assignedHeiName: problem.acceptedByInstitutionId?.institutionName || null,
        project,
        milestones,
      },
    });
  } catch (error) {
    return next(error);
  }
}
