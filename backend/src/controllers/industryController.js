import Industry from "../models/Industry.js";

const industryFields = "_id organizationName organizationType district state";
const districtFields = "_id name state";

export async function getIndustries(_request, response, next) {
  try {
    const industries = await Industry.find()
      .select(industryFields)
      .populate("district", districtFields)
      .sort({ organizationName: 1 })
      .lean();

    response.status(200).json({ success: true, data: industries });
  } catch (error) {
    next(error);
  }
}

export async function searchIndustries(request, response, next) {
  try {
    const query = typeof request.query.q === "string" ? request.query.q.trim() : "";
    if (!query) {
      return response.status(400).json({ success: false, message: "Query parameter q is required." });
    }

    const searchExpression = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const industries = await Industry.find({
      $or: [{ organizationName: searchExpression }, { organizationType: searchExpression }],
    })
      .select(industryFields)
      .populate("district", districtFields)
      .sort({ organizationName: 1 })
      .limit(20)
      .lean();

    return response.status(200).json({ success: true, data: industries });
  } catch (error) {
    return next(error);
  }
}
