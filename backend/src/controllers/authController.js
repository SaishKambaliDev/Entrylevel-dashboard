import crypto from "crypto";
import bcrypt from "bcryptjs";
import District from "../models/District.js";
import Industry from "../models/Industry.js";
import Institution from "../models/Institution.js";
import Block from "../models/Block.js";
import User from "../models/User.js";
import Village from "../models/Village.js";
import Ulb from "../models/Ulb.js";

const PUBLIC_ROLES = ["CITIZEN", "HEI_ADMIN", "FACULTY", "STUDENT", "INDUSTRY_ADMIN", "INDUSTRY_MENTOR", "GOVERNMENT"];
const GOVERNMENT_LEVELS = ["LOCAL", "RURAL", "BLOCK", "DISTRICT", "STATE"];

const normalizeEmail = (email) => typeof email === "string" ? email.trim().toLowerCase() : "";
const cleanText = (value) => typeof value === "string" ? value.trim() : "";
const safeUser = (user) => {
  const { passwordHash, __v, ...publicUser } = user.toObject();
  return { ...publicUser, language: publicUser.language || "en" };
};

function validationError(response, message) {
  return response.status(400).json({ success: false, message });
}

function createAuthenticationToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("Authentication is not configured.");
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresInSeconds = 60 * 60 * 24;
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({ sub: user._id.toString(), role: user.role, iat: issuedAt, exp: issuedAt + expiresInSeconds });
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function statusForRole(role) {
  return role === "CITIZEN" ? "ACTIVE" : "PENDING_VERIFICATION";
}

export async function register(request, response, next) {
  try {
    const { name, email, phone, password, role } = request.body;
    const normalizedEmail = normalizeEmail(email);
    const normalizedName = cleanText(name);
    const normalizedPhone = cleanText(phone);

    if (!normalizedName || !normalizedEmail || !normalizedPhone || typeof password !== "string") {
      return validationError(response, "Name, email, phone number, and password are required.");
    }
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) return validationError(response, "Enter a valid email address.");
    if (password.length < 8) return validationError(response, "Password must be at least 8 characters long.");
    if (!PUBLIC_ROLES.includes(role)) return validationError(response, "The selected role is not valid for public registration.");

    const existingUser = await User.exists({ email: normalizedEmail });
    if (existingUser) return response.status(409).json({ success: false, message: "An account with this email already exists." });

    const roleData = {};
    if (["HEI_ADMIN", "FACULTY", "STUDENT"].includes(role)) {
      if (!request.body.institutionId) return validationError(response, "Select an institution to continue.");
      const institution = await Institution.findById(request.body.institutionId).select("institutionName aisheCode").lean();
      if (!institution) return validationError(response, "The selected institution was not found.");
      roleData.institutionId = institution._id;
      roleData.institutionName = institution.institutionName;
      roleData.aisheCode = institution.aisheCode;
    }

    if (role === "INDUSTRY_MENTOR") {
      if (!request.body.organizationId) return validationError(response, "Select an organization to continue.");
      const organization = await Industry.findById(request.body.organizationId).select("organizationName organizationType").lean();
      if (!organization) return validationError(response, "The selected organization was not found.");
      roleData.organizationId = organization._id;
      roleData.organizationName = organization.organizationName;
      roleData.organizationType = organization.organizationType;
    }

    if (role === "INDUSTRY_ADMIN") {
      const organizationName = cleanText(request.body.organizationName);
      const organizationType = cleanText(request.body.organizationType);
      if (!organizationName || !organizationType) return validationError(response, "Organization name and type are required.");
      roleData.organizationName = organizationName;
      roleData.organizationType = organizationType;

      let industry = await Industry.findOne({ organizationName: new RegExp(`^${organizationName}$`, "i") });
      if (!industry) {
        let districtId = request.body.districtId;
        if (!districtId) {
          const defaultDistrict = await District.findOne({ name: "Ranchi" }) || await District.findOne();
          districtId = defaultDistrict?._id;
        }
        industry = await Industry.create({
          organizationName,
          organizationType,
          district: districtId,
          state: "Jharkhand",
        });
      }
      roleData.organizationId = industry._id;
    }

    if (role === "GOVERNMENT") {
      const governmentLevel = cleanText(request.body.governmentLevel).toUpperCase();
      const department = cleanText(request.body.department);
      if (!GOVERNMENT_LEVELS.includes(governmentLevel) || !department) {
        return validationError(response, "Government level and department are required.");
      }
      roleData.governmentLevel = governmentLevel;
      roleData.department = department;
      if (governmentLevel === "STATE") roleData.state = "Jharkhand";
      if (governmentLevel !== "STATE") {
        if (!request.body.districtId) return validationError(response, "Select a district to continue.");
        const district = await District.findById(request.body.districtId).select("name").lean();
        if (!district) return validationError(response, "The selected district was not found.");
        roleData.districtId = district._id;
        roleData.districtName = district.name;
      }

      if (governmentLevel === "LOCAL") {
        if (!request.body.ulbId) return validationError(response, "Select an urban local body to continue.");
        const ulb = await Ulb.findOne({ _id: request.body.ulbId, districtId: roleData.districtId }).select("_id").lean();
        if (!ulb) return validationError(response, "The selected urban local body does not belong to the selected district.");
        roleData.ulbId = ulb._id;
      }

      if (["BLOCK", "RURAL"].includes(governmentLevel)) {
        if (!request.body.blockId) return validationError(response, "Select a block to continue.");
        const block = await Block.findOne({ _id: request.body.blockId, districtId: roleData.districtId }).select("_id").lean();
        if (!block) return validationError(response, "The selected block does not belong to the selected district.");
        roleData.blockId = block._id;
      }

      if (governmentLevel === "RURAL") {
        if (!request.body.villageId) return validationError(response, "Select a village to continue.");
        const village = await Village.findOne({
          _id: request.body.villageId,
          districtId: roleData.districtId,
          blockId: roleData.blockId,
        }).select("_id").lean();
        if (!village) return validationError(response, "The selected village does not belong to the selected block.");
        roleData.villageId = village._id;
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name: normalizedName,
      email: normalizedEmail,
      phone: normalizedPhone,
      passwordHash,
      role,
      status: statusForRole(role),
      ...roleData,
    });

    return response.status(201).json({ success: true, data: { user: safeUser(user) } });
  } catch (error) {
    if (error?.code === 11000) return response.status(409).json({ success: false, message: "An account with this email already exists." });
    return next(error);
  }
}

export async function login(request, response, next) {
  try {
    const email = normalizeEmail(request.body.email);
    const { password } = request.body;
    if (!email || typeof password !== "string") return validationError(response, "Email and password are required.");

    const user = await User.findOne({ email }).select("+passwordHash");
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return response.status(401).json({ success: false, message: "Invalid email or password." });
    }
    if (user.status === "PENDING_VERIFICATION" || user.status === "REGISTERED") {
      return response.status(403).json({ success: false, message: "Your account is awaiting verification." });
    }
    if (user.status === "REJECTED") return response.status(403).json({ success: false, message: "Your account registration was rejected." });
    if (!["ACTIVE", "APPROVED"].includes(user.status)) return response.status(403).json({ success: false, message: "Your account is not available for login." });

    return response.status(200).json({ success: true, data: { token: createAuthenticationToken(user), user: safeUser(user) } });
  } catch (error) {
    return next(error);
  }
}

export async function updatePreferences(request, response, next) {
  try {
    const { language } = request.body;
    if (!["en", "hi", "sat"].includes(language)) {
      return validationError(response, "Choose a supported language.");
    }

    request.user.language = language;
    await request.user.save();
    return response.status(200).json({ success: true, data: { user: safeUser(request.user) } });
  } catch (error) {
    return next(error);
  }
}
