import mongoose from "mongoose";

/**
 * Local cache of users received from auth-service via RabbitMQ.
 * Avoids inter-service HTTP calls on every room request.
 */
const userCacheSchema = new mongoose.Schema(
    {
        _id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        email: {
            type: String,
            required: true,
        },
        fullName: {
            firstName: String,
            lastName: String,
        },
    },
    { timestamps: true }
);

const UserCache = mongoose.model("UserCache", userCacheSchema);
export default UserCache;