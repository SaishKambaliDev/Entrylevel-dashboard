import crypto from "crypto";
import User from "../models/User.js";

function verifyToken(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("Authentication is not configured.");

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expectedSignature = crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  if (signature.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!claims.sub || !claims.exp || claims.exp <= Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch (_error) {
    return null;
  }
}

export async function authenticate(request, response, next) {
  try {
    const authorization = request.headers.authorization || "";
    if (!authorization.startsWith("Bearer ")) return response.status(401).json({ success: false, message: "Authentication is required." });

    const claims = verifyToken(authorization.slice(7));
    if (!claims) return response.status(401).json({ success: false, message: "Your session is invalid or has expired." });

    const user = await User.findById(claims.sub);
    if (!user) return response.status(401).json({ success: false, message: "Your account could not be found." });
    request.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireSystemAdmin(request, response, next) {
  if (request.user.role !== "SYSTEM_ADMIN" || !["ACTIVE", "APPROVED"].includes(request.user.status)) {
    return response.status(403).json({ success: false, message: "System Admin access is required." });
  }
  return next();
}

export function requireCitizen(request, response, next) {
  if (request.user.role !== "CITIZEN") {
    return response.status(403).json({ success: false, message: "Citizen access is required." });
  }
  return next();
}

export function requireHei(request, response, next) {
  if (!["HEI_ADMIN", "FACULTY", "STUDENT"].includes(request.user.role)) {
    return response.status(403).json({ success: false, message: "Higher Education Institution access is required." });
  }
  if (!request.user.institutionId) {
    return response.status(403).json({ success: false, message: "Your account is not associated with an institution." });
  }
  return next();
}

export function requireHeiAdmin(request, response, next) {
  if (request.user.role !== "HEI_ADMIN") {
    return response.status(403).json({ success: false, message: "HEI Administrator access is required." });
  }
  if (!request.user.institutionId) {
    return response.status(403).json({ success: false, message: "Your account is not associated with an institution." });
  }
  return next();
}

export async function requireIndustry(request, response, next) {
  if (!["INDUSTRY_ADMIN", "INDUSTRY_MENTOR"].includes(request.user.role)) {
    return response.status(403).json({ success: false, message: "Industry organization access is required." });
  }
  if (!request.user.organizationId) {
    if (request.user.organizationName) {
      const Industry = (await import("../models/Industry.js")).default;
      const found = await Industry.findOne({ organizationName: new RegExp(`^${request.user.organizationName}$`, "i") });
      if (found) {
        request.user.organizationId = found._id;
        await request.user.save();
      }
    }
  }
  if (!request.user.organizationId) {
    return response.status(403).json({ success: false, message: "Your account is not associated with an industry organization." });
  }
  return next();
}

export function requireIndustryAdmin(request, response, next) {
  if (request.user.role !== "INDUSTRY_ADMIN") {
    return response.status(403).json({ success: false, message: "Industry Administrator access is required." });
  }
  if (!request.user.organizationId) {
    return response.status(403).json({ success: false, message: "Your account is not associated with an industry organization." });
  }
  return next();
}

export function requireGovernment(request, response, next) {
  if (request.user.role !== "GOVERNMENT") {
    return response.status(403).json({ success: false, message: "Government access is required." });
  }
  return next();
}

export function requireCitizenOrGovernment(request, response, next) {
  if (!["CITIZEN", "GOVERNMENT"].includes(request.user.role)) {
    return response.status(403).json({ success: false, message: "Citizen or Government access is required." });
  }
  return next();
}
