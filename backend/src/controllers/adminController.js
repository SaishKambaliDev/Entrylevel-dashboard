import User from "../models/User.js";

const safeUser = (user) => {
  const { passwordHash, __v, ...publicUser } = user.toObject();
  return publicUser;
};

export async function getPendingUsers(_request, response, next) {
  try {
    const users = await User.find({ status: "PENDING_VERIFICATION", role: { $ne: "SYSTEM_ADMIN" } })
      .sort({ createdAt: -1 })
      .select("name email phone role status institutionName aisheCode organizationName organizationType governmentLevel department districtName createdAt updatedAt")
      .lean();
    return response.status(200).json({ success: true, data: users });
  } catch (error) {
    return next(error);
  }
}

export async function reviewPendingUser(request, response, next) {
  try {
    const { decision } = request.body;
    const status = decision === "approve" ? "APPROVED" : decision === "reject" ? "REJECTED" : "";
    if (!status) return response.status(400).json({ success: false, message: "Decision must be approve or reject." });

    const user = await User.findOneAndUpdate(
      { _id: request.params.userId, status: "PENDING_VERIFICATION", role: { $ne: "SYSTEM_ADMIN" } },
      { status },
      { new: true },
    );
    if (!user) return response.status(404).json({ success: false, message: "A pending account with this ID was not found." });
    return response.status(200).json({ success: true, data: { user: safeUser(user) } });
  } catch (error) {
    return next(error);
  }
}
