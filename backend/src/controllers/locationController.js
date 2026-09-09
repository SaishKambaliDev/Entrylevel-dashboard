import mongoose from "mongoose";
import District from "../models/District.js";
import Subdivision from "../models/Subdivision.js";
import Block from "../models/Block.js";
import Village from "../models/Village.js";
import Ulb from "../models/Ulb.js";

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

// ─── Normalization helpers ───────────────────────────────────────────────────

function normalizeAdminName(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/['"'`]/g, "")
    .replace(/\b(district|dist|zila|zilla|block|subdivision|tehsil|mandal|nagar|nigam|parishad|panchayat|corporation|municipality|municipal)\b/gi, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalCompare(str1, str2) {
  const n1 = normalizeAdminName(str1);
  const n2 = normalizeAdminName(str2);
  if (!n1 || !n2) return false;
  if (n1 === n2) return true;
  const compact1 = n1.replace(/\s+/g, "");
  const compact2 = n2.replace(/\s+/g, "");
  return compact1 === compact2;
}

const DISTRICT_ALIASES = {
  eastsinghbhum: "eastsinghbhum",
  purbisinghbhum: "eastsinghbhum",
  westsinghbhum: "westsinghbhum",
  pashchimisinghbhum: "westsinghbhum",
  seraikelakharsawan: "saraikelakharsawan",
  saraikelakharsawan: "saraikelakharsawan",
  sahibganj: "sahebganj",
  sahebganj: "sahebganj",
  hazaribag: "hazaribagh",
  hazaribagh: "hazaribagh",
  kodarma: "koderma",
  koderma: "koderma",
  palamau: "palamu",
  palamu: "palamu",
};

function normalizeDistrict(name) {
  const norm = normalizeAdminName(name).replace(/\s+/g, "");
  return DISTRICT_ALIASES[norm] || norm;
}

// ─── Geography query helpers ─────────────────────────────────────────────────

function districtQuery(request, response) {
  const districtId = typeof request.query.districtId === "string" ? request.query.districtId : "";
  if (!districtId) {
    response.status(400).json({ success: false, message: "Query parameter districtId is required." });
    return null;
  }
  if (!isObjectId(districtId)) {
    response.status(400).json({ success: false, message: "districtId must be a valid MongoDB ObjectId." });
    return null;
  }
  return districtId;
}

export async function getDistricts(_request, response, next) {
  try {
    const districts = await District.find().select("_id name lgdCode state").sort({ name: 1 }).lean();
    response.status(200).json({ success: true, data: districts });
  } catch (error) { next(error); }
}

export async function getSubdivisions(request, response, next) {
  try {
    const districtId = districtQuery(request, response);
    if (!districtId) return;
    if (!await District.exists({ _id: districtId })) return response.status(404).json({ success: false, message: "District not found." });
    const subdivisions = await Subdivision.find({ districtId }).select("_id name lgdCode districtId state").sort({ name: 1 }).lean();
    return response.status(200).json({ success: true, data: subdivisions });
  } catch (error) { return next(error); }
}

export async function getBlocks(request, response, next) {
  try {
    const districtId = districtQuery(request, response);
    if (!districtId) return;
    if (!await District.exists({ _id: districtId })) return response.status(404).json({ success: false, message: "District not found." });
    const subdivisionId = typeof request.query.subdivisionId === "string" ? request.query.subdivisionId : "";
    if (subdivisionId && !isObjectId(subdivisionId)) return response.status(400).json({ success: false, message: "subdivisionId must be a valid MongoDB ObjectId." });
    const blocks = await Block.find({ districtId, ...(subdivisionId ? { subdivisionIds: subdivisionId } : {}) }).select("_id name lgdCode districtId subdivisionIds state").sort({ name: 1 }).lean();
    return response.status(200).json({ success: true, data: blocks });
  } catch (error) { return next(error); }
}

export async function getVillages(request, response, next) {
  try {
    const blockId = typeof request.query.blockId === "string" ? request.query.blockId : "";
    if (!blockId) return response.status(400).json({ success: false, message: "Query parameter blockId is required." });
    if (!isObjectId(blockId)) return response.status(400).json({ success: false, message: "blockId must be a valid MongoDB ObjectId." });
    if (!await Block.exists({ _id: blockId })) return response.status(404).json({ success: false, message: "Block not found." });
    const villages = await Village.find({ blockId }).select("_id name lgdCode blockId subdivisionId districtId state").sort({ name: 1 }).lean();
    return response.status(200).json({ success: true, data: villages });
  } catch (error) { return next(error); }
}

export async function getUlbs(request, response, next) {
  try {
    const districtId = districtQuery(request, response);
    if (!districtId) return;
    if (!await District.exists({ _id: districtId })) return response.status(404).json({ success: false, message: "District not found." });
    const ulbs = await Ulb.find({ districtId }).select("_id name lgdCode districtId state").sort({ name: 1 }).lean();
    return response.status(200).json({ success: true, data: ulbs });
  } catch (error) { return next(error); }
}

// ─── Location resolver ───────────────────────────────────────────────────────

export async function resolveLocation(request, response, next) {
  try {
    const { latitude, longitude } = request.body || {};
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return response.status(400).json({
        success: false,
        message: "latitude and longitude must be valid geographic coordinates.",
      });
    }

    // ── Call Nominatim ──────────────────────────────────────────────────────
    const nominatimUrl = new URL("https://nominatim.openstreetmap.org/reverse");
    nominatimUrl.searchParams.set("lat", String(latitude));
    nominatimUrl.searchParams.set("lon", String(longitude));
    nominatimUrl.searchParams.set("format", "jsonv2");
    nominatimUrl.searchParams.set("addressdetails", "1");

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 12000);
    let upstreamRes;
    try {
      upstreamRes = await fetch(nominatimUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          // Nominatim ToS requires a descriptive User-Agent
          "User-Agent": "JanSamadhan/1.0 (Jharkhand grievance platform; contact@jansamadhan.jharkhand.gov.in)",
        },
        signal: abortController.signal,
      });
    } catch (_err) {
      return response.status(200).json({
        success: true,
        data: {
          resolved: false,
          requiresManualFallback: true,
          message: "Automatic location resolution is currently unavailable. Please select your location manually.",
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!upstreamRes.ok) {
      return response.status(200).json({
        success: true,
        data: {
          resolved: false,
          requiresManualFallback: true,
          message: "Could not resolve coordinates at this time. Please select your location manually.",
        },
      });
    }

    let payload;
    try {
      payload = await upstreamRes.json();
    } catch (_err) {
      return response.status(200).json({
        success: true,
        data: {
          resolved: false,
          requiresManualFallback: true,
          message: "Unable to parse response from geocoding service. Please select your location manually.",
        },
      });
    }

    // Nominatim returns `address` as a nested object when addressdetails=1
    const addr = payload?.address;
    if (!addr) {
      return response.status(200).json({
        success: true,
        data: {
          resolved: false,
          requiresManualFallback: true,
          message: "No address details found for these coordinates. Please select your location manually.",
        },
      });
    }

    // ── Jharkhand state guard ───────────────────────────────────────────────
    const stateName = normalizeAdminName(addr.state);
    if (stateName && stateName !== "jharkhand") {
      return response.status(200).json({
        success: true,
        data: {
          resolved: false,
          requiresManualFallback: true,
          message: `The selected coordinates appear to be in ${addr.state || "another state"}, outside Jharkhand.`,
        },
      });
    }


    // ── District resolution ─────────────────────────────────────────────────
    // These fields are clues for what administrative district we are in.
    // state_district is the most reliable field for Indian districts in Nominatim.
    const districtClues = [
      addr.state_district,
      addr.county,
      addr.city_district,
      addr.district,
      addr.city,
      addr.municipality,
      addr.town,
    ].filter((v) => typeof v === "string" && v.trim());

    let matchedDistrict = null;
    const allDistricts = await District.find().lean();

    for (const d of allDistricts) {
      const dNorm = normalizeDistrict(d.name);
      for (const clue of districtClues) {
        if (normalizeDistrict(clue) === dNorm) {
          if (matchedDistrict && String(matchedDistrict._id) !== String(d._id)) {
            // Two different districts matched — ambiguous, discard
            matchedDistrict = null;
            break;
          }
          matchedDistrict = d;
        }
      }
      if (matchedDistrict === null && allDistricts.indexOf(d) > 0) break; // ambiguity already detected
    }

    // ── Block resolution ────────────────────────────────────────────────────
    // county often maps to block in rural India. Treat it as a clue only.
    const blockClues = [
      addr.county,
      addr.city_district,
      addr.town,
      addr.village,
    ].filter((v) => typeof v === "string" && v.trim());

    let matchedBlock = null;
    if (blockClues.length > 0) {
      const blockScope = matchedDistrict ? { districtId: matchedDistrict._id } : {};
      const candidateBlocks = await Block.find(blockScope).lean();
      const matchingBlocks = [];

      for (const b of candidateBlocks) {
        for (const clue of blockClues) {
          if (canonicalCompare(b.name, clue)) {
            matchingBlocks.push(b);
            break;
          }
        }
      }

      if (matchingBlocks.length === 1) {
        matchedBlock = matchingBlocks[0];
        // If we didn't resolve the district from districtClues but the block is unique, derive it
        if (!matchedDistrict) {
          matchedDistrict = await District.findById(matchedBlock.districtId).lean();
        }
      }
      // If multiple blocks match, discard — we cannot safely pick one
    }

    // ── Subdivision resolution ──────────────────────────────────────────────
    let matchedSubdivision = null;
    const subdivisionClues = [
      addr.county,
      addr.city_district,
      addr.town,
      addr.municipality,
    ].filter((v) => typeof v === "string" && v.trim());

    if (matchedDistrict && subdivisionClues.length > 0) {
      const candidateSubs = await Subdivision.find({ districtId: matchedDistrict._id }).lean();
      const matchingSubs = [];
      for (const s of candidateSubs) {
        for (const clue of subdivisionClues) {
          if (canonicalCompare(s.name, clue)) {
            matchingSubs.push(s);
            break;
          }
        }
      }
      if (matchingSubs.length === 1) matchedSubdivision = matchingSubs[0];
    }


    // ── ULB resolution ──────────────────────────────────────────────────────
    // Try ULB before village — if municipality/city/town uniquely identifies a ULB, prefer it.
    // First try within the matched district, then as a global fallback (still validating against LGD).
    const urbanClues = [
      addr.municipality,
      addr.city,
      addr.town,
      addr.suburb,
    ].filter((v) => typeof v === "string" && v.trim());

    if (urbanClues.length > 0) {
      // helper to find matching ulbs from a list
      const findMatchedUlbs = (ulbs) => {
        const matches = [];
        for (const ulb of ulbs) {
          for (const clue of urbanClues) {
            if (canonicalCompare(ulb.name, clue)) {
              matches.push(ulb);
              break;
            }
          }
        }
        return matches;
      };

      // 1) If a district was already inferred, try matching ULB within it
      if (matchedDistrict) {
        const districtUlbs = await Ulb.find({ districtId: matchedDistrict._id }).lean();
        const matchedUlbs = findMatchedUlbs(districtUlbs);
        if (matchedUlbs.length === 1) {
          const ulb = matchedUlbs[0];
          return response.status(200).json({
            success: true,
            data: {
              resolved: true,
              requiresManualFallback: false,
              matchMethod: "district-ulb",
              geography: {
                districtId: matchedDistrict._id,
                districtName: matchedDistrict.name,
                // If a subdivision was resolved earlier from clues, include it. Do not invent one.
                subdivisionId: matchedSubdivision?._id ?? null,
                subdivisionName: matchedSubdivision?.name ?? null,
                blockId: null,
                blockName: null,
                villageId: null,
                villageName: null,
                ulbId: ulb._id,
                ulbName: ulb.name,
              },
            },
          });
        }
      }

      // 2) If not found within district, attempt a global ULB match (unique across all ULBs)
      const allUlbs = await Ulb.find().lean();
      const globallyMatchedUlbs = findMatchedUlbs(allUlbs);
      if (globallyMatchedUlbs.length === 1) {
        const ulb = globallyMatchedUlbs[0];
        // Validate and derive district from the matched ULB
        const derivedDistrict = await District.findById(ulb.districtId).lean();
        if (derivedDistrict) {
          // Try to match subdivision inside the derived district if we have subdivision clues
          let derivedSubdivision = null;
          const subdivisionClues = [
            addr.county,
            addr.city_district,
            addr.town,
            addr.municipality,
          ].filter((v) => typeof v === "string" && v.trim());

          if (subdivisionClues.length > 0) {
            const candidateSubs = await Subdivision.find({ districtId: derivedDistrict._id }).lean();
            const matchingSubs = [];
            for (const s of candidateSubs) {
              for (const clue of subdivisionClues) {
                if (canonicalCompare(s.name, clue)) {
                  matchingSubs.push(s);
                  break;
                }
              }
            }
            if (matchingSubs.length === 1) derivedSubdivision = matchingSubs[0];
          }

          return response.status(200).json({
            success: true,
            data: {
              resolved: true,
              requiresManualFallback: false,
              matchMethod: "ulb-global",
              geography: {
                districtId: derivedDistrict._id,
                districtName: derivedDistrict.name,
                subdivisionId: derivedSubdivision?._id ?? null,
                subdivisionName: derivedSubdivision?.name ?? null,
                blockId: null,
                blockName: null,
                villageId: null,
                villageName: null,
                ulbId: ulb._id,
                ulbName: ulb.name,
              },
            },
          });
        }
      }
    }

    // ── Village candidate names ─────────────────────────────────────────────
    // These are clues for the village/hamlet name — NOT used alone for matching.
    const villageClues = [
      addr.hamlet,
      addr.village,
      addr.suburb,
      addr.locality,
    ].filter((v) => typeof v === "string" && v.trim());

    // ── 7B: District + Block + Village ─────────────────────────────────────
    if (matchedDistrict && matchedBlock && villageClues.length > 0) {
      const villagesInBlock = await Village.find({
        districtId: matchedDistrict._id,
        blockId: matchedBlock._id,
      }).lean();

      let resolvedVillage = null;
      let ambiguityDetected = false;

      for (const clue of villageClues) {
        const matches = villagesInBlock.filter((v) => canonicalCompare(v.name, clue));
        if (matches.length === 1) { resolvedVillage = matches[0]; break; }
        if (matches.length > 1) { ambiguityDetected = true; break; }
      }

      if (resolvedVillage && !ambiguityDetected) {
        const finalSub =
          matchedSubdivision ||
          (await Subdivision.findById(resolvedVillage.subdivisionId).lean());

        return response.status(200).json({
          success: true,
          data: {
            resolved: true,
            requiresManualFallback: false,
            matchMethod: "district-block-village",
            geography: {
              districtId: matchedDistrict._id,
              districtName: matchedDistrict.name,
              subdivisionId: finalSub?._id ?? null,
              subdivisionName: finalSub?.name ?? null,
              blockId: matchedBlock._id,
              blockName: matchedBlock.name,
              villageId: resolvedVillage._id,
              villageName: resolvedVillage.name,
              ulbId: null,
              ulbName: null,
            },
          },
        });
      }

      // Village ambiguous but we have District + Block — partial resolution
      if (ambiguityDetected) {
        return response.status(200).json({
          success: true,
          data: {
            resolved: false,
            requiresManualFallback: true,
            partialResolution: {
              districtId: matchedDistrict._id,
              districtName: matchedDistrict.name,
              subdivisionId: matchedSubdivision?._id ?? null,
              subdivisionName: matchedSubdivision?.name ?? null,
              blockId: matchedBlock._id,
              blockName: matchedBlock.name,
            },
            message: "District and block were identified, but the village could not be determined uniquely. Please select your village.",
          },
        });
      }

      // No village name clue matched anything in this block — partial resolution
      return response.status(200).json({
        success: true,
        data: {
          resolved: false,
          requiresManualFallback: true,
          partialResolution: {
            districtId: matchedDistrict._id,
            districtName: matchedDistrict.name,
            subdivisionId: matchedSubdivision?._id ?? null,
            subdivisionName: matchedSubdivision?.name ?? null,
            blockId: matchedBlock._id,
            blockName: matchedBlock.name,
          },
          message: "District and block were identified. Please select your village.",
        },
      });
    }

    // ── 7C: District + Subdivision + Village (no Block) ─────────────────────
    if (matchedDistrict && matchedSubdivision && !matchedBlock && villageClues.length > 0) {
      const villagesInSub = await Village.find({
        districtId: matchedDistrict._id,
        subdivisionId: matchedSubdivision._id,
      }).lean();

      let resolvedVillage = null;
      let ambiguityDetected = false;

      for (const clue of villageClues) {
        const matches = villagesInSub.filter((v) => canonicalCompare(v.name, clue));
        if (matches.length === 1) { resolvedVillage = matches[0]; break; }
        if (matches.length > 1) { ambiguityDetected = true; break; }
      }

      if (resolvedVillage && !ambiguityDetected) {
        const finalBlock = await Block.findById(resolvedVillage.blockId).lean();
        return response.status(200).json({
          success: true,
          data: {
            resolved: true,
            requiresManualFallback: false,
            matchMethod: "district-subdivision-village",
            geography: {
              districtId: matchedDistrict._id,
              districtName: matchedDistrict.name,
              subdivisionId: matchedSubdivision._id,
              subdivisionName: matchedSubdivision.name,
              blockId: finalBlock?._id ?? null,
              blockName: finalBlock?.name ?? null,
              villageId: resolvedVillage._id,
              villageName: resolvedVillage.name,
              ulbId: null,
              ulbName: null,
            },
          },
        });
      }

      if (ambiguityDetected || resolvedVillage === null) {
        return response.status(200).json({
          success: true,
          data: {
            resolved: false,
            requiresManualFallback: true,
            partialResolution: {
              districtId: matchedDistrict._id,
              districtName: matchedDistrict.name,
              subdivisionId: matchedSubdivision._id,
              subdivisionName: matchedSubdivision.name,
              blockId: null,
              blockName: null,
            },
            message: "District was identified. Please select your block and village.",
          },
        });
      }
    }

    // ── 7D: District + Village (unique across the entire district) ───────────
    if (matchedDistrict && villageClues.length > 0) {
      let resolvedVillage = null;
      let ambiguityDetected = false;

      for (const clue of villageClues) {
        const districtVillages = await Village.find({ districtId: matchedDistrict._id }).lean();
        const matches = districtVillages.filter((v) => canonicalCompare(v.name, clue));
        if (matches.length === 1) { resolvedVillage = matches[0]; break; }
        if (matches.length > 1) { ambiguityDetected = true; break; }
      }

      if (resolvedVillage && !ambiguityDetected) {
        const finalBlock = await Block.findById(resolvedVillage.blockId).lean();
        const finalSub = await Subdivision.findById(resolvedVillage.subdivisionId).lean();
        return response.status(200).json({
          success: true,
          data: {
            resolved: true,
            requiresManualFallback: false,
            matchMethod: "district-village",
            geography: {
              districtId: matchedDistrict._id,
              districtName: matchedDistrict.name,
              subdivisionId: finalSub?._id ?? null,
              subdivisionName: finalSub?.name ?? null,
              blockId: finalBlock?._id ?? null,
              blockName: finalBlock?.name ?? null,
              villageId: resolvedVillage._id,
              villageName: resolvedVillage.name,
              ulbId: null,
              ulbName: null,
            },
          },
        });
      }
    }

    // ── 7E: District only — partial resolution ────────────────────────────
    if (matchedDistrict) {
      return response.status(200).json({
        success: true,
        data: {
          resolved: false,
          requiresManualFallback: true,
          partialResolution: {
            districtId: matchedDistrict._id,
            districtName: matchedDistrict.name,
            subdivisionId: null,
            subdivisionName: null,
            blockId: null,
            blockName: null,
          },
          message: "District was identified. Please select your block and village.",
        },
      });
    }

    // ── 7F: Nothing resolved ────────────────────────────────────────────────
    return response.status(200).json({
      success: true,
      data: {
        resolved: false,
        requiresManualFallback: true,
        message: "Location could not be matched to an administrative area. Please select your location manually.",
      },
    });
  } catch (error) {
    return next(error);
  }
}
