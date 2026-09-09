import Institution from "../models/Institution.js";

const institutionFields = "_id institutionName aisheCode institutionType district state";
const districtFields = "_id name state";

export async function getInstitutions(_request, response, next) {
  try {
    const institutions = await Institution.find()
      .select(institutionFields)
      .populate("district", districtFields)
      .sort({ institutionName: 1 })
      .lean();

    response.status(200).json({ success: true, data: institutions });
  } catch (error) {
    next(error);
  }
}

export async function searchInstitutions(request, response, next) {
  try {
    const query = typeof request.query.q === "string" ? request.query.q.trim() : "";
    if (!query) {
      return response.status(400).json({ success: false, message: "Query parameter q is required." });
    }

    const searchExpression = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const institutions = await Institution.find({
      $or: [{ institutionName: searchExpression }, { aisheCode: searchExpression }],
    })
      .select(institutionFields)
      .populate("district", districtFields)
      .sort({ institutionName: 1 })
      .limit(20)
      .lean();

    return response.status(200).json({ success: true, data: institutions });
  } catch (error) {
    return next(error);
  }
}
